import { loadFirebaseServices } from "../../lib/firebase";
import type {
  NotificationDestination,
  NotificationDetailCondition,
  NotificationDetailConditionGroup,
  NotificationDestinationInput,
  NotificationBattleSide,
  NotificationRule,
  NotificationRuleInput,
  NotificationRuleV2,
  NotificationRuleV2Input,
  NotificationSettings,
  NotificationSettingsV2
} from "./types";

const DEFAULT_REPEAT_NOTIFICATION_INTERVAL_SECONDS = 300;
const MIN_REPEAT_NOTIFICATION_INTERVAL_SECONDS = 30;
const MAX_REPEAT_NOTIFICATION_INTERVAL_SECONDS = 2700;

export interface NotificationSettingsRequest {
  readonly guildId: string;
  readonly accessKey?: string;
}

export interface SaveNotificationRuleRequest extends NotificationSettingsRequest {
  readonly ruleId?: string;
  readonly rule: NotificationRuleInput;
}

export interface SaveNotificationRuleV2Request extends NotificationSettingsRequest {
  readonly ruleId?: string;
  readonly rule: NotificationRuleV2Input;
}

export interface DeleteNotificationRuleRequest extends NotificationSettingsRequest {
  readonly ruleId: string;
}

export interface SuspendNotificationRuleRequest extends NotificationSettingsRequest {
  readonly ruleId: string;
}

export interface NotificationRuleTemporarySuspension {
  readonly suspendedAt: string;
  readonly expiresAt: string;
  readonly suspendedBy?: {
    readonly role?: "guildOwner" | "admin";
    readonly uid?: string;
  };
}

export interface SaveNotificationDestinationRequest {
  readonly guildId: string;
  readonly destination: NotificationDestinationInput;
}

export interface GuildBattleGuildCandidate {
  readonly guildId: string;
  readonly guildName: string;
  readonly rank: number;
}

export interface SyncGuildBattleGuildCandidatesOutput {
  readonly worldId: number;
  readonly candidates: readonly GuildBattleGuildCandidate[];
  readonly syncedAt?: unknown;
}

export interface SyncGuildBattleGuildCandidatesRequest extends NotificationSettingsRequest {
  readonly world?: number;
}

export async function getNotificationSettings(input: NotificationSettingsRequest): Promise<NotificationSettings> {
  const result = await callFunction("getNotificationSettings", input);
  return createNotificationSettings(result);
}

export async function getNotificationSettingsV2(input: NotificationSettingsRequest): Promise<NotificationSettingsV2> {
  const result = await callFunction("getNotificationSettingsV2", input);
  return createNotificationSettingsV2(result);
}

export async function saveNotificationRule(input: SaveNotificationRuleRequest): Promise<NotificationRule> {
  const result = await callFunction("saveNotificationRule", input);
  return createNotificationRule(result);
}

export async function saveNotificationRuleV2(input: SaveNotificationRuleV2Request): Promise<NotificationRuleV2> {
  const result = await callFunction("saveNotificationRuleV2", input);
  return createNotificationRuleV2(result);
}

export async function deleteNotificationRule(input: DeleteNotificationRuleRequest): Promise<void> {
  await callFunction("deleteNotificationRule", input);
}

export async function suspendNotificationRule(
  input: SuspendNotificationRuleRequest
): Promise<NotificationRuleTemporarySuspension> {
  const result = await callFunction("suspendNotificationRule", input);
  return createTemporarySuspension(result);
}

export async function saveNotificationDestination(
  input: SaveNotificationDestinationRequest
): Promise<NotificationDestination> {
  const result = await callFunction("saveNotificationDestination", input);
  return createNotificationDestination(result);
}

export async function syncGuildBattleGuildCandidates(
  input: SyncGuildBattleGuildCandidatesRequest
): Promise<SyncGuildBattleGuildCandidatesOutput> {
  const result = await callFunction("syncGuildBattleGuildCandidates", input);
  return createSyncGuildBattleGuildCandidatesOutput(result);
}

async function callFunction(name: string, input: unknown): Promise<unknown> {
  const firebaseState = await loadFirebaseServices();

  if (firebaseState.status !== "available") {
    throw new Error("Functionsを利用できません。");
  }

  const { httpsCallable } = await import("firebase/functions");
  const callable = httpsCallable(firebaseState.services.functions, name);
  const result = await callable(input);
  return result.data;
}

function createNotificationSettings(data: unknown): NotificationSettings {
  if (!isPlainObject(data) || !Array.isArray(data.rules)) {
    throw new Error("通知設定の形式が不正です。");
  }

  return {
    rules: data.rules.map(createNotificationRule),
    ...(data.destination === undefined ? {} : { destination: createNotificationDestination(data.destination) })
  };
}

