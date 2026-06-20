import type {
  NotificationDetailCondition,
  NotificationDetailConditionGroup,
  NotificationDetailConditionRoot
} from "./types";

export function canMatchWithoutAttack(condition: NotificationDetailCondition): boolean {
  if (condition.field !== "attackCount") {
    return true;
  }

  if (condition.operator === ">=") {
    return condition.value <= 0;
  }

  return true;
}

export function canConditionNodeMatchWithoutAttack(
  node: NotificationDetailCondition | NotificationDetailConditionGroup
): boolean {
  if (node.type === "condition") {
    return canMatchWithoutAttack(node);
  }

  if (node.operator === "AND") {
    return node.children.every(canMatchWithoutAttack);
  }

  return node.children.some(canMatchWithoutAttack);
}

export function hasNonAttackingTargetWarning(detailConditions: NotificationDetailConditionRoot): boolean {
  return detailConditions.children.some(canConditionNodeMatchWithoutAttack);
}
