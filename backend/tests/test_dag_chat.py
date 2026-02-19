"""
DAG对话结构测试模块

测试场景：
1. 复杂DAG场景（分支+合并）
2. 链表场景（线性对话，无分支无合并）
3. 树场景（有分支，无合并）
"""

# pylint: disable=protected-access
# 测试代码需要访问 MockMongoDB 的受保护成员 _nodes

from collections import defaultdict
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class MockMessageNode:
    """模拟消息节点"""

    id: str
    role: str  # 'user' or 'assistant'
    content: str
    parent_ids: list[str] = field(default_factory=list)
    children: list[str] = field(default_factory=list)
    conversation_id: str = "test_conversation"
    model: str = "deepseek"


class MockMongoDB:
    """模拟MongoDB连接，用于测试DAG逻辑"""

    def __init__(self):
        self._nodes: dict[str, MockMessageNode] = {}

    def insert_node(self, node: MockMessageNode) -> str:
        """插入节点"""
        self._nodes[node.id] = node
        return node.id

    def find(self, collection: str, query: dict) -> list:
        """模拟查找操作"""
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
        """将节点转换为字典格式（模拟pymongo返回）"""
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
    从parent_ids开始向上追溯，构建SubDAG（子图）

    这是chat.py中build_dag_from_parents的纯逻辑版本，用于测试
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
    对SubDAG进行拓扑排序，保持链不切割

    这是chat.py中topological_sort_subdag的纯逻辑版本，用于测试
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
    测试复杂DAG场景

    DAG结构：
    根节点a，分支结构如下：
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

    新增节点u，parent_ids为[h, s]
    """

    def complex_dag_db(self):
        """构建复杂DAG的测试数据库"""
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
        """测试DAG基本结构是否正确构建"""
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
        """测试为合并提问构建SubDAG"""
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
            f"缺少节点: {expected_nodes - actual_nodes}"
        )

    def test_topological_sort_for_merge_node(self, complex_dag_db):
        """测试对合并提问的SubDAG进行拓扑排序"""
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
        # a必须在最前面
        first_a_idx = next(i for i, x in enumerate(qa_sequence) if x == "a")
        assert first_a_idx == 0, "根节点a必须在第一位"

        # 验证父子关系：父必须在子之前
        def assert_before(parent, child, msg=""):
            parent_indices = [i for i, x in enumerate(qa_sequence) if x == parent]
            child_indices = [i for i, x in enumerate(qa_sequence) if x == child]
            if parent_indices and child_indices:
                assert max(parent_indices) < min(child_indices), (
                    msg or f"{parent}必须在{child}之前"
                )

        # 基本链式约束
        assert_before("a", "c", "a必须在c之前")
        assert_before("a", "d", "a必须在d之前")
        assert_before("c", "h", "c必须在h之前")
        assert_before("c", "i", "c必须在i之前")
        assert_before("d", "j", "d必须在j之前")
        assert_before("i", "n", "i必须在n之前")
        assert_before("j", "n", "j必须在n之前")
        assert_before("j", "o", "j必须在o之前")
        assert_before("o", "q", "o必须在q之前")
        assert_before("q", "s", "q必须在s之前")
        assert_before("n", "s", "n必须在s之前")

    def test_all_paths_to_merge_node(self, complex_dag_db):
        """测试到合并节点的所有路径"""
        db = complex_dag_db

        parent_ids = ["assistant_h", "assistant_s"]
        node_map, _ = build_dag_from_parents(db, parent_ids)

        # 验证从h到根的路径
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

        # h的路径: a -> c -> h
        h_path = get_path_to_root("user_h", node_map)
        assert "user_a" in h_path
        assert "user_c" in h_path

        # s有多条路径，验证其中一条
        s_paths = [
            ["user_a", "user_d", "user_j", "user_s"],
            ["user_a", "user_c", "user_i", "user_n", "user_s"],
            ["user_a", "user_d", "user_j", "user_o", "user_q", "user_s"],
        ]

        # 验证这些节点都在node_map中
        for path in s_paths:
            for node in path:
                assert node in node_map, f"节点{node}应该在SubDAG中"


class TestLinkedListScenario:
    """
    测试链表场景（线性对话，无分支无合并）

    场景：用户进行连续的线性对话，没有任何分支提问和合并提问
    预期：对话结构退化为链表，拓扑排序结果应与插入顺序一致
    """

    def linked_list_db(self):
        """构建链表结构的测试数据库"""
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
        """测试链表结构的基本属性"""
        db = linked_list_db

        # 每个节点（除了第一个）应该有且只有一个父节点
        for node_id, node in db._nodes.items():
            if node.role == "user":
                if node_id == "user_a":
                    assert node.parent_ids == [], "第一个user节点应该没有parent_ids"
                else:
                    assert len(node.parent_ids) == 1, (
                        f"{node_id}应该有且只有一个parent_id"
                    )
            else:  # assistant
                assert len(node.parent_ids) == 1, f"{node_id}应该有且只有一个parent_id"

        # 每个节点（除了最后一个）应该有且只有一个子节点
        for node_id, node in db._nodes.items():
            if node.role == "assistant":
                if node_id == "assistant_e":
                    assert node.children == [], "最后一个assistant节点应该没有children"
                else:
                    assert len(node.children) == 1, f"{node_id}应该有且只有一个child"

    def test_linked_list_topological_sort(self, linked_list_db):
        """测试链表的拓扑排序"""
        db = linked_list_db

        # 从最后一个节点开始构建SubDAG
        parent_ids = ["assistant_e"]
        node_map, edges = build_dag_from_parents(db, parent_ids)
        sorted_nodes = topological_sort_subdag(node_map, edges)

        # 预期顺序: a, b, c, d, e (问答对顺序)
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
            f"拓扑排序应保持一致性\n实际: {sorted_nodes}\n预期: {expected_order}"
        )

    def test_linked_list_conversation_history(self, linked_list_db):
        """测试链表的对话历史构建"""
        db = linked_list_db

        # 模拟新提问（无parent_ids，表示首次提问）
        # 这种情况应该返回空历史
        empty_history = build_dag_from_parents(db, [])
        assert empty_history == ({}, {})

        # 模拟追加提问（单parent_id）
        parent_ids = ["assistant_e"]
        node_map, edges = build_dag_from_parents(db, parent_ids)
        sorted_nodes = topological_sort_subdag(node_map, edges)

        # 构建历史消息列表
        history = []
        for node_id in sorted_nodes:
            node = node_map[node_id]
            history.append({"role": node["role"], "content": node["content"]})

        # 验证历史顺序
        assert len(history) == 10  # 5个问答对，共10条消息

        # 验证角色交替
        for i, msg in enumerate(history):
            expected_role = "user" if i % 2 == 0 else "assistant"
            assert msg["role"] == expected_role, f"第{i}条消息应该是{expected_role}"


class TestBranchingScenario:
    """
    测试分支场景（有分支，无合并）

    场景：用户进行了分支提问，但没有进行合并提问
    预期：对话结构为分支型DAG，拓扑排序应正确反映DAG的层次结构
    """

    def branching_dag_db(self):
        """构建分支型DAG结构的测试数据库"""
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
        """测试分支型DAG结构的基本属性"""
        db = branching_dag_db

        # 每个节点应该有且只有一个父节点（根节点除外）
        for node_id, node in db._nodes.items():
            if node.role == "user":
                if node_id == "user_a":
                    assert node.parent_ids == [], "根节点应该没有parent_ids"
                else:
                    assert len(node.parent_ids) == 1, (
                        f"分支型DAG中{node_id}应该有且只有一个parent_id"
                    )
            else:  # assistant
                assert len(node.parent_ids) == 1, f"{node_id}应该有且只有一个parent_id"

        # 验证分支节点有多个子节点
        node_b = db._nodes["assistant_b"]
        assert len(node_b.children) == 2, "b应该有2个子节点"

        node_a = db._nodes["assistant_a"]
        assert len(node_a.children) == 3, "a应该有3个子节点"

    def test_branching_no_merge_points(self, branching_dag_db):
        """测试分支型DAG中不存在合并点"""
        db = branching_dag_db

        # 所有节点的parent_ids长度应该 <= 1
        for node_id, node in db._nodes.items():
            assert len(node.parent_ids) <= 1, (
                f"分支型DAG中不应该有合并点，但{node_id}有{len(node.parent_ids)}个parent"
            )

    def test_branching_topological_sort_from_leaf(self, branching_dag_db):
        """测试从叶子节点构建SubDAG并进行拓扑排序"""
        db = branching_dag_db

        # 从叶子节点f开始
        parent_ids = ["assistant_f"]
        node_map, edges = build_dag_from_parents(db, parent_ids)
        sorted_nodes = topological_sort_subdag(node_map, edges)

        # 验证包含的节点: a, b, f
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

        # 验证拓扑顺序：a必须在b之前，b必须在f之前
        def get_index(node_id):
            return sorted_nodes.index(node_id)

        assert get_index("user_a") < get_index("assistant_a")
        assert get_index("assistant_a") < get_index("user_b")
        assert get_index("user_b") < get_index("assistant_b")
        assert get_index("assistant_b") < get_index("user_f")

    def test_branching_subdag_from_multiple_leaves(self, branching_dag_db):
        """测试从多个叶子节点构建SubDAG（模拟合并提问前的状态）"""
        db = branching_dag_db

        # 从e和h两个叶子节点构建SubDAG（类似准备合并提问）
        parent_ids = ["assistant_e", "assistant_h"]
        node_map, edges = build_dag_from_parents(db, parent_ids)

        # 应该包含e的路径(a->b->e)和h的路径(a->d->h)
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

        # 进行拓扑排序
        sorted_nodes = topological_sort_subdag(node_map, edges)

        # 验证顺序约束
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
    """测试边界情况"""

    def test_empty_parent_ids(self):
        """测试空parent_ids"""
        db = MockMongoDB()
        result = build_dag_from_parents(db, [])
        assert result == ({}, {})

    def test_nonexistent_parent_ids(self):
        """测试不存在的parent_ids"""
        db = MockMongoDB()
        result = build_dag_from_parents(db, ["nonexistent_id"])
        assert result == ({}, {})

    def test_single_node(self):
        """测试单节点情况"""
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
    完整测试：使用用户提供的实际对话内容构建复杂DAG

    此测试完整复现用户描述的场景，验证最终拓扑排序结果
    """
    db = MockMongoDB()

    # 定义DAG的偏序关系（用户提供的示例）
    # 格式: (父问答对, 子问答对)
    # 实际存储中，边的关系是：assistant_父 -> user_子

    # 首先创建所有问答对
    qa_pairs = list(USER_QUESTIONS.keys())[:20]  # a-t

    # 构建节点
    for qa_id in qa_pairs:
        # user节点
        user_node = MockMessageNode(
            id=f"user_{qa_id}", role="user", content=USER_QUESTIONS[qa_id]
        )
        db.insert_node(user_node)

        # assistant节点 - parent_ids指向对应的user节点
        assistant_node = MockMessageNode(
            id=f"assistant_{qa_id}",
            role="assistant",
            content=ASSISTANT_ANSWERS[qa_id],
            parent_ids=[f"user_{qa_id}"],  # assistant的parent是user
        )
        db.insert_node(assistant_node)

    # 定义父子关系并更新节点
    # a<-b, a<-c, a<-d, a<-e 表示assistant_a -> user_b, user_c, user_d, user_e
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
        ("j", "n"),  # n有多个父节点（合并点）
        ("j", "o"),
        ("k", "p"),
        ("o", "q"),
        ("j", "s"),
        ("n", "s"),
        ("q", "s"),  # s有多个父节点（合并点）
        ("p", "r"),
        ("k", "t"),
        ("q", "t"),
        ("r", "t"),  # t有多个父节点（合并点）
    ]

    # 更新节点的parent_ids和children
    for parent, child in relationships:
        assistant_parent = db._nodes[f"assistant_{parent}"]
        user_child = db._nodes[f"user_{child}"]

        if f"user_{child}" not in assistant_parent.children:
            assistant_parent.children.append(f"user_{child}")

        if f"assistant_{parent}" not in user_child.parent_ids:
            user_child.parent_ids.append(f"assistant_{parent}")

    # 设置根节点a的parent_ids（空列表表示没有父节点）
    db._nodes["user_a"].parent_ids = []

    # 现在测试新增节点u，parent_ids为[assistant_h, assistant_s]
    # 先创建u节点
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

    # 更新h和s的children
    db._nodes["assistant_h"].children.append("user_u")
    db._nodes["assistant_s"].children.append("user_u")

    # 测试：从h和s构建SubDAG
    parent_ids = ["assistant_h", "assistant_s"]
    node_map, edges = build_dag_from_parents(db, parent_ids)
    sorted_nodes = topological_sort_subdag(node_map, edges)

    # 提取问答对标识
    def get_qa_id(node_id):
        parts = node_id.split("_")
        return parts[1] if len(parts) > 1 else node_id

    qa_sequence = [get_qa_id(nid) for nid in sorted_nodes]

    # 去重后的问答对序列（用于显示和验证）
    qa_sequence_deduplicated = []
    seen = set()
    for qa_id in qa_sequence:
        if qa_id not in seen:
            qa_sequence_deduplicated.append(qa_id)
            seen.add(qa_id)

    # 验证必须包含的节点
    required_nodes = {"a", "c", "d", "h", "i", "j", "n", "o", "q", "s"}
    actual_qa_set = set(qa_sequence_deduplicated)

    for node in required_nodes:
        assert node in actual_qa_set, f"节点{node}应该在SubDAG中"

    # 验证拓扑顺序约束（使用去重后的序列）
    def assert_before(parent, child):
        parent_idx = qa_sequence_deduplicated.index(parent)
        child_idx = qa_sequence_deduplicated.index(child)
        assert parent_idx < child_idx, (
            f"{parent}({parent_idx})必须在{child}({child_idx})之前"
        )

    # 验证关键路径
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

    # 验证o和q的连续性（链不切割）
    # o和q在去重序列中应该是连续的，因为j->o->q形成一条链
    o_idx = qa_sequence_deduplicated.index("o")
    q_idx = qa_sequence_deduplicated.index("q")
    assert q_idx == o_idx + 1, f"o和q应该连续，但o在{o_idx}，q在{q_idx}"

    # 验证h和d的相对顺序（它们都是c的子节点或分支）
    # h是c的分支，d是c的兄弟分支
    # 由于c的入度为1，出度为2，h和i都是c的子节点
    # 而d是c的兄弟（都是a的子节点），d的入度为1，出度为2
    # 因此拓扑排序可能有多种合法结果

    print("\n最终拓扑排序结果（问答对序列）:")
    print(qa_sequence_deduplicated)
    print(f"\n✓ 验证通过：共{len(qa_sequence_deduplicated)}个问答对")
    print(f"✓ a在第一位: {qa_sequence_deduplicated[0] == 'a'}")
    print(f"✓ o和q连续且o在q之前: o@{o_idx}, q@{q_idx}")
    print("✓ 所有路径约束满足")


if __name__ == "__main__":
    # 运行测试
    print("=" * 60)
    print("开始运行DAG对话结构测试")
    print("=" * 60)

    # 运行完整复杂DAG测试
    print("\n1. 测试复杂DAG场景（包含分支和合并）...")
    test_complex_dag_with_user_questions()
    print("✓ 复杂DAG测试通过")

    print("\n2. 测试边界情况...")
    edge_cases = TestEdgeCases()
    edge_cases.test_empty_parent_ids()
    edge_cases.test_nonexistent_parent_ids()
    edge_cases.test_single_node()
    print("✓ 边界情况测试通过")

    print("\n" + "=" * 60)
    print("所有测试通过！")
    print("=" * 60)
