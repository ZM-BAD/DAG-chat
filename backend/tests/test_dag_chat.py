"""
DAG conversation structure test module

Test scenarios:
1. Complex DAG scenario (branching + merging)
2. Linked list scenario (linear conversation, no branching or merging)
3. Tree scenario (branching only, no merging)
"""

# pylint: disable=protected-access
# 测试代码需要访问 MockMongoDB 的受保护成员 _nodes

from collections import defaultdict
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class MockMessageNode:
    """Mock message node"""

    id: str
    role: str  # 'user' or 'assistant'
    content: str
    parent_ids: list[str] = field(default_factory=list)
    children: list[str] = field(default_factory=list)
    conversation_id: str = "test_conversation"
    model: str = "deepseek"


class MockMongoDB:
    """Mock MongoDB connection for testing DAG logic"""

    def __init__(self):
        self._nodes: dict[str, MockMessageNode] = {}

    def insert_node(self, node: MockMessageNode) -> str:
        """Insert a node"""
        self._nodes[node.id] = node
        return node.id

    def find(self, collection: str, query: dict) -> list:
        """Mock find operation"""
        if collection != "message_node":
            return []

        # 处理 _id 查询
        if "_id" in query:
            id_query = query["_id"]
            if "$in" in id_query:
                ids = id_query["$in"]
                return [
                    self._node_to_dict(self._nodes.get(str(id_obj)))
                    for id_obj in ids
                    if str(id_obj) in self._nodes
                ]
            node = self._nodes.get(str(id_query))
            return [self._node_to_dict(node)] if node else []

        return []

    def _node_to_dict(self, node: Optional[MockMessageNode]) -> Optional[dict]:
        """Convert node to dictionary format (simulating pymongo return)"""
        if node is None:
            return None
        return {
            "_id": node.id,
            "role": node.role,
            "content": node.content,
            "parent_ids": node.parent_ids,
            "children": node.children,
            "conversation_id": node.conversation_id,
            "model": node.model,
        }


def build_dag_from_parents(
    mongo_db: MockMongoDB, parent_ids: list[str]
) -> tuple[dict, dict]:
    """
    Trace back from parent_ids to build a SubDAG (subgraph)

    This is the pure logic version of build_dag_from_parents in chat.py, used for testing
    """
    if not parent_ids:
        return {}, {}

    # BFS遍历收集所有相关节点（向上追溯父节点）
    queue = list(parent_ids)
    visited = set()
    node_map = {}
    max_depth = 2000
    current_depth = 0

    while queue and current_depth < max_depth:
        batch_size = min(len(queue), 100)
        current_batch = queue[:batch_size]
        queue = queue[batch_size:]

        # 批量查询
        nodes = mongo_db.find("message_node", {"_id": {"$in": current_batch}})

        for node in nodes:
            node_id = str(node["_id"])
            if node_id not in visited:
                visited.add(node_id)
                node_map[node_id] = node

                # 向上追溯父节点
                for parent_id in node.get("parent_ids", []):
                    if parent_id and parent_id not in visited:
                        queue.append(parent_id)

        current_depth += 1

    # 构建边关系（从父节点指向子节点）
    edges = defaultdict(list)
    for node_id, node in node_map.items():
        for parent_id in node.get("parent_ids", []):
            if parent_id in node_map:
                edges[parent_id].append(node_id)

    return node_map, dict(edges)


def topological_sort_subdag(node_map: dict, edges: dict) -> list[str]:
    """
    Perform topological sort on the SubDAG while preserving chains

    This is the pure logic version of topological_sort_subdag in chat.py, used for testing
    """
    if not node_map:
        return []

    subdag_nodes = set(node_map.keys())

    # 计算入度和出度
    in_degree = defaultdict(int)
    out_degree = defaultdict(int)

    for node_id in subdag_nodes:
        for parent_id in node_map.get(node_id, {}).get("parent_ids", []):
            if parent_id in subdag_nodes:
                in_degree[node_id] += 1
        for child_id in edges.get(node_id, []):
            if child_id in subdag_nodes:
                out_degree[node_id] += 1

    # 拓扑排序
    result = []
    available = {n for n in subdag_nodes if in_degree[n] == 0}
    in_degree_copy = defaultdict(int, in_degree)

    while available:
        selected = None

        if result:
            last_node = result[-1]
            # 策略1：延续链
            for child_id in edges.get(last_node, []):
                if child_id in available and in_degree[child_id] == 1:
                    selected = child_id
                    break

            # 策略2：开始新链
            if selected is None:
                for node_id in sorted(available):
                    if in_degree[node_id] == 1 and out_degree.get(node_id, 0) == 1:
                        selected = node_id
                        break

                # 策略3：任意选择
                if selected is None:
                    selected = sorted(available)[0]
        else:
            # 第一个节点
            selected = sorted(available)[0]

        result.append(selected)
        available.remove(selected)

        # 更新子节点的入度
        for child_id in edges.get(selected, []):
            if child_id in subdag_nodes:
                in_degree_copy[child_id] -= 1
                if in_degree_copy[child_id] == 0:
                    available.add(child_id)

    return result


# ============== 测试数据定义 ==============

