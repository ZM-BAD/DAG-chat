"""
Parent-children link update tests (issue #80)

Verifies that:
1. create_message_placeholders links the new user message into each parent's
   `children` via atomic $addToSet (no read-modify-write race)
2. Failed parent updates (e.g. parent doc missing) are detected and logged
   instead of silently ignored
3. The legacy insert path in save_conversation_to_database links parents the
   same way, with the assistant node's parent_ids written at insert time
"""

import asyncio
import logging
from types import SimpleNamespace

from bson import ObjectId

from backend.api.routes.chat import (
    create_message_placeholders,
    save_conversation_to_database,
)
from backend.database.mongodb_connection import MongoDBConnection
from backend.models.requests import ChatRequest


class FakeUpdateResult:
    """Minimal stand-in for pymongo.results.UpdateResult"""

    def __init__(self, acknowledged: bool = True, matched_count: int = 1):
        self.acknowledged = acknowledged
        self.matched_count = matched_count


class MockMongoDB(MongoDBConnection):
    """In-memory MongoDB mock with $addToSet semantics

    Subclasses MongoDBConnection so it satisfies the type annotations of the
    functions under test. Does not call the parent __init__ to avoid reading
    real config or opening connections.

    update_raw implements atomic $addToSet: repeated link operations
    accumulate instead of overwriting — the exact property the fix relies on
    to avoid lost updates between concurrent branch/merge requests.
    """

    def __init__(self):
        self._nodes: dict[str, dict] = {}
        self.update_raw_calls: list[tuple[dict, dict]] = []

    def connect(self):
        return True

    def insert(self, collection_name: str, document: dict):
        doc = dict(document)
        doc["_id"] = ObjectId()
        self._nodes[str(doc["_id"])] = doc
        return doc["_id"]

    def find(self, collection_name: str, query: dict, projection=None, sort=None):
        return [dict(node) for node in self._nodes.values()]

    def update_raw(self, collection_name: str, query: dict, update: dict):
        self.update_raw_calls.append((query, update))
        node = self._nodes.get(str(query["_id"]))
        if node is None:
            return FakeUpdateResult(matched_count=0)
        for field, value in update.get("$addToSet", {}).items():
            if field not in node or not isinstance(node[field], list):
                node[field] = []
            if value not in node[field]:
                node[field].append(value)
        return FakeUpdateResult(matched_count=1)


class TestCreateMessagePlaceholders:
    def test_single_parent_children_linked(self):
        db = MockMongoDB()
        parent_id = db.insert("message_node", {"role": "assistant", "content": "A"})
        user_id, _ = create_message_placeholders(
            db, "c1", "hello", "deepseek", [str(parent_id)]
        )

        parent = db._nodes[str(parent_id)]
        assert str(user_id) in parent["children"]
        # 更新必须走 $addToSet 原子操作，而不是 find + 整文档写回
        assert any("$addToSet" in update for _, update in db.update_raw_calls)
        # 新用户消息的 parent_ids 指向父节点
        user_node = db._nodes[str(user_id)]
        assert user_node["parent_ids"] == [str(parent_id)]

    def test_merge_question_links_all_parents(self):
        db = MockMongoDB()
        parent_ids = [
            db.insert("message_node", {"role": "assistant", "content": "A"}),
            db.insert("message_node", {"role": "assistant", "content": "B"}),
        ]
        user_id, _ = create_message_placeholders(
            db, "c1", "merge?", "deepseek", [str(p) for p in parent_ids]
        )

        for parent_id in parent_ids:
            assert str(user_id) in db._nodes[str(parent_id)]["children"]

    def test_atomic_add_to_set_keeps_all_branches(self):
        # 模拟两个并发分支请求：$addToSet 语义下第二次追加不会覆盖第一次的结果
        db = MockMongoDB()
        parent_id = db.insert("message_node", {"role": "assistant", "content": "A"})
        pid = str(parent_id)

        first_user_id, _ = create_message_placeholders(
            db, "c1", "q1", "deepseek", [pid]
        )
        second_user_id, _ = create_message_placeholders(
            db, "c1", "q2", "deepseek", [pid]
        )

        children = db._nodes[pid]["children"]
        assert str(first_user_id) in children
        assert str(second_user_id) in children

    def test_missing_parent_logs_error_but_keeps_flow(self, caplog):
        # 父节点不存在（matched_count=0）：占位符流程不中断，但失败必须被记录，
        # 而不是静默忽略
        db = MockMongoDB()
        user_id, ai_id = create_message_placeholders(
            db, "c1", "hi", "deepseek", [str(ObjectId())]
        )

        assert user_id is not None
        assert ai_id is not None
        with caplog.at_level(logging.ERROR):
            create_message_placeholders(db, "c1", "hi2", "deepseek", [str(ObjectId())])
        assert any(
            "Failed to link new message" in record.message for record in caplog.records
        )

    def test_user_ai_pair_linked(self):
        db = MockMongoDB()
        user_id, ai_id = create_message_placeholders(db, "c1", "hi", "deepseek")

        user_node = db._nodes[str(user_id)]
        assert user_node["children"] == [str(ai_id)]
        assert db._nodes[str(ai_id)]["parent_ids"] == [str(user_id)]

    def test_placeholder_without_parents_touches_no_other_nodes(self):
        db = MockMongoDB()
        other_id = db.insert(
            "message_node", {"role": "assistant", "content": "A", "children": []}
        )

        create_message_placeholders(db, "c1", "hi", "deepseek")

        assert db._nodes[str(other_id)]["children"] == []


class TestLegacySavePath:
    def test_legacy_parent_children_linked(self):
        async def run():
            db = MockMongoDB()
            mysql = SimpleNamespace(connect=lambda: False)
            parent_id = db.insert("message_node", {"role": "assistant", "content": "A"})
            request = ChatRequest(
                conversation_id="c1", message="hi", parent_ids=[str(parent_id)]
            )

            user_id, ai_id = await save_conversation_to_database(
                request, "answer", "", mysql, db, first_ask=True
            )

            assert str(user_id) in db._nodes[str(parent_id)]["children"]
            # assistant 节点的 parent_ids 随插入原子写入
            assert db._nodes[str(ai_id)]["parent_ids"] == [str(user_id)]
            # 用户消息的 children 关联助手消息
            assert db._nodes[str(user_id)]["children"] == [str(ai_id)]
            assert any("$addToSet" in update for _, update in db.update_raw_calls)

        asyncio.run(run())
