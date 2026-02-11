# DAG对话结构测试文档

## 测试目标

本测试模块用于验证大模型问答应用的后端DAG（有向无环图）对话结构处理逻辑的正确性。

## 核心概念

### 1. 问答对（Q&A Pair）
- 最小对话单元，由一个用户提问（user.message）和一个助手回答（assistant.message）组成
- 在逻辑上不可分割

### 2. 消息关联关系
- `parent_ids`: 指向父消息（回答）的ID列表
- `children`: 指向子消息（提问）的ID列表
- user.message的children是assistant.message
- assistant.message的parent_ids是user.message

### 3. 特殊关系
- **首个提问**: user.message的parent_ids为空
- **分支提问**: 多个user.message的parent_ids包含同一个assistant.message.id
- **合并提问**: 一个user.message的parent_ids包含多个不同的assistant.message.id

### 4. DAG结构
- 整个对话构成一个有向无环图（DAG）
- 有且仅有一个根节点（第一次问答）
- 支持分支和合并

## 测试场景

### 场景1: 链表（线性对话）

#### 结构说明
```
user_a → assistant_a → user_b → assistant_b → user_c → assistant_c → ...
```

#### 特点
- 无分支提问（每个assistant最多一个child）
- 无合并提问（每个user只有一个parent）
- 对话结构退化为链表

#### 预期拓扑排序
```
['user_a', 'assistant_a', 'user_b', 'assistant_b', 'user_c', 'assistant_c', ...]
```

与插入顺序完全一致。

---

### 场景2: 树（有分支，无合并）

#### 结构说明
```
              user_a
                ↓
           assistant_a
          /     |     \
      user_b  user_c  user_d
         ↓      ↓       ↓
    assistant_b ...   assistant_d
       /   \
  user_e   user_f
```

#### 特点
- 有分支提问（assistant_a有3个子节点）
- 无合并提问（每个节点只有一个父节点）
- 对话结构退化为树

#### 从叶子节点e构建SubDAG的拓扑排序
```
['user_a', 'assistant_a', 'user_b', 'assistant_b', 'user_e', 'assistant_e']
```

只包含从根到叶子e的路径，不包含c和d分支。

---

### 场景3: 复杂DAG（分支+合并）

#### 完整结构
```
                        user_a
                          ↓
                    assistant_a
        ┌──────────┬──────────┬──────────┐
        ↓          ↓          ↓          ↓
     user_b     user_c     user_d     user_e
        ↓          ↓          ↓          ↓
   assistant_b assistant_c assistant_d assistant_e
    ┌────┐     ┌────┐     ┌────┐     ┌────┐
    ↓    ↓     ↓    ↓     ↓    ↓     ↓    ↓
 user_f user_g user_h user_i user_j user_k user_l user_m
```

#### 合并点示例
```
                    user_n (合并提问)
                     ↓
               assistant_n
                     │
        ┌────────────┼────────────┐
        ↓            ↓            ↓
   assistant_i   assistant_j   assistant_q
        ↑            ↑            ↑
     user_i        user_j       user_q
```

节点n（用户提问）的parent_ids同时包含assistant_i和assistant_j，这是一个合并点。

#### 新增节点u的SubDAG
当用户新增节点u，parent_ids为[h, s]时：

**包含的路径：**
- a → c → h
- a → d → j → s
- a → c → i → n → s
- a → d → j → n → s
- a → d → j → o → q → s

**拓扑排序结果：**
```
['a', 'c', 'h', 'd', 'j', 'o', 'q', 'i', 'n', 's']
```

**注意：**
- o和q保持连续（链不切割）
- a始终在第一位（根节点）
- 所有父子关系约束都满足

---

## DAG节点关系定义（完整）