# 用户提问内容映射
USER_QUESTIONS = {
    "a": "中国四大城市分别是？",
    "b": "介绍下北京，简洁回答",
    "c": "介绍下上海，简洁回答",
    "d": "介绍下广州，简洁回答",
    "e": "介绍下深圳，简洁回答",
    "f": "介绍下北京美食，简洁回答",
    "g": "介绍下北京旅游胜地，简洁回答",
    "h": "介绍下上海美食，简洁回答",
    "i": "介绍下上海旅游胜地，简洁回答",
    "j": "介绍下广州美食，简洁回答",
    "k": "介绍下广州旅游胜地，简洁回答",
    "l": "介绍下深圳美食，简洁回答",
    "m": "介绍下深圳旅游胜地，简洁回答",
    "n": "先去上海旅游，再去广州享用美食，给个攻略，简洁回答",
    "o": "烧腊和肠粉哪个好吃？",
    "p": "介绍下广州塔，简洁回答",
    "q": "这俩和蛇肉比起来怎么样？",
    "r": "600米，这么高，有观光电梯吗？",
    "s": "按照你的攻略，先去了上海看东方明珠，然后去了广州吃饭，重点尝了蛇肉，真不错啊，给我弄个朋友圈文案",
    "t": "去了广州，花了一天逛广州塔，确实高，顺便还吃了蛇肉，爽啊，给我弄个朋友圈文案",
    "u": "我一个朋友去上海吃了美食，然后看了我的朋友圈文案，也对蛇肉感兴趣了，给他推荐下上海到广州怎么去方便？",
}

# 模拟的助手回复
ASSISTANT_ANSWERS = {
    "a": "中国四大城市是北京、上海、广州、深圳。",
    "b": "北京是中国的首都，政治文化中心，有故宫、长城等历史名胜。",
    "c": "上海是中国的经济中心，国际金融中心，有东方明珠、外滩等地标。",
    "d": "广州是华南地区的经济文化中心，美食之都，有广州塔等景点。",
    "e": "深圳是中国改革开放的窗口，科技创新中心，毗邻香港。",
    "f": "北京美食有烤鸭、炸酱面、豆汁、卤煮等。",
    "g": "北京旅游胜地有故宫、长城、颐和园、天坛等。",
    "h": "上海美食有小笼包、生煎包、蟹壳黄、排骨年糕等。",
    "i": "上海旅游胜所有外滩、东方明珠、豫园、南京路等。",
    "j": "广州美食有早茶、烧腊、肠粉、叉烧等。",
    "k": "广州旅游胜所有广州塔、陈家祠、沙面、白云山等。",
    "l": "深圳美食有潮汕牛肉火锅、海鲜、茶餐厅美食等。",
    "m": "深圳旅游胜所有世界之窗、欢乐谷、大梅沙、华侨城等。",
    "n": "建议先飞往上海，游览东方明珠和外滩，品尝小笼包，然后乘高铁到广州，品尝地道早茶和烧腊。",
    "o": "烧腊和肠粉都是广州特色美食，烧腊香酥可口，肠粉滑嫩爽口，都值得一试。",
    "p": "广州塔（小蛮腰）高600米，是广州地标建筑，有观光平台和摩天轮。",
    "q": "蛇肉是广东特色美食，肉质细嫩，与烧腊肠粉相比更具特色，但需要到正规餐厅品尝。",
    "r": "有的，广州塔有高速观光电梯，1分多钟可到达观景平台。",
    "s": "【朋友圈文案】上海东方明珠打卡✅ 广州蛇肉尝鲜✅ 一路吃遍长三角和珠三角，舌尖上的旅行太满足了！🐍🍜 #美食之旅 #上海广州",
    "t": "【朋友圈文案】广州塔600米高空打卡✅ 蛇肉尝鲜✅ 高空+美食，今天这波操作满分！🗼🐍 #广州塔 #美食探店",
    "u": "建议乘坐高铁，上海虹桥到广州南约7-8小时，或飞机约2.5小时。",
}


