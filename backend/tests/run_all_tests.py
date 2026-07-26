"""
DAG conversation structure test runner

Run all test scenarios:
1. Linked list scenario (linear conversation)
2. Branching scenario (branching only, no merging)
3. Complex DAG scenario (branching + merging)
"""

import os
import sys

sys.path.insert(
    0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
)

from backend.tests.test_dag_chat import (
    TestBranchingScenario,
    TestComplexDAG,
    TestEdgeCases,
    TestLinkedListScenario,
    test_complex_dag_with_user_questions,
)


def _run_single_test(name: str, test_fn, db=None) -> bool:
    """Run one test in isolation — a single failure must not block the rest."""
    try:
        if db is not None:
            test_fn(db)
        else:
            test_fn()
        print(f"  ✓ {name}")
        return True
    except AssertionError as e:
        print(f"  ✗ {name}: {e}")
        return False
    except Exception:  # noqa: BLE001 — intentional: test isolation, must catch everything
        print(f"  ✗ {name}: Exception")
        return False


def run_linked_list_tests():
    """Run linked list scenario tests"""
    print("\n" + "=" * 60)
    print("Test Scenario 1: Linked List (Linear Conversation)")
    print("=" * 60)
    print(
        "Scenario: User has a continuous linear conversation with no branching or merging questions"
    )
    print(
        "Expected: The conversation structure degenerates into a linked list; topological sort result should match insertion order"
    )
    print("-" * 60)

    test = TestLinkedListScenario()
    db = test.linked_list_db()

    tests = [
        ("Linked list structure verification", test.test_linked_list_structure),
        ("Linked list topological sort", test.test_linked_list_topological_sort),
        (
            "Linked list conversation history",
            test.test_linked_list_conversation_history,
        ),
    ]

    passed = 0
    failed = 0

    for name, test_func in tests:
        if _run_single_test(name, test_func, db):
            passed += 1
        else:
            failed += 1

    return passed, failed


def run_branching_tests():
    """Run branching scenario tests"""
    print("\n" + "=" * 60)
    print("Test Scenario 2: Branching DAG (branching, no merging)")
    print("=" * 60)
    print("Scenario: User asked branching questions but no merging questions")
    print(
        "Expected: The conversation structure forms a branching DAG; topological sort should correctly reflect DAG hierarchy"
    )
    print("-" * 60)

    test = TestBranchingScenario()
    db = test.branching_dag_db()

    tests = [
        ("Branching structure verification", test.test_branching_structure),
        ("No merge points verification", test.test_branching_no_merge_points),
        (
            "Topological sort from leaf node",
            test.test_branching_topological_sort_from_leaf,
        ),
        (
            "SubDAG from multiple leaf nodes",
            test.test_branching_subdag_from_multiple_leaves,
        ),
    ]

    passed = 0
    failed = 0

    for name, test_func in tests:
        if _run_single_test(name, test_func, db):
            passed += 1
        else:
            failed += 1

    return passed, failed


def run_complex_dag_tests():
    """Run complex DAG scenario tests"""
    print("\n" + "=" * 60)
    print("Test Scenario 3: Complex DAG (branching + merging)")
    print("=" * 60)
    print("Scenario: User asked both branching and merging questions")
    print(
        "Expected: The conversation structure forms a DAG that correctly handles SubDAG construction and topological sorting for merged questions"
    )
    print("-" * 60)

    test = TestComplexDAG()
    db = test.complex_dag_db()

    tests = [
        ("DAG structure verification", test.test_dag_structure),
        (
            "SubDAG construction for merge node",
            test.test_subdag_building_for_merge_node,
        ),
        ("Topological sort for merge node", test.test_topological_sort_for_merge_node),
        ("All paths to merge node", test.test_all_paths_to_merge_node),
    ]

    passed = 0
    failed = 0

    for name, test_func in tests:
        if _run_single_test(name, test_func, db):
            passed += 1
        else:
            failed += 1

    return passed, failed


def run_edge_cases_tests():
    """Run edge case tests"""
    print("\n" + "=" * 60)
    print("Edge Case Tests")
    print("=" * 60)

    test = TestEdgeCases()

    tests = [
        ("Empty parent_ids", test.test_empty_parent_ids),
        ("Non-existent parent_ids", test.test_nonexistent_parent_ids),
        ("Single node case", test.test_single_node),
    ]

    passed = 0
    failed = 0

    for name, test_func in tests:
        if _run_single_test(name, test_func):
            passed += 1
        else:
            failed += 1

    return passed, failed


def run_integration_test():
    """Run integration test (full DAG scenario)"""
    print("\n" + "=" * 60)
    print("Integration Test: Full DAG Scenario")
    print("=" * 60)
    print(
        "Build a complex DAG using actual conversation content and verify the final topological sort result"
    )
    print("-" * 60)

    success = _run_single_test(
        "Full DAG integration test", test_complex_dag_with_user_questions
    )
    return (1, 0) if success else (0, 1)


def main():
    """Main function"""
    print("=" * 60)
    print("DAG Conversation Structure Test Suite")
    print("=" * 60)
    print()
    print(
        "Test objective: Verify the backend DAG conversation structure processing logic of the LLM Q&A application"
    )
    print()

    total_passed = 0
    total_failed = 0

    # 运行所有测试
    scenarios = [
        ("Linked list scenario", run_linked_list_tests),
        ("Branching scenario", run_branching_tests),
        ("Complex DAG scenario", run_complex_dag_tests),
        ("Edge cases", run_edge_cases_tests),
        ("Integration test", run_integration_test),
    ]

    for name, run_func in scenarios:  # pylint: disable=unused-variable
        passed, failed = run_func()
        total_passed += passed
        total_failed += failed

    # 打印总结
    print("\n" + "=" * 60)
    print("Test Results Summary")
    print("=" * 60)
    print(f"Passed: {total_passed}")
    print(f"Failed: {total_failed}")
    print(f"Total: {total_passed + total_failed}")

    if total_failed == 0:
        print("\n✓ All tests passed!")
        print("=" * 60)
        return 0

    print(f"\n✗ {total_failed} test(s) failed")
    print("=" * 60)
    return 1


if __name__ == "__main__":
    sys.exit(main())
