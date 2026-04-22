# DAG Conversation Structure Test Documentation

## Test Objectives

This test module verifies the correctness of the backend DAG (Directed Acyclic Graph) conversation structure processing logic for the LLM Q&A application.

## Core Concepts

### 1. Q&A Pair
- The smallest conversation unit, consisting of a user question (user.message) and an assistant answer (assistant.message)
- Logically indivisible

### 2. Message Relationships
- `parent_ids`: List of parent message (answer) IDs
- `children`: List of child message (question) IDs
- user.message's children are assistant.messages
- assistant.message's parent_ids are user.messages

### 3. Special Relationships
- **First question**: user.message's parent_ids is empty
- **Branching question**: Multiple user.messages' parent_ids contain the same assistant.message.id
- **Merging question**: A single user.message's parent_ids contains multiple distinct assistant.message.ids

### 4. DAG Structure
- The entire conversation forms a directed acyclic graph (DAG)
- Exactly one root node (the first Q&A pair)
- Supports branching and merging

## Test Scenarios

### Scenario 1: Linked List (Linear Conversation)

#### Structure
```
user_a → assistant_a → user_b → assistant_b → user_c → assistant_c → ...
```

#### Characteristics
- No branching questions (each assistant has at most one child)
- No merging questions (each user has only one parent)
- Conversation structure degenerates into a linked list

#### Expected Topological Sort
```
['user_a', 'assistant_a', 'user_b', 'assistant_b', 'user_c', 'assistant_c', ...]
```

Matches insertion order exactly.

---

### Scenario 2: Tree (Branching, No Merging)

#### Structure
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

#### Characteristics
- Has branching questions (assistant_a has 3 child nodes)
- No merging questions (each node has only one parent)
- Conversation structure degenerates into a tree

#### Topological Sort of SubDAG Built from Leaf Node e
```
['user_a', 'assistant_a', 'user_b', 'assistant_b', 'user_e', 'assistant_e']
```

Only includes the path from root to leaf e, excluding the c and d branches.

---

### Scenario 3: Complex DAG (Branching + Merging)

#### Full Structure
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

#### Merge Point Example
```
                    user_n (merge point)
                     ↓
               assistant_n
                     │
        ┌────────────┼────────────┐
        ↓            ↓            ↓
   assistant_i   assistant_j   assistant_q
        ↑            ↑            ↑
     user_i        user_j       user_q
```

Node n (user question) has parent_ids containing both assistant_i and assistant_j — this is a merge point.

#### SubDAG for New Node u
When a new node u is added with parent_ids [h, s]:

**Included paths:**
- a → c → h
- a → d → j → s
- a → c → i → n → s
- a → d → j → n → s
- a → d → j → o → q → s

**Topological sort result:**
```
['a', 'c', 'h', 'd', 'j', 'o', 'q', 'i', 'n', 's']
```

**Notes:**
- o and q remain consecutive (chain not split)
- a is always first (root node)
- All parent-child relationship constraints are satisfied

---

## DAG Node Relationship Definitions (Complete)

```
a←b, a←c, a←d, a←e
b←f, b←g
c←h, c←i
d←j, d←k
e←l, e←m
i←n, j←n        (n is a merge point: two parent nodes i and j)
j←o
k←p
o←q
j←s, n←s, q←s   (s is a merge point: three parent nodes j, n, q)
p←r
k←t, q←t, r←t   (t is a merge point: three parent nodes k, q, r)
h←u, s←u        (u is a merge point: two parent nodes h and s)
```

Notation: `parent←child` means the child node depends on the parent node in the SubDAG

---

## Running Tests

### Method 1: Using the test runner (recommended)
```bash
cd backend
python tests/run_all_tests.py
```

### Method 2: Using pytest
```bash
cd backend
python -m pytest tests/test_dag_chat.py -v
```

### Method 3: Running test file directly
```bash
cd backend
python tests/test_dag_chat.py
```

---

## Test Coverage

### Core Functionality Tests
| Test Item | Description |
|-----------|-------------|
| DAG construction | `build_dag_from_parents()` - Build SubDAG by tracing upward from parent_ids |
| Topological sort | `topological_sort_subdag()` - Topologically sort SubDAG while preserving chains |
| History construction | `build_history_from_parent_ids()` - Generate history message list in LLM API format |

### Scenario Tests
| Scenario | Test Content |
|----------|--------------|
| Linked list | Linear conversation structure validation, topological sort consistency, conversation history construction |
| Tree | Tree structure validation, no-merge-point verification, SubDAG from leaf node, SubDAG from multiple leaf nodes |
| Complex DAG | DAG structure validation, merge point identification, SubDAG construction, topological sort constraint verification |

### Edge Case Tests
| Test Item | Description |
|-----------|-------------|
| Empty parent_ids | First question scenario |
| Non-existent parent_ids | Error handling |
| Single node | Minimum conversation unit |

---

## Conversation Content Description

### User Questions (USER_QUESTIONS)
| Node | Question |
|------|----------|
| a | What are the four major cities in China? |
| b-h | City introductions and local food/tourism |
| n | Shanghai + Guangzhou travel guide |
| o-q | Food-related follow-up questions |
| s-t | Social media post requests |
| u | Transportation recommendations based on social media post |

### Assistant Answers (ASSISTANT_ANSWERS)
Uses pre-defined mock answers, not actual AI-generated content.

---

## Implementation Details

### 1. SubDAG Construction
```python
def build_dag_from_parents(mongo_db, parent_ids):
    """
    Build SubDAG by tracing upward from parent_ids
    - Uses BFS traversal to collect all related nodes
    - Only includes nodes reachable by tracing upward from parent_ids
    - Returns node mapping and edge relationships
    """
```

### 2. Topological Sort (Chain Preservation)
```python
def topological_sort_subdag(node_map, edges):
    """
    Topologically sort the SubDAG
    - Calculate in-degrees and out-degrees
    - Uses modified Kahn's algorithm
    - Preserve chains: if consecutive nodes form a chain (out-degree 1 and in-degree 1), keep them consecutive
    """
```

### 3. History Message Construction
```python
def build_history_from_parent_ids(mongo_db, parent_ids):
    """
    Build history messages
    1. Build SubDAG
    2. Topological sort
    3. Convert to standard format
    """
```

---

## Verification Points

1. **Topological order correctness**: In all parent-child relationships, parent nodes must appear before child nodes
2. **Chain preservation**: Consecutive nodes forming a chain (both in-degree and out-degree are 1) should remain consecutive
3. **SubDAG completeness**: Include all relevant paths, exclude irrelevant branches
4. **Edge case handling**: Empty parent_ids, non-existent IDs, single nodes, etc.

---

## Extension Guide

To add new test scenarios:

1. Add new test classes or methods in `test_dag_chat.py`
2. Use `MockMongoDB` to simulate the database
3. Use `MockMessageNode` to create test nodes
4. Call `build_dag_from_parents` and `topological_sort_subdag` for verification
5. Add test runner logic in `run_all_tests.py`