class TestComplexDAG:
    """
    Test complex DAG scenario

    DAG structure:
    Root node a, branching structure as follows:
    a -> b -> f
    a -> b -> g
    a -> c -> h
    a -> c -> i -> n <- j <- d <- a
    a -> c -> i -> n <- j <- s
    a -> d -> j -> o -> q -> s
    a -> d -> k -> p -> r -> t
    a -> d -> k -> t
    a -> e -> l
    a -> e -> m

    New node u, parent_ids are [h, s]
    """

    def complex_dag_db(self):
        """Build test database for complex DAG"""
        db = MockMongoDB()

        # 定义问答对结构（每个字母代表一个问答对）
        # 构建顺序：按字母顺序构建a-t

        # a: 根节点，无parent_ids
        db.insert_node(
            MockMessageNode(
                id="user_a", role="user", content=USER_QUESTIONS["a"], parent_ids=[]
            )
        )
        db.insert_node(
            MockMessageNode(
                id="assistant_a",
                role="assistant",
                content=ASSISTANT_ANSWERS["a"],
                parent_ids=["user_a"],
                children=["user_b", "user_c", "user_d", "user_e"],
            )
        )

        # b-f: 北京分支
        db.insert_node(
            MockMessageNode(
                id="user_b",
                role="user",
                content=USER_QUESTIONS["b"],
                parent_ids=["assistant_a"],
            )
        )
        db.insert_node(
            MockMessageNode(
                id="assistant_b",
                role="assistant",
                content=ASSISTANT_ANSWERS["b"],
                parent_ids=["user_b"],
                children=["user_f", "user_g"],
            )
        )

        db.insert_node(
            MockMessageNode(
                id="user_f",
                role="user",
                content=USER_QUESTIONS["f"],
                parent_ids=["assistant_b"],
            )
        )
        db.insert_node(
            MockMessageNode(
                id="assistant_f",
                role="assistant",
                content=ASSISTANT_ANSWERS["f"],
                parent_ids=["user_f"],
            )
        )

        # g: 北京旅游
        db.insert_node(
            MockMessageNode(
                id="user_g",
                role="user",
                content=USER_QUESTIONS["g"],
                parent_ids=["assistant_b"],
            )
        )
        db.insert_node(
            MockMessageNode(
                id="assistant_g",
                role="assistant",
                content=ASSISTANT_ANSWERS["g"],
                parent_ids=["user_g"],
            )
        )

        # c-h, i: 上海分支
        db.insert_node(
            MockMessageNode(
                id="user_c",
                role="user",
                content=USER_QUESTIONS["c"],
                parent_ids=["assistant_a"],
            )
        )
        db.insert_node(
            MockMessageNode(
                id="assistant_c",
                role="assistant",
                content=ASSISTANT_ANSWERS["c"],
                parent_ids=["user_c"],
                children=["user_h", "user_i"],
            )
        )

        db.insert_node(
            MockMessageNode(
                id="user_h",
                role="user",
                content=USER_QUESTIONS["h"],
                parent_ids=["assistant_c"],
            )
        )
        db.insert_node(
            MockMessageNode(
                id="assistant_h",
                role="assistant",
                content=ASSISTANT_ANSWERS["h"],
                parent_ids=["user_h"],
            )
        )

        db.insert_node(
            MockMessageNode(
                id="user_i",
                role="user",
                content=USER_QUESTIONS["i"],
                parent_ids=["assistant_c"],
            )
        )
        db.insert_node(
            MockMessageNode(
                id="assistant_i",
                role="assistant",
                content=ASSISTANT_ANSWERS["i"],
                parent_ids=["user_i"],
                children=["user_n"],
            )
        )

        # d-j, k: 广州分支
        db.insert_node(
            MockMessageNode(
                id="user_d",
                role="user",
                content=USER_QUESTIONS["d"],
                parent_ids=["assistant_a"],
            )
        )
        db.insert_node(
            MockMessageNode(
                id="assistant_d",
                role="assistant",
                content=ASSISTANT_ANSWERS["d"],
                parent_ids=["user_d"],
                children=["user_j", "user_k"],
            )
        )

        db.insert_node(
            MockMessageNode(
                id="user_j",
                role="user",
                content=USER_QUESTIONS["j"],
                parent_ids=["assistant_d"],
            )
        )
        db.insert_node(
            MockMessageNode(
                id="assistant_j",
                role="assistant",
                content=ASSISTANT_ANSWERS["j"],
                parent_ids=["user_j"],
                children=["user_n", "user_o", "user_s"],
            )
        )

        db.insert_node(
            MockMessageNode(
                id="user_k",
                role="user",
                content=USER_QUESTIONS["k"],
                parent_ids=["assistant_d"],
            )
        )
        db.insert_node(
            MockMessageNode(
                id="assistant_k",
                role="assistant",
                content=ASSISTANT_ANSWERS["k"],
                parent_ids=["user_k"],
                children=["user_p", "user_t"],
            )
        )

        # e-l, m: 深圳分支
        db.insert_node(
            MockMessageNode(
                id="user_e",
                role="user",
                content=USER_QUESTIONS["e"],
                parent_ids=["assistant_a"],
            )
        )
        db.insert_node(
            MockMessageNode(
                id="assistant_e",
                role="assistant",
                content=ASSISTANT_ANSWERS["e"],
                parent_ids=["user_e"],
                children=["user_l", "user_m"],
            )
        )

        db.insert_node(
            MockMessageNode(
                id="user_l",
                role="user",
                content=USER_QUESTIONS["l"],
                parent_ids=["assistant_e"],
            )
        )
        db.insert_node(
            MockMessageNode(
                id="assistant_l",
                role="assistant",
                content=ASSISTANT_ANSWERS["l"],
                parent_ids=["user_l"],
            )
        )

        db.insert_node(
            MockMessageNode(
                id="user_m",
                role="user",
                content=USER_QUESTIONS["m"],
                parent_ids=["assistant_e"],
            )
        )
        db.insert_node(
            MockMessageNode(
                id="assistant_m",
                role="assistant",
                content=ASSISTANT_ANSWERS["m"],
                parent_ids=["user_m"],
            )
        )

        # n: 合并节点（来自i和j）
        db.insert_node(
            MockMessageNode(
                id="user_n",
                role="user",
                content=USER_QUESTIONS["n"],
                parent_ids=["assistant_i", "assistant_j"],
            )
        )
        db.insert_node(
            MockMessageNode(
                id="assistant_n",
                role="assistant",
                content=ASSISTANT_ANSWERS["n"],
                parent_ids=["user_n"],
                children=["user_s"],
            )
        )

        # o-q-s链
        db.insert_node(
            MockMessageNode(
                id="user_o",
                role="user",
                content=USER_QUESTIONS["o"],
                parent_ids=["assistant_j"],
            )
        )
        db.insert_node(
            MockMessageNode(
                id="assistant_o",
                role="assistant",
                content=ASSISTANT_ANSWERS["o"],
                parent_ids=["user_o"],
                children=["user_q"],
            )
        )

        db.insert_node(
            MockMessageNode(
                id="user_q",
                role="user",
                content=USER_QUESTIONS["q"],
                parent_ids=["assistant_o"],
            )
        )
        db.insert_node(
            MockMessageNode(
                id="assistant_q",
                role="assistant",
                content=ASSISTANT_ANSWERS["q"],
                parent_ids=["user_q"],
                children=["user_s", "user_t"],
            )
        )

        # p-r链
        db.insert_node(
            MockMessageNode(
                id="user_p",
                role="user",
                content=USER_QUESTIONS["p"],
                parent_ids=["assistant_k"],
            )
        )
        db.insert_node(
            MockMessageNode(
                id="assistant_p",
                role="assistant",
                content=ASSISTANT_ANSWERS["p"],
                parent_ids=["user_p"],
                children=["user_r"],
            )
        )

        db.insert_node(
            MockMessageNode(
                id="user_r",
                role="user",
                content=USER_QUESTIONS["r"],
                parent_ids=["assistant_p"],
            )
        )
        db.insert_node(
            MockMessageNode(
                id="assistant_r",
                role="assistant",
                content=ASSISTANT_ANSWERS["r"],
                parent_ids=["user_r"],
                children=["user_t"],
            )
        )

        # s: 合并节点（来自n、j、q）
        db.insert_node(
            MockMessageNode(
                id="user_s",
                role="user",
                content=USER_QUESTIONS["s"],
                parent_ids=["assistant_n", "assistant_j", "assistant_q"],
            )
        )
        db.insert_node(
            MockMessageNode(
                id="assistant_s",
                role="assistant",
                content=ASSISTANT_ANSWERS["s"],
                parent_ids=["user_s"],
            )
        )

        # t: 合并节点（来自k、q、r）
        db.insert_node(
            MockMessageNode(
                id="user_t",
                role="user",
                content=USER_QUESTIONS["t"],
                parent_ids=["assistant_k", "assistant_q", "assistant_r"],
            )
        )
        db.insert_node(
            MockMessageNode(
                id="assistant_t",
                role="assistant",
                content=ASSISTANT_ANSWERS["t"],
                parent_ids=["user_t"],
            )
        )

        return db

    def test_dag_structure(self, complex_dag_db):
        """Test that the basic DAG structure is correctly built"""
        db = complex_dag_db

        # 测试根节点
        root = db._nodes.get("user_a")
        assert root is not None
        assert root.parent_ids == []

        # 测试分支节点b
        node_b = db._nodes.get("user_b")
        assert node_b.parent_ids == ["assistant_a"]

        # 测试合并节点n（多父节点）
        node_n = db._nodes.get("user_n")
        assert set(node_n.parent_ids) == {"assistant_i", "assistant_j"}

        # 测试合并节点s（三父节点）
        node_s = db._nodes.get("user_s")
        assert set(node_s.parent_ids) == {"assistant_n", "assistant_j", "assistant_q"}

    def test_subdag_building_for_merge_node(self, complex_dag_db):
        """Test SubDAG construction for a merge question"""
        db = complex_dag_db

        # 模拟新增节点u，parent_ids为[assistant_h, assistant_s]
        # 这意味着用户基于h（上海美食）和s（朋友圈文案）进行合并提问
        parent_ids = ["assistant_h", "assistant_s"]

        node_map, _ = build_dag_from_parents(db, parent_ids)

        # 验证SubDAG包含的节点
        # 应该包含: a, c, h, d, j, n, o, q, s 及其对应的assistant节点
        expected_nodes = {
            "user_a",
            "assistant_a",
            "user_c",
            "assistant_c",
            "user_h",
            "assistant_h",
            "user_d",
            "assistant_d",
            "user_j",
            "assistant_j",
            "user_i",
            "assistant_i",
            "user_n",
            "assistant_n",
            "user_o",
            "assistant_o",
            "user_q",
            "assistant_q",
            "user_s",
            "assistant_s",
        }

        actual_nodes = set(node_map.keys())
        assert expected_nodes <= actual_nodes, (
            f"Missing nodes: {expected_nodes - actual_nodes}"
        )

    def test_topological_sort_for_merge_node(self, complex_dag_db):
        """Test topological sort on the SubDAG of a merge question"""
        db = complex_dag_db

        parent_ids = ["assistant_h", "assistant_s"]
        node_map, edges = build_dag_from_parents(db, parent_ids)
        sorted_nodes = topological_sort_subdag(node_map, edges)

        # 获取所有问答对的标识（去掉user_/assistant_前缀）
        def get_qa_id(node_id):
            parts = node_id.split("_")
            return parts[1] if len(parts) > 1 else node_id

        qa_sequence = [get_qa_id(nid) for nid in sorted_nodes]

        # 验证拓扑顺序约束
        # a must come first
        first_a_idx = next(i for i, x in enumerate(qa_sequence) if x == "a")
        assert first_a_idx == 0, "Root node a must be in the first position"

        # Verify parent-child relationships: parent must come before child
        def assert_before(parent, child, msg=""):
            parent_indices = [i for i, x in enumerate(qa_sequence) if x == parent]
            child_indices = [i for i, x in enumerate(qa_sequence) if x == child]
            if parent_indices and child_indices:
                assert max(parent_indices) < min(child_indices), (
                    msg or f"{parent} must come before {child}"
                )

        # Basic chain constraints
        assert_before("a", "c", "a must come before c")
        assert_before("a", "d", "a must come before d")
        assert_before("c", "h", "c must come before h")
        assert_before("c", "i", "c must come before i")
        assert_before("d", "j", "d must come before j")
        assert_before("i", "n", "i must come before n")
        assert_before("j", "n", "j must come before n")
        assert_before("j", "o", "j must come before o")
        assert_before("o", "q", "o must come before q")
        assert_before("q", "s", "q must come before s")
        assert_before("n", "s", "n must come before s")

    def test_all_paths_to_merge_node(self, complex_dag_db):
        """Test all paths to a merge node"""
        db = complex_dag_db

        parent_ids = ["assistant_h", "assistant_s"]
        node_map, _ = build_dag_from_parents(db, parent_ids)

        # Verify the path from h to root
        def get_path_to_root(node_id, node_map):
            path = [node_id]
            current = node_id
            while True:
                node = node_map.get(current)
                if not node:
                    break
                parents = node.get("parent_ids", [])
                if not parents:
                    break
                # 选择第一个父节点（对于测试简单路径）
                current = parents[0]
                path.append(current)
            return list(reversed(path))

        # h's path: a -> c -> h
        h_path = get_path_to_root("user_h", node_map)
        assert "user_a" in h_path
        assert "user_c" in h_path

        # s has multiple paths, verify one of them
        s_paths = [
            ["user_a", "user_d", "user_j", "user_s"],
            ["user_a", "user_c", "user_i", "user_n", "user_s"],
            ["user_a", "user_d", "user_j", "user_o", "user_q", "user_s"],
        ]

        # Verify these nodes are all in node_map
        for path in s_paths:
            for node in path:
                assert node in node_map, f"Node {node} should be in the SubDAG"


