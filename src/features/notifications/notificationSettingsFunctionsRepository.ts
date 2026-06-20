import { loadFirebaseServices } from "../../lib/firebase";
import type {
  NotificationDestination,
  NotificationDestinationInput,
  NotificationRule,
  NotificationRuleInput,
  NotificationSettings
} from "./types";

export interface NotificationSettingsRequest {
  readonly guildId: string;
  readonly accessKey?: string;
}

export interface SaveNotificationRuleRequest extends NotificationSettingsRequest {
  readonly ruleId?: string;
  readonly rule: NotificationRuleInput;
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

export async function getNotificationSettings(input: NotificationSettingsRequest): Promise<NotificationSettings> {
  const result = await callFunction("getNotificationSettings", input);
  return createNotificationSettings(result);
}

export async function saveNotificationRule(input: SaveNotificationRuleRequest): Promise<NotificationRule> {
  const result = await callFunction("saveNotificationRule", input);
  return createNotificationRule(result);
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
  input: NotificationSettingsRequest
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
