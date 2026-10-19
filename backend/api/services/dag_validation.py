"""DAG structure validation helpers."""

from typing import Any

from bson import ObjectId
from bson.errors import InvalidId


class DAGValidationError(ValueError):
    """Raised when a requested DAG update would violate an invariant."""


def validate_parent_ids(
    mongo_db: Any, conversation_id: str, parent_ids: list[str] | None
) -> None:
    """Validate that all parent nodes exist in the same conversation."""
    if not parent_ids:
        return

    if len(set(parent_ids)) != len(parent_ids):
        raise DAGValidationError("Duplicate parent_ids are not allowed")

    try:
        object_ids = [ObjectId(parent_id) for parent_id in parent_ids]
    except (InvalidId, TypeError) as exc:
        raise DAGValidationError("Invalid parent_ids format") from exc

    nodes = mongo_db.find("message_node", {"_id": {"$in": object_ids}})
    if len(nodes) != len(object_ids):
        raise DAGValidationError("One or more parent_ids do not exist")

    for node in nodes:
        if node.get("conversation_id") != conversation_id:
            raise DAGValidationError(
                "Parent message belongs to a different conversation"
            )


def validate_topological_result(node_map: dict, sorted_node_ids: list[str]) -> None:
    """Validate that the traversal consumed the whole DAG without cycles."""
    if len(sorted_node_ids) != len(node_map):
        raise DAGValidationError("DAG contains a cycle or unreachable nodes")

    roots = [
        node_id
        for node_id, node in node_map.items()
        if not any(parent_id in node_map for parent_id in node.get("parent_ids", []))
    ]
    if len(roots) != 1:
        raise DAGValidationError("DAG must contain exactly one root node")
