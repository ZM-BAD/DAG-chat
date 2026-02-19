#!/usr/bin/env python3
"""
DAG对话结构测试运行器

运行所有测试场景：
1. 链表场景（线性对话）
2. 分支场景（有分支，无合并）
3. 复杂DAG场景（分支+合并）
"""

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.tests.test_dag_chat import (
    TestLinkedListScenario,
    TestBranchingScenario,
    TestComplexDAG,
    TestEdgeCases,
    test_complex_dag_with_user_questions,
)


def run_linked_list_tests():
    """运行链表场景测试"""
    print("\n" + "=" * 60)
    print("测试场景1: 链表（线性对话）")
    print("=" * 60)
    print("场景描述：用户进行连续的线性对话，没有任何分支提问和合并提问")
    print("预期结果：对话结构退化为链表，拓扑排序结果应与插入顺序一致")
    print("-" * 60)

    test = TestLinkedListScenario()
    db = test.linked_list_db()

    tests = [
        ("链表结构验证", test.test_linked_list_structure),
        ("链表拓扑排序", test.test_linked_list_topological_sort),
        ("链表对话历史", test.test_linked_list_conversation_history),
    ]

    passed = 0
    failed = 0

    for name, test_func in tests:
        try:
            test_func(db)
            print(f"  ✓ {name}")
            passed += 1
        except AssertionError as e:
            print(f"  ✗ {name}: {e}")
            failed += 1
        except Exception as e:
            print(f"  ✗ {name}: 异常 - {e}")
            failed += 1

    return passed, failed


def run_branching_tests():
    """运行分支场景测试"""
    print("\n" + "=" * 60)
    print("测试场景2: 分支型DAG（有分支，无合并）")
    print("=" * 60)
    print("场景描述：用户进行了分支提问，但没有进行合并提问")
    print("预期结果：对话结构为分支型DAG，拓扑排序应正确反映DAG的层次结构")
    print("-" * 60)

    test = TestBranchingScenario()
    db = test.branching_dag_db()

    tests = [
        ("分支结构验证", test.test_branching_structure),
        ("分支无合并点验证", test.test_branching_no_merge_points),
        ("分支从叶子节点拓扑排序", test.test_branching_topological_sort_from_leaf),
        ("分支从多叶子节点构建SubDAG", test.test_branching_subdag_from_multiple_leaves),
    ]

    passed = 0
    failed = 0

    for name, test_func in tests:
        try:
            test_func(db)
            print(f"  ✓ {name}")
            passed += 1
        except AssertionError as e:
            print(f"  ✗ {name}: {e}")
            failed += 1
        except Exception as e:
            print(f"  ✗ {name}: 异常 - {e}")
            failed += 1

    return passed, failed


def run_complex_dag_tests():
    """运行复杂DAG场景测试"""
    print("\n" + "=" * 60)
    print("测试场景3: 复杂DAG（分支+合并）")
    print("=" * 60)
    print("场景描述：用户既进行分支提问，也进行合并提问")
    print("预期结果：对话结构形成DAG，能正确处理合并提问的SubDAG构建和拓扑排序")
    print("-" * 60)

    test = TestComplexDAG()
    db = test.complex_dag_db()

    tests = [
        ("DAG结构验证", test.test_dag_structure),
        ("合并提问SubDAG构建", test.test_subdag_building_for_merge_node),
        ("合并提问拓扑排序", test.test_topological_sort_for_merge_node),
        ("到合并节点的所有路径", test.test_all_paths_to_merge_node),
    ]

    passed = 0
    failed = 0

    for name, test_func in tests:
        try:
            test_func(db)
            print(f"  ✓ {name}")
            passed += 1
        except AssertionError as e:
            print(f"  ✗ {name}: {e}")
            failed += 1
        except Exception as e:
            print(f"  ✗ {name}: 异常 - {e}")
            failed += 1

    return passed, failed


def run_edge_cases_tests():
    """运行边界情况测试"""
    print("\n" + "=" * 60)
    print("边界情况测试")
    print("=" * 60)

    test = TestEdgeCases()

    tests = [
        ("空parent_ids", test.test_empty_parent_ids),
        ("不存在的parent_ids", test.test_nonexistent_parent_ids),
        ("单节点情况", test.test_single_node),
    ]

    passed = 0
    failed = 0

    for name, test_func in tests:
        try:
            test_func()
            print(f"  ✓ {name}")
            passed += 1
        except AssertionError as e:
            print(f"  ✗ {name}: {e}")
            failed += 1
        except Exception as e:
            print(f"  ✗ {name}: 异常 - {e}")
            failed += 1

    return passed, failed


def run_integration_test():
    """运行集成测试（完整DAG场景）"""
    print("\n" + "=" * 60)
    print("集成测试: 完整DAG场景")
    print("=" * 60)
    print("使用实际对话内容构建复杂DAG，验证最终拓扑排序结果")
    print("-" * 60)

    try:
        test_complex_dag_with_user_questions()
        print("  ✓ 完整DAG集成测试")
        return 1, 0
    except AssertionError as e:
        print(f"  ✗ 完整DAG集成测试: {e}")
        return 0, 1
    except Exception as e:
        print(f"  ✗ 完整DAG集成测试: 异常 - {e}")
        return 0, 1


def main():
    """主函数"""
    print("=" * 60)
    print("DAG对话结构测试套件")
    print("=" * 60)
    print()
    print("测试目标：验证大模型问答应用的后端DAG对话结构处理逻辑")
    print()

    total_passed = 0
    total_failed = 0

    # 运行所有测试
    scenarios = [
        ("链表场景", run_linked_list_tests),
        ("分支场景", run_branching_tests),
        ("复杂DAG场景", run_complex_dag_tests),
        ("边界情况", run_edge_cases_tests),
        ("集成测试", run_integration_test),
    ]

    for name, run_func in scenarios:
        passed, failed = run_func()
        total_passed += passed
        total_failed += failed

    # 打印总结
    print("\n" + "=" * 60)
    print("测试结果汇总")
    print("=" * 60)
    print(f"通过: {total_passed}")
    print(f"失败: {total_failed}")
    print(f"总计: {total_passed + total_failed}")

    if total_failed == 0:
        print("\n✓ 所有测试通过！")
        print("=" * 60)
        return 0
    else:
        print(f"\n✗ {total_failed}个测试失败")
        print("=" * 60)
        return 1


if __name__ == "__main__":
    sys.exit(main())