class TestLinkedListScenario:
    """
    Test linked list scenario (linear conversation, no branching or merging)

    Scenario: User has a continuous linear conversation with no branching or merging questions
    Expected: The conversation structure degenerates into a linked list; topological sort result should match insertion order
    """

    def linked_list_db(self):
        """Build test database with linked list structure"""
        db = MockMongoDB()

        # 构建线性对话链: a -> b -> c -> d -> e
        # user_a -> assistant_a -> user_b -> assistant_b -> ...

        # a
        db.insert_node(
            MockMessageNode(
                id="user_a", role="user", content=USER_QUESTIONS["a"], parent_ids=[]
            )
        )
        db.insert_node(
            MockMessageNode(
                id="assistant_a",
                role="assistant",
                content=ASSISTANT_ANSWERS["a"],
                parent_ids=["user_a"],
                children=["user_b"],
            )
        )

        # b
        db.insert_node(
            MockMessageNode(
                id="user_b",
                role="user",
                content=USER_QUESTIONS["b"],
                parent_ids=["assistant_a"],
            )
        )
        db.insert_node(
            MockMessageNode(
                id="assistant_b",
                role="assistant",
                content=ASSISTANT_ANSWERS["b"],
                parent_ids=["user_b"],
                children=["user_c"],
            )
        )

        # c
        db.insert_node(
            MockMessageNode(
                id="user_c",
                role="user",
                content=USER_QUESTIONS["c"],
                parent_ids=["assistant_b"],
            )
        )
        db.insert_node(
            MockMessageNode(
                id="assistant_c",
                role="assistant",
                content=ASSISTANT_ANSWERS["c"],
                parent_ids=["user_c"],
                children=["user_d"],
            )
        )

        # d
        db.insert_node(
            MockMessageNode(
                id="user_d",
                role="user",
                content=USER_QUESTIONS["d"],
                parent_ids=["assistant_c"],
            )
        )
        db.insert_node(
            MockMessageNode(
                id="assistant_d",
                role="assistant",
                content=ASSISTANT_ANSWERS["d"],
                parent_ids=["user_d"],
                children=["user_e"],
            )
        )

        # e
        db.insert_node(
            MockMessageNode(
                id="user_e",
                role="user",
                content=USER_QUESTIONS["e"],
                parent_ids=["assistant_d"],
            )
        )
        db.insert_node(
            MockMessageNode(
                id="assistant_e",
                role="assistant",
                content=ASSISTANT_ANSWERS["e"],
                parent_ids=["user_e"],
            )
        )

        return db

    def test_linked_list_structure(self, linked_list_db):
        """Test basic properties of linked list structure"""
        db = linked_list_db

        # Each node (except the first) should have exactly one parent
        for node_id, node in db._nodes.items():
            if node.role == "user":
                if node_id == "user_a":
                    assert node.parent_ids == [], (
                        "The first user node should have no parent_ids"
                    )
                else:
                    assert len(node.parent_ids) == 1, (
                        f"{node_id} should have exactly one parent_id"
                    )
            else:  # assistant
                assert len(node.parent_ids) == 1, (
                    f"{node_id} should have exactly one parent_id"
                )

        # Each node (except the last) should have exactly one child
        for node_id, node in db._nodes.items():
            if node.role == "assistant":
                if node_id == "assistant_e":
                    assert node.children == [], (
                        "The last assistant node should have no children"
                    )
                else:
                    assert len(node.children) == 1, (
                        f"{node_id} should have exactly one child"
                    )

    def test_linked_list_topological_sort(self, linked_list_db):
        """Test topological sort on linked list"""
        db = linked_list_db

        # Build SubDAG starting from the last node
        parent_ids = ["assistant_e"]
        node_map, edges = build_dag_from_parents(db, parent_ids)
        sorted_nodes = topological_sort_subdag(node_map, edges)

        # Expected order: a, b, c, d, e (Q&A pair order)
        expected_order = [
            "user_a",
            "assistant_a",
            "user_b",
            "assistant_b",
            "user_c",
            "assistant_c",
            "user_d",
            "assistant_d",
            "user_e",
            "assistant_e",
        ]

        assert sorted_nodes == expected_order, (
            f"Topological sort should maintain consistency\nActual: {sorted_nodes}\nExpected: {expected_order}"
        )

    def test_linked_list_conversation_history(self, linked_list_db):
        """Test conversation history construction for linked list"""
        db = linked_list_db

        # Simulate a new question (no parent_ids, meaning first question)
        # This case should return empty history
        empty_history = build_dag_from_parents(db, [])
        assert empty_history == ({}, {})

        # Simulate an appended question (single parent_id)
        parent_ids = ["assistant_e"]
        node_map, edges = build_dag_from_parents(db, parent_ids)
        sorted_nodes = topological_sort_subdag(node_map, edges)

        # Build history message list
        history = []
        for node_id in sorted_nodes:
            node = node_map[node_id]
            history.append({"role": node["role"], "content": node["content"]})

        # Verify history order
        assert len(history) == 10  # 5 Q&A pairs, 10 messages total

        # Verify alternating roles
        for i, msg in enumerate(history):
            expected_role = "user" if i % 2 == 0 else "assistant"
            assert msg["role"] == expected_role, (
                f"Message {i} should be {expected_role}"
            )


