"""Tests for DAG write validation and topological completeness checks."""

import pytest
from bson import ObjectId

from backend.api.routes.chat import topological_sort_subdag
from backend.api.services.dag_validation import (
    DAGValidationError,
    validate_parent_ids,
    validate_topological_result,
)


class FakeMongo:
    def __init__(self, nodes):
        self.nodes = nodes

    def find(self, collection_name, query, projection=None, sort=None):
        ids = query.get("_id", {}).get("$in", [])
        return [node for node in self.nodes if node["_id"] in ids]


def test_validate_parent_ids_accepts_same_conversation():
    parent_id = ObjectId()
    db = FakeMongo([{"_id": parent_id, "conversation_id": "c1"}])
    validate_parent_ids(db, "c1", [str(parent_id)])


def test_validate_parent_ids_rejects_missing_parent():
    db = FakeMongo([])
    with pytest.raises(DAGValidationError, match="do not exist"):
        validate_parent_ids(db, "c1", [str(ObjectId())])


def test_validate_parent_ids_rejects_cross_conversation_parent():
    parent_id = ObjectId()
    db = FakeMongo([{"_id": parent_id, "conversation_id": "other"}])
    with pytest.raises(DAGValidationError, match="different conversation"):
        validate_parent_ids(db, "c1", [str(parent_id)])


def test_validate_parent_ids_rejects_duplicates():
    parent_id = ObjectId()
    db = FakeMongo([{"_id": parent_id, "conversation_id": "c1"}])
    with pytest.raises(DAGValidationError, match="Duplicate"):
        validate_parent_ids(db, "c1", [str(parent_id), str(parent_id)])


def test_validate_topological_result_rejects_cycle():
    node_map = {
        "a": {"parent_ids": ["b"]},
        "b": {"parent_ids": ["a"]},
    }
    with pytest.raises(DAGValidationError, match="cycle"):
        validate_topological_result(node_map, ["a"])


def test_validate_topological_result_rejects_multiple_roots():
    node_map = {
        "a": {"parent_ids": []},
        "b": {"parent_ids": []},
    }
    with pytest.raises(DAGValidationError, match="exactly one root"):
        validate_topological_result(node_map, ["a", "b"])


def test_validate_topological_result_accepts_valid_dag():
    node_map = {
        "root": {"parent_ids": []},
        "child": {"parent_ids": ["root"]},
    }
    validate_topological_result(node_map, ["root", "child"])


def test_topological_sort_rejects_cycle():
    node_map = {
        "a": {"parent_ids": ["b"]},
        "b": {"parent_ids": ["a"]},
    }
    edges = {"a": ["b"], "b": ["a"]}
    with pytest.raises(DAGValidationError, match="cycle"):
        topological_sort_subdag(node_map, edges)


def test_topological_sort_rejects_multiple_roots():
    node_map = {
        "a": {"parent_ids": []},
        "b": {"parent_ids": []},
    }
    with pytest.raises(DAGValidationError, match="exactly one root"):
        topological_sort_subdag(node_map, {})