function createNotificationSettingsV2(data: unknown): NotificationSettingsV2 {
  if (!isPlainObject(data) || !Array.isArray(data.rules)) {
    throw new Error("notification v2 settings response is invalid");
  }

  return {
    rules: data.rules.map(createNotificationRuleV2),
    ...(data.destination === undefined ? {} : { destination: createNotificationDestination(data.destination) })
  };
}

function createNotificationRule(data: unknown): NotificationRule {
  if (
    !isPlainObject(data) ||
    typeof data.id !== "string" ||
    (data.battleType !== "guildBattle" && data.battleType !== "grandBattle") ||
    typeof data.name !== "string" ||
    typeof data.enabled !== "boolean" ||
    !isPlainObject(data.conditions) ||
    !isPlainObject(data.message)
  ) {
    throw new Error("通知ルールの形式が不正です。");
  }

  return {
    id: data.id,
    battleType: data.battleType,
    name: data.name,
    enabled: data.enabled,
    conditions: {
      startTime: typeof data.conditions.startTime === "string" ? data.conditions.startTime : "",
      defenseCountMax:
        typeof data.conditions.defenseCountMax === "number" ? data.conditions.defenseCountMax : null,
      attackCountMin:
        typeof data.conditions.attackCountMin === "number" ? data.conditions.attackCountMin : null
    },
    message: {
      usernameTemplate:
        typeof data.message.usernameTemplate === "string" ? data.message.usernameTemplate : "",
      mention: createMention(data.message.mention),
      titleTemplate: typeof data.message.titleTemplate === "string" ? data.message.titleTemplate : "",
      bodyTemplate: typeof data.message.bodyTemplate === "string" ? data.message.bodyTemplate : ""
    },
    ...(data.createdByRole === "guildOwner" || data.createdByRole === "admin"
      ? { createdByRole: data.createdByRole }
      : {}),
    createdAt: data.createdAt,
    updatedAt: data.updatedAt
  };
}

function createMention(data: unknown): NotificationRule["message"]["mention"] {
  if (!isPlainObject(data)) {
    return { type: "none" };
  }

  if (data.type === "here" || data.type === "everyone" || data.type === "none") {
    return { type: data.type };
  }

  if (data.type === "custom") {
    return {
      type: "custom",
      customText: typeof data.customText === "string" ? data.customText : ""
    };
  }

  return { type: "none" };
}

function createNotificationRuleV2(data: unknown): NotificationRuleV2 {
  if (
    !isPlainObject(data) ||
    typeof data.id !== "string" ||
    data.schemaVersion !== 2 ||
    (data.battleType !== "guildBattle" && data.battleType !== "grandBattle") ||
    (data.battleSide !== undefined && data.battleSide !== "defense" && data.battleSide !== "attack") ||
    typeof data.name !== "string" ||
    typeof data.enabled !== "boolean" ||
    typeof data.sortOrder !== "number" ||
    !isPlainObject(data.schedule) ||
    !isPlainObject(data.detailConditions) ||
    !isPlainObject(data.message)
  ) {
    throw new Error("notification v2 rule response is invalid");
  }

  return {
    id: data.id,
    schemaVersion: 2,
    battleType: data.battleType,
    battleSide: createNotificationBattleSide(data.battleSide),
    name: data.name,
    enabled: data.enabled,
    sortOrder: data.sortOrder,
    detailRuleEnabled: typeof data.detailRuleEnabled === "boolean" ? data.detailRuleEnabled : true,
    schedule: {
      startTime: typeof data.schedule.startTime === "string" ? data.schedule.startTime : "",
      ...(typeof data.schedule.endTime === "string" || data.schedule.endTime === null
        ? { endTime: data.schedule.endTime }
        : {})
    },
    guildFilter: createGuildFilter(data),
    detailConditions: createDetailConditionRoot(data.detailConditions),
    repeatNotification: createRepeatNotification(data.repeatNotification),
    message: {
      usernameTemplate: typeof data.message.usernameTemplate === "string" ? data.message.usernameTemplate : "",
      mention: createMention(data.message.mention),
      titleTemplate: typeof data.message.titleTemplate === "string" ? data.message.titleTemplate : "",
      bodyTemplate: typeof data.message.bodyTemplate === "string" ? data.message.bodyTemplate : ""
    },
    ...(isPlainObject(data.temporarySuspension)
      ? { temporarySuspension: createTemporarySuspension(data.temporarySuspension) }
      : {}),
    ...(data.createdByRole === "guildOwner" || data.createdByRole === "admin"
      ? { createdByRole: data.createdByRole }
      : {}),
    createdAt: data.createdAt,
    updatedAt: data.updatedAt
  };
}

function createNotificationBattleSide(data: unknown): NotificationBattleSide {
  return data === "attack" ? "attack" : "defense";
}