class TestBranchingScenario:
    """
    Test branching scenario (branching, no merging)

    Scenario: User asked branching questions but no merging questions
    Expected: The conversation structure forms a branching DAG; topological sort should correctly reflect DAG hierarchy
    """

    def branching_dag_db(self):
        """Build test database with branching DAG structure"""
        db = MockMongoDB()

        # 构建树结构：
        #       a
        #     / | \
        #    b  c  d
        #   / \    / \
        #  e   f  g   h

        # a (根)
        db.insert_node(
            MockMessageNode(
                id="user_a", role="user", content=USER_QUESTIONS["a"], parent_ids=[]
            )
        )
        db.insert_node(
            MockMessageNode(
                id="assistant_a",
                role="assistant",
                content=ASSISTANT_ANSWERS["a"],
                parent_ids=["user_a"],
                children=["user_b", "user_c", "user_d"],
            )
        )

        # b分支
        db.insert_node(
            MockMessageNode(
                id="user_b",
                role="user",
                content=USER_QUESTIONS["b"],
                parent_ids=["assistant_a"],
            )
        )
        db.insert_node(
            MockMessageNode(
                id="assistant_b",
                role="assistant",
                content=ASSISTANT_ANSWERS["b"],
                parent_ids=["user_b"],
                children=["user_e", "user_f"],
            )
        )

        # c分支
        db.insert_node(
            MockMessageNode(
                id="user_c",
                role="user",
                content=USER_QUESTIONS["c"],
                parent_ids=["assistant_a"],
            )
        )
        db.insert_node(
            MockMessageNode(
                id="assistant_c",
                role="assistant",
                content=ASSISTANT_ANSWERS["c"],
                parent_ids=["user_c"],
            )
        )

        # d分支
        db.insert_node(
            MockMessageNode(
                id="user_d",
                role="user",
                content=USER_QUESTIONS["d"],
                parent_ids=["assistant_a"],
            )
        )
        db.insert_node(
            MockMessageNode(
                id="assistant_d",
                role="assistant",
                content=ASSISTANT_ANSWERS["d"],
                parent_ids=["user_d"],
                children=["user_g", "user_h"],
            )
        )

        # e, f (b的子节点)
        db.insert_node(
            MockMessageNode(
                id="user_e",
                role="user",
                content=USER_QUESTIONS["e"],
                parent_ids=["assistant_b"],
            )
        )
        db.insert_node(
            MockMessageNode(
                id="assistant_e",
                role="assistant",
                content=ASSISTANT_ANSWERS["e"],
                parent_ids=["user_e"],
            )
        )

        db.insert_node(
            MockMessageNode(
                id="user_f",
                role="user",
                content=USER_QUESTIONS["f"],
                parent_ids=["assistant_b"],
            )
        )
        db.insert_node(
            MockMessageNode(
                id="assistant_f",
                role="assistant",
                content=ASSISTANT_ANSWERS["f"],
                parent_ids=["user_f"],
            )
        )

        # g, h (d的子节点)
        db.insert_node(
            MockMessageNode(
                id="user_g",
                role="user",
                content=USER_QUESTIONS["g"],
                parent_ids=["assistant_d"],
            )
        )
        db.insert_node(
            MockMessageNode(
                id="assistant_g",
                role="assistant",
                content=ASSISTANT_ANSWERS["g"],
                parent_ids=["user_g"],
            )
        )

        db.insert_node(
            MockMessageNode(
                id="user_h",
                role="user",
                content=USER_QUESTIONS["h"],
                parent_ids=["assistant_d"],
            )
        )
        db.insert_node(
            MockMessageNode(
                id="assistant_h",
                role="assistant",
                content=ASSISTANT_ANSWERS["h"],
                parent_ids=["user_h"],
            )
        )

        return db

    def test_branching_structure(self, branching_dag_db):
        """Test basic properties of branching DAG structure"""
        db = branching_dag_db

        # Each node should have exactly one parent (except root)
        for node_id, node in db._nodes.items():
            if node.role == "user":
                if node_id == "user_a":
                    assert node.parent_ids == [], "Root node should have no parent_ids"
                else:
                    assert len(node.parent_ids) == 1, (
                        f"{node_id} in a branching DAG should have exactly one parent_id"
                    )
            else:  # assistant
                assert len(node.parent_ids) == 1, (
                    f"{node_id} should have exactly one parent_id"
                )

        # Verify branching nodes have multiple children
        node_b = db._nodes["assistant_b"]
        assert len(node_b.children) == 2, "b should have 2 children"

        node_a = db._nodes["assistant_a"]
        assert len(node_a.children) == 3, "a should have 3 children"

    def test_branching_no_merge_points(self, branching_dag_db):
        """Test that there are no merge points in a branching DAG"""
        db = branching_dag_db

        # All nodes should have parent_ids length <= 1
        for node_id, node in db._nodes.items():
            assert len(node.parent_ids) <= 1, (
                f"A branching DAG should not have merge points, but {node_id} has {len(node.parent_ids)} parent(s)"
            )

    def test_branching_topological_sort_from_leaf(self, branching_dag_db):
        """Test building SubDAG from a leaf node and performing topological sort"""
        db = branching_dag_db

        # Start from leaf node f
        parent_ids = ["assistant_f"]
        node_map, edges = build_dag_from_parents(db, parent_ids)
        sorted_nodes = topological_sort_subdag(node_map, edges)

        # Verify included nodes: a, b, f
        expected_nodes = {
            "user_a",
            "assistant_a",
            "user_b",
            "assistant_b",
            "user_f",
            "assistant_f",
        }
        actual_nodes = set(node_map.keys())
        assert actual_nodes == expected_nodes

        # Verify topological order: a must come before b, b must come before f
        def get_index(node_id):
            return sorted_nodes.index(node_id)

        assert get_index("user_a") < get_index("assistant_a")
        assert get_index("assistant_a") < get_index("user_b")
        assert get_index("user_b") < get_index("assistant_b")
        assert get_index("assistant_b") < get_index("user_f")

    def test_branching_subdag_from_multiple_leaves(self, branching_dag_db):
        """Test building SubDAG from multiple leaf nodes (simulating state before a merge question)"""
        db = branching_dag_db

        # Build SubDAG from leaf nodes e and h (similar to preparing for a merge question)
        parent_ids = ["assistant_e", "assistant_h"]
        node_map, edges = build_dag_from_parents(db, parent_ids)

        # Should include e's path (a->b->e) and h's path (a->d->h)
        expected_nodes = {
            "user_a",
            "assistant_a",
            "user_b",
            "assistant_b",
            "user_e",
            "assistant_e",
            "user_d",
            "assistant_d",
            "user_h",
            "assistant_h",
        }
        actual_nodes = set(node_map.keys())
        assert expected_nodes <= actual_nodes

        # Perform topological sort
        sorted_nodes = topological_sort_subdag(node_map, edges)

        # Verify order constraints
        def assert_before(parent, child):
            assert sorted_nodes.index(parent) < sorted_nodes.index(child)

        assert_before("user_a", "assistant_a")
        assert_before("assistant_a", "user_b")
        assert_before("user_b", "assistant_b")
        assert_before("assistant_b", "user_e")
        assert_before("assistant_a", "user_d")
        assert_before("user_d", "assistant_d")
        assert_before("assistant_d", "user_h")