```
a←b, a←c, a←d, a←e
b←f, b←g
c←h, c←i
d←j, d←k
e←l, e←m
i←n, j←n        (n是合并点：两个父节点i和j)
j←o
k←p
o←q
j←s, n←s, q←s   (s是合并点：三个父节点j、n、q)
p←r
k←t, q←t, r←t   (t是合并点：三个父节点k、q、r)
h←u, s←u        (u是合并点：两个父节点h和s)
```

符号说明：`父←子` 表示在SubDAG中子节点依赖于父节点

---

## 运行测试

### 方式1: 使用测试运行器（推荐）
```bash
cd backend
python tests/run_all_tests.py
```

### 方式2: 使用pytest
```bash
cd backend
python -m pytest tests/test_dag_chat.py -v
```

### 方式3: 直接运行测试文件
```bash
cd backend
python tests/test_dag_chat.py
```

---

## 测试覆盖

### 核心功能测试
| 测试项 | 描述 |
|--------|------|
| DAG构建 | `build_dag_from_parents()` - 从parent_ids向上追溯构建SubDAG |
| 拓扑排序 | `topological_sort_subdag()` - 对SubDAG进行拓扑排序，保持链不切割 |
| 历史构建 | `build_history_from_parent_ids()` - 生成符合大模型API格式的历史消息列表 |

### 场景测试
| 场景 | 测试内容 |
|------|----------|
| 链表 | 线性对话结构验证、拓扑排序一致性、对话历史构建 |
| 树 | 树结构验证、无合并点验证、从叶子节点构建SubDAG、从多叶子节点构建SubDAG |
| 复杂DAG | DAG结构验证、合并点识别、SubDAG构建、拓扑排序约束验证 |

### 边界情况测试
| 测试项 | 描述 |
|--------|------|
| 空parent_ids | 首次提问场景 |
| 不存在的parent_ids | 错误处理 |
| 单节点 | 最小对话单元 |

---

## 对话内容说明

### 用户提问（USER_QUESTIONS）
| 节点 | 问题 |
|------|------|
| a | 中国四大城市分别是？ |
| b-h | 各城市介绍及美食/旅游 |
| n | 上海+广州旅游攻略 |
| o-q | 美食相关追问 |
| s-t | 朋友圈文案请求 |
| u | 基于朋友圈的交通推荐 |

### 助手回答（ASSISTANT_ANSWERS）
使用预设的模拟回答，不代表真实的AI生成内容。

---

## 实现要点

### 1. SubDAG构建
```python
def build_dag_from_parents(mongo_db, parent_ids):
    """
    从parent_ids开始向上追溯，构建SubDAG
    - 使用BFS遍历收集所有相关节点
    - 只包含从parent_ids向上追溯能到达的节点
    - 返回节点映射和边关系
    """
```

### 2. 拓扑排序（链不切割）
```python
def topological_sort_subdag(node_map, edges):
    """
    对SubDAG进行拓扑排序
    - 计算入度和出度
    - 使用改进的Kahn算法
    - 保持链不切割：如果连续节点能形成链（出度为1且入度为1），则保持连续
    """
```

### 3. 历史消息构建
```python
def build_history_from_parent_ids(mongo_db, parent_ids):
    """
    构建历史消息
    1. 构建SubDAG
    2. 拓扑排序
    3. 转换为标准格式
    """
```

---

## 验证要点

1. **拓扑顺序正确性**：所有父子关系中，父节点必须在子节点之前
2. **链不切割**：连续节点如果形成链（出度入度都为1），应保持连续
3. **SubDAG完整性**：包含所有相关路径，不包含无关分支
4. **边界情况处理**：空parent_ids、不存在的ID、单节点等

---

## 扩展建议

如需添加新的测试场景：

1. 在`test_dag_chat.py`中添加新的测试类或方法
2. 使用`MockMongoDB`模拟数据库
3. 使用`MockMessageNode`创建测试节点
4. 调用`build_dag_from_parents`和`topological_sort_subdag`验证
5. 在`run_all_tests.py`中添加测试运行逻辑