function createRepeatNotification(data: unknown): NonNullable<NotificationRuleV2["repeatNotification"]> {
  if (
    !isPlainObject(data) ||
    typeof data.enabled !== "boolean" ||
    typeof data.intervalSeconds !== "number" ||
    !Number.isSafeInteger(data.intervalSeconds) ||
    data.intervalSeconds < MIN_REPEAT_NOTIFICATION_INTERVAL_SECONDS ||
    data.intervalSeconds > MAX_REPEAT_NOTIFICATION_INTERVAL_SECONDS
  ) {
    return {
      enabled: false,
      intervalSeconds: DEFAULT_REPEAT_NOTIFICATION_INTERVAL_SECONDS
    };
  }

  return {
    enabled: data.enabled,
    intervalSeconds: data.intervalSeconds
  };
}

function createGuildFilter(data: Record<string, unknown>): readonly string[] {
  const source =
    Array.isArray(data.guildFilter)
      ? data.guildFilter
      : Array.isArray(data.attackerGuildIds)
        ? data.attackerGuildIds
        : Array.isArray(data.targetGuildIds)
          ? data.targetGuildIds
          : [];
  return source.filter((guildId): guildId is string => typeof guildId === "string");
}

function createDetailConditionRoot(data: Record<string, unknown>): NotificationRuleV2["detailConditions"] {
  if (data.operator !== "OR" || !Array.isArray(data.children)) {
    return { operator: "OR", children: [] };
  }

  const children: Array<NotificationDetailCondition | NotificationDetailConditionGroup> = [];
  for (const child of data.children) {
    if (!isPlainObject(child)) {
      continue;
    }

    if (child.type === "condition") {
      const condition = createDetailCondition(child);
      if (condition !== null) {
        children.push(condition);
      }
      continue;
    }

    if (child.type === "group" && (child.operator === "AND" || child.operator === "OR") && Array.isArray(child.children)) {
      children.push({
        type: "group",
        operator: child.operator,
        children: child.children.flatMap((condition) => {
          if (!isPlainObject(condition)) {
            return [];
          }

          const nextCondition = createDetailCondition(condition);
          return nextCondition === null ? [] : [nextCondition];
        })
      });
    }
  }

  return {
    operator: "OR",
    children
  };
}

function createDetailCondition(data: Record<string, unknown>): NotificationDetailCondition | null {
  if (
    data.type !== "condition" ||
    (data.field !== "defenseCount" && data.field !== "attackCount") ||
    (data.operator !== "<=" && data.operator !== ">=") ||
    typeof data.value !== "number"
  ) {
    return null;
  }

  return {
    type: "condition",
    field: data.field,
    operator: data.operator,
    value: data.value
  };
}

function createSyncGuildBattleGuildCandidatesOutput(data: unknown): SyncGuildBattleGuildCandidatesOutput {
  if (!isPlainObject(data) || typeof data.worldId !== "number" || !Array.isArray(data.candidates)) {
    throw new Error("対象ギルド候補の形が不正です。");
  }

  return {
    worldId: data.worldId,
    candidates: data.candidates.map(createGuildBattleGuildCandidate),
    syncedAt: data.syncedAt
  };
}

function createGuildBattleGuildCandidate(data: unknown): GuildBattleGuildCandidate {
  if (
    !isPlainObject(data) ||
    typeof data.guildId !== "string" ||
    typeof data.guildName !== "string" ||
    typeof data.rank !== "number"
  ) {
    throw new Error("対象ギルド候補の形が不正です。");
  }

  return {
    guildId: data.guildId,
    guildName: data.guildName,
    rank: data.rank
  };
}

function createTemporarySuspension(data: unknown): NotificationRuleTemporarySuspension {
  if (!isPlainObject(data) || typeof data.suspendedAt !== "string" || typeof data.expiresAt !== "string") {
    throw new Error("notification suspension response is invalid");
  }

  return {
    suspendedAt: data.suspendedAt,
    expiresAt: data.expiresAt,
    ...(isPlainObject(data.suspendedBy) ? { suspendedBy: createSuspendedBy(data.suspendedBy) } : {})
  };
}

function createSuspendedBy(data: Record<string, unknown>): NonNullable<NotificationRuleTemporarySuspension["suspendedBy"]> {
  return {
    ...(data.role === "guildOwner" || data.role === "admin" ? { role: data.role } : {}),
    ...(typeof data.uid === "string" && data.uid.trim().length > 0 ? { uid: data.uid } : {})
  };
}

function createNotificationDestination(data: unknown): NotificationDestination {
  if (
    !isPlainObject(data) ||
    data.id !== "discord" ||
    data.type !== "discord_webhook" ||
    typeof data.enabled !== "boolean" ||
    typeof data.webhookUrl !== "string"
  ) {
    throw new Error("通知先設定の形式が不正です。");
  }

  return {
    id: "discord",
    type: "discord_webhook",
    enabled: data.enabled,
    webhookUrl: data.webhookUrl,
    ...(typeof data.defaultUsernameTemplate === "string"
      ? { defaultUsernameTemplate: data.defaultUsernameTemplate }
      : {}),
    createdAt: data.createdAt,
    updatedAt: data.updatedAt
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