class TestEdgeCases:
    """Test edge cases"""

    def test_empty_parent_ids(self):
        """Test empty parent_ids"""
        db = MockMongoDB()
        result = build_dag_from_parents(db, [])
        assert result == ({}, {})

    def test_nonexistent_parent_ids(self):
        """Test non-existent parent_ids"""
        db = MockMongoDB()
        result = build_dag_from_parents(db, ["nonexistent_id"])
        assert result == ({}, {})

    def test_single_node(self):
        """Test single node case"""
        db = MockMongoDB()
        db.insert_node(
            MockMessageNode(id="user_a", role="user", content="test", parent_ids=[])
        )
        db.insert_node(
            MockMessageNode(
                id="assistant_a",
                role="assistant",
                content="response",
                parent_ids=["user_a"],
            )
        )

        node_map, edges = build_dag_from_parents(db, ["assistant_a"])
        sorted_nodes = topological_sort_subdag(node_map, edges)

        assert sorted_nodes == ["user_a", "assistant_a"]


def test_complex_dag_with_user_questions():
    """
    Full test: Build a complex DAG using actual user-provided conversation content

    This test fully reproduces the scenario described by the user and verifies the final topological sort result
    """
    db = MockMongoDB()

    # Define the partial order relations of the DAG (user-provided example)
    # Format: (parent Q&A pair, child Q&A pair)
    # In actual storage, edge relationships are: assistant_parent -> user_child

    # First create all Q&A pairs
    qa_pairs = list(USER_QUESTIONS.keys())[:20]  # a-t

    # Build nodes
    for qa_id in qa_pairs:
        # user node
        user_node = MockMessageNode(
            id=f"user_{qa_id}", role="user", content=USER_QUESTIONS[qa_id]
        )
        db.insert_node(user_node)

        # assistant node - parent_ids points to the corresponding user node
        assistant_node = MockMessageNode(
            id=f"assistant_{qa_id}",
            role="assistant",
            content=ASSISTANT_ANSWERS[qa_id],
            parent_ids=[f"user_{qa_id}"],  # assistant's parent is user
        )
        db.insert_node(assistant_node)

    # Define parent-child relationships and update nodes
    # a<-b, a<-c, a<-d, a<-e means assistant_a -> user_b, user_c, user_d, user_e
    relationships = [
        ("a", "b"),
        ("a", "c"),
        ("a", "d"),
        ("a", "e"),
        ("b", "f"),
        ("b", "g"),
        ("c", "h"),
        ("c", "i"),
        ("d", "j"),
        ("d", "k"),
        ("e", "l"),
        ("e", "m"),
        ("i", "n"),
        ("j", "n"),  # n has multiple parent nodes (merge point)
        ("j", "o"),
        ("k", "p"),
        ("o", "q"),
        ("j", "s"),
        ("n", "s"),
        ("q", "s"),  # s has multiple parent nodes (merge point)
        ("p", "r"),
        ("k", "t"),
        ("q", "t"),
        ("r", "t"),  # t has multiple parent nodes (merge point)
    ]

    # Update parent_ids and children of nodes
    for parent, child in relationships:
        assistant_parent = db._nodes[f"assistant_{parent}"]
        user_child = db._nodes[f"user_{child}"]

        if f"user_{child}" not in assistant_parent.children:
            assistant_parent.children.append(f"user_{child}")

        if f"assistant_{parent}" not in user_child.parent_ids:
            user_child.parent_ids.append(f"assistant_{parent}")

    # Set root node a's parent_ids (empty list means no parent)
    db._nodes["user_a"].parent_ids = []

    # Now test adding new node u with parent_ids [assistant_h, assistant_s]
    # First create u node
    db.insert_node(
        MockMessageNode(
            id="user_u",
            role="user",
            content=USER_QUESTIONS["u"],
            parent_ids=["assistant_h", "assistant_s"],
        )
    )
    db.insert_node(
        MockMessageNode(
            id="assistant_u",
            role="assistant",
            content=ASSISTANT_ANSWERS["u"],
            parent_ids=["user_u"],
        )
    )

    # Update h and s's children
    db._nodes["assistant_h"].children.append("user_u")
    db._nodes["assistant_s"].children.append("user_u")

    # Test: build SubDAG from h and s
    parent_ids = ["assistant_h", "assistant_s"]
    node_map, edges = build_dag_from_parents(db, parent_ids)
    sorted_nodes = topological_sort_subdag(node_map, edges)

    # Extract Q&A pair identifiers
    def get_qa_id(node_id):
        parts = node_id.split("_")
        return parts[1] if len(parts) > 1 else node_id

    qa_sequence = [get_qa_id(nid) for nid in sorted_nodes]

    # Deduplicated Q&A pair sequence (for display and verification)
    qa_sequence_deduplicated = []
    seen = set()
    for qa_id in qa_sequence:
        if qa_id not in seen:
            qa_sequence_deduplicated.append(qa_id)
            seen.add(qa_id)

    # Verify required nodes are present
    required_nodes = {"a", "c", "d", "h", "i", "j", "n", "o", "q", "s"}
    actual_qa_set = set(qa_sequence_deduplicated)

    for node in required_nodes:
        assert node in actual_qa_set, f"Node {node} should be in the SubDAG"

    # Verify topological order constraints (using deduplicated sequence)
    def assert_before(parent, child):
        parent_idx = qa_sequence_deduplicated.index(parent)
        child_idx = qa_sequence_deduplicated.index(child)
        assert parent_idx < child_idx, (
            f"{parent}({parent_idx}) must come before {child}({child_idx})"
        )

    # Verify key paths
    assert_before("a", "c")
    assert_before("a", "d")
    assert_before("c", "h")
    assert_before("c", "i")
    assert_before("c", "n")
    assert_before("i", "n")
    assert_before("d", "j")
    assert_before("j", "n")
    assert_before("j", "o")
    assert_before("j", "s")
    assert_before("o", "q")
    assert_before("q", "s")
    assert_before("n", "s")

    # Verify o and q are consecutive (chain not broken)
    # o and q should be consecutive in the deduplicated sequence since j->o->q forms a chain
    o_idx = qa_sequence_deduplicated.index("o")
    q_idx = qa_sequence_deduplicated.index("q")
    assert q_idx == o_idx + 1, (
        f"o and q should be consecutive, but o is at {o_idx}, q is at {q_idx}"
    )

    # Verify relative order of h and d (they are children of c or branches)
    # h is a branch of c, d is a sibling branch of c
    # Since c has in-degree 1 and out-degree 2, both h and i are children of c
    # And d is a sibling of c (both are children of a), d has in-degree 1 and out-degree 2
    # Therefore topological sort may have multiple valid results

    print("\nFinal topological sort result (Q&A pair sequence):")
    print(qa_sequence_deduplicated)
    print(f"\n✓ Verification passed: {len(qa_sequence_deduplicated)} Q&A pairs total")
    print(f"✓ a is in the first position: {qa_sequence_deduplicated[0] == 'a'}")
    print(f"✓ o and q are consecutive with o before q: o@{o_idx}, q@{q_idx}")
    print("✓ All path constraints satisfied")


if __name__ == "__main__":
    # 运行测试
    print("=" * 60)
    print("Running DAG conversation structure tests")
    print("=" * 60)

    # 运行完整复杂DAG测试
    print("\n1. Testing complex DAG scenario (with branching and merging)...")
    test_complex_dag_with_user_questions()
    print("✓ Complex DAG test passed")

    print("\n2. Testing edge cases...")
    edge_cases = TestEdgeCases()
    edge_cases.test_empty_parent_ids()
    edge_cases.test_nonexistent_parent_ids()
    edge_cases.test_single_node()
    print("✓ Edge case tests passed")

    print("\n" + "=" * 60)
    print("All tests passed!")
    print("=" * 60)
