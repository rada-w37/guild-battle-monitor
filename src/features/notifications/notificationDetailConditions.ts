import type {
  NotificationDetailCondition,
  NotificationDetailConditionGroup,
  NotificationDetailConditionRoot
} from "./types";

export type NotificationDetailConditionDragSource =
  | { readonly scope: "root"; readonly index: number }
  | { readonly scope: "group"; readonly groupIndex: number; readonly conditionIndex: number };

export type NotificationDetailConditionDropTarget =
  | { readonly scope: "root"; readonly index: number }
  | { readonly scope: "group"; readonly groupIndex: number; readonly index: number };

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

export function moveDetailConditionNode(
  detailConditions: NotificationDetailConditionRoot,
  source: NotificationDetailConditionDragSource,
  target: NotificationDetailConditionDropTarget
): NotificationDetailConditionRoot {
  if (source.scope === "root" && target.scope === "root") {
    return {
      ...detailConditions,
      children: moveArrayItem(detailConditions.children, source.index, target.index)
    };
  }

  if (
    source.scope === "group" &&
    target.scope === "group" &&
    source.groupIndex === target.groupIndex
  ) {
    return {
      ...detailConditions,
      children: detailConditions.children.map((child, childIndex) => {
        if (childIndex !== source.groupIndex || child.type !== "group") {
          return child;
        }

        return {
          ...child,
          children: moveArrayItem(child.children, source.conditionIndex, target.index)
        };
      })
    };
  }

  return detailConditions;
}

function moveArrayItem<T>(values: readonly T[], sourceIndex: number, targetIndex: number): readonly T[] {
  if (
    sourceIndex < 0 ||
    sourceIndex >= values.length ||
    targetIndex < 0 ||
    targetIndex > values.length ||
    sourceIndex === targetIndex ||
    sourceIndex + 1 === targetIndex
  ) {
    return values;
  }

  const nextValues = [...values];
  const [movedValue] = nextValues.splice(sourceIndex, 1);
  nextValues.splice(sourceIndex < targetIndex ? targetIndex - 1 : targetIndex, 0, movedValue);
  return nextValues;
}
