"""pytest fixtures for DAG test classes.

The test methods in test_dag_chat.py accept db instances as parameters
(complex_dag_db, linked_list_db, branching_dag_db) so they can be driven
by both pytest and the standalone run_all_tests.py runner.  These fixtures
bridge the gap: pytest discovers them here and injects them automatically;
the standalone runner calls the class methods directly.
"""

import pytest

from backend.tests.test_dag_chat import (
    TestBranchingScenario,
    TestComplexDAG,
    TestLinkedListScenario,
)


@pytest.fixture
def complex_dag_db():
    return TestComplexDAG().complex_dag_db()


@pytest.fixture
def linked_list_db():
    return TestLinkedListScenario().linked_list_db()


@pytest.fixture
def branching_dag_db():
    return TestBranchingScenario().branching_dag_db()
