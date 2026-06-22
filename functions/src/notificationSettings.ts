import { randomUUID } from "node:crypto";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { HttpsError, onCall, type CallableRequest } from "firebase-functions/v2/https";

const GUILD_SHARES_COLLECTION = "guildShares";
const NOTIFICATION_RULES_COLLECTION = "notificationRules";
const NOTIFICATION_DESTINATIONS_COLLECTION = "notificationDestinations";
const DISCORD_DESTINATION_ID = "discord";
const DISCORD_WEBHOOK_URL_PATTERN = /^https:\/\/discord(?:app)?\.com\/api\/webhooks\/[^/\s]+\/[^/\s]+$/;
const START_TIME_PATTERN = /^\d{2}:\d{2}$/;
const ISO_DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const FUNCTION_REGION = "asia-northeast1";

type NotificationBattleType = "guildBattle" | "grandBattle";
type NotificationMentionType = "none" | "here" | "everyone" | "custom";
type NotificationSettingsRole = "guildOwner" | "admin";
type NotificationDetailConditionField = "defenseCount" | "attackCount";
type NotificationDetailConditionOperator = "<=" | ">=";
type NotificationDetailConditionGroupOperator = "AND" | "OR";

interface GuildShareDocument {
  readonly guildOwnerUid?: unknown;
  readonly adminAccessKey?: unknown;
}

interface NotificationRuleDocument {
  readonly battleType?: unknown;
  readonly name?: unknown;
  readonly enabled?: unknown;
  readonly conditions?: unknown;
  readonly message?: unknown;
  readonly createdByRole?: unknown;
  readonly createdAt?: unknown;
  readonly updatedAt?: unknown;
}

interface NotificationDestinationDocument {
  readonly type?: unknown;
  readonly enabled?: unknown;
  readonly webhookUrl?: unknown;
  readonly defaultUsernameTemplate?: unknown;
  readonly createdAt?: unknown;
  readonly updatedAt?: unknown;
}

interface NotificationRuleInput {
  readonly battleType: NotificationBattleType;
  readonly name: string;
  readonly enabled: boolean;
  readonly conditions: {
    readonly startTime: string;
    readonly defenseCountMax: number | null;
    readonly attackCountMin: number | null;
  };
  readonly message: {
    readonly usernameTemplate: string;
    readonly mention: {
      readonly type: NotificationMentionType;
      readonly customText?: string;
    };
    readonly titleTemplate: string;
    readonly bodyTemplate: string;
  };
}

interface NotificationDetailConditionInput {
  readonly type: "condition";
  readonly field: NotificationDetailConditionField;
  readonly operator: NotificationDetailConditionOperator;
  readonly value: number;
}

interface NotificationDetailConditionGroupInput {
  readonly type: "group";
  readonly operator: NotificationDetailConditionGroupOperator;
  readonly children: readonly NotificationDetailConditionInput[];
}

interface NotificationRuleV2Input {
  readonly schemaVersion: 2;
  readonly battleType: NotificationBattleType;
  readonly name: string;
  readonly enabled: boolean;
  readonly sortOrder: number;
  readonly schedule: {
    readonly startTime: string;
    readonly endTime?: string | null;
  };
  readonly targetGuildIds: readonly string[];
  readonly detailConditions: {
    readonly operator: "OR";
    readonly children: readonly (NotificationDetailConditionInput | NotificationDetailConditionGroupInput)[];
  };
  readonly message: NotificationRuleInput["message"];
  readonly temporarySuspension?: {
    readonly suspendedAt: string;
    readonly expiresAt: string;
    readonly suspendedBy?: {
      readonly role?: "guildOwner" | "admin";
      readonly uid?: string;
    };
  };
}

interface NotificationRuleOutput extends NotificationRuleInput {
  readonly id: string;
  readonly createdByRole?: "guildOwner" | "admin";
  readonly createdAt?: unknown;
  readonly updatedAt?: unknown;
}

interface NotificationRuleV2Output extends NotificationRuleV2Input {
  readonly id: string;
  readonly createdByRole?: "guildOwner" | "admin";
  readonly createdAt?: unknown;
  readonly updatedAt?: unknown;
}

interface NotificationDestinationInput {
  readonly enabled: boolean;
  readonly webhookUrl: string;
  readonly defaultUsernameTemplate?: string;
}

interface NotificationDestinationOutput extends NotificationDestinationInput {
  readonly id: "discord";
  readonly type: "discord_webhook";
  readonly createdAt?: unknown;
  readonly updatedAt?: unknown;
}

interface GetNotificationSettingsOutput {
  readonly rules: readonly NotificationRuleOutput[];
  readonly destination?: NotificationDestinationOutput;
}

interface GetNotificationSettingsV2Output {
  readonly rules: readonly NotificationRuleV2Output[];
  readonly destination?: NotificationDestinationOutput;
}

interface NotificationTemporarySuspensionOutput {
  readonly suspendedAt: string;
  readonly expiresAt: string;
  readonly suspendedBy: {
    readonly role?: "guildOwner" | "admin";
    readonly uid?: string;
  };
}

interface DocumentSnapshotLike {
  readonly exists: boolean;
  readonly id?: string;
  data(): Record<string, unknown> | undefined;
}

interface QuerySnapshotLike {
  readonly docs: readonly DocumentSnapshotLike[];
}

interface DocumentReferenceLike {
  readonly id: string;
  get(): Promise<DocumentSnapshotLike>;
  set(data: Record<string, unknown>, options?: { readonly merge: boolean }): Promise<unknown>;
  delete(): Promise<unknown>;
}

interface CollectionReferenceLike {
  doc(id?: string): DocumentReferenceLike;
  get(): Promise<QuerySnapshotLike>;
}

interface FirestoreLike {
  doc(path: string): DocumentReferenceLike;
  collection(path: string): CollectionReferenceLike;
}

interface Dependencies {
  readonly firestore: FirestoreLike;
  readonly now: () => Timestamp;
  readonly createRuleId: () => string;
}

interface CallableContext {
  readonly authUid: string | null;
}

export const getNotificationSettings = onCall({ region: FUNCTION_REGION }, async (request: CallableRequest) =>
  handleGetNotificationSettings(request.data, createCallableContext(request), createDefaultDependencies())
);

export const getNotificationSettingsV2 = onCall({ region: FUNCTION_REGION }, async (request: CallableRequest) =>
  handleGetNotificationSettingsV2(request.data, createCallableContext(request), createDefaultDependencies())
);

export const saveNotificationRule = onCall({ region: FUNCTION_REGION }, async (request: CallableRequest) =>
  handleSaveNotificationRule(request.data, createCallableContext(request), createDefaultDependencies())
);

export const saveNotificationRuleV2 = onCall({ region: FUNCTION_REGION }, async (request: CallableRequest) =>
  handleSaveNotificationRuleV2(request.data, createCallableContext(request), createDefaultDependencies())
);

export const deleteNotificationRule = onCall({ region: FUNCTION_REGION }, async (request: CallableRequest) =>
  handleDeleteNotificationRule(request.data, createCallableContext(request), createDefaultDependencies())
);

export const suspendNotificationRule = onCall({ region: FUNCTION_REGION }, async (request: CallableRequest) =>
  handleSuspendNotificationRule(request.data, createCallableContext(request), createDefaultDependencies())
);

export const saveNotificationDestination = onCall({ region: FUNCTION_REGION }, async (request: CallableRequest) =>
  handleSaveNotificationDestination(request.data, createCallableContext(request), createDefaultDependencies())
);

function createDefaultDependencies(): Dependencies {
  return {
    firestore: getFirestore(),
    now: () => Timestamp.now(),
    createRuleId: () => randomUUID()
  };
}

export async function handleGetNotificationSettings(
  input: unknown,
  context: CallableContext,
  dependencies: Dependencies
): Promise<GetNotificationSettingsOutput> {
  const payload = readAuthorizedInput(input);
  const role = await resolveNotificationSettingsRole(payload, context, dependencies);
  const rulesSnapshot = await dependencies.firestore
    .collection(`${GUILD_SHARES_COLLECTION}/${payload.guildId}/${NOTIFICATION_RULES_COLLECTION}`)
    .get();
  const rules = rulesSnapshot.docs.map((ruleSnapshot) =>
    readNotificationRuleDocument(ruleSnapshot.id ?? "", ruleSnapshot.data())
  );

  if (role !== "guildOwner") {
    return { rules };
  }

  const destinationSnapshot = await getDestinationRef(dependencies.firestore, payload.guildId).get();
  const destination = destinationSnapshot.exists
    ? readNotificationDestinationDocument(destinationSnapshot.data())
    : undefined;

  return destination === undefined ? { rules } : { rules, destination };
}

export async function handleGetNotificationSettingsV2(
  input: unknown,
  context: CallableContext,
  dependencies: Dependencies
): Promise<GetNotificationSettingsV2Output> {
  const payload = readAuthorizedInput(input);
  const role = await resolveNotificationSettingsRole(payload, context, dependencies);
  const rulesSnapshot = await dependencies.firestore
    .collection(`${GUILD_SHARES_COLLECTION}/${payload.guildId}/${NOTIFICATION_RULES_COLLECTION}`)
    .get();
  const rules = rulesSnapshot.docs.flatMap((ruleSnapshot) => {
    const data = ruleSnapshot.data();
    if (!shouldReadNotificationRuleV2Document(data)) {
      return [];
    }

    return [readNotificationRuleV2Document(ruleSnapshot.id ?? "", data)];
  });

  if (role !== "guildOwner") {
    return { rules };
  }

  const destinationSnapshot = await getDestinationRef(dependencies.firestore, payload.guildId).get();
  const destination = destinationSnapshot.exists
    ? readNotificationDestinationDocument(destinationSnapshot.data())
    : undefined;

  return destination === undefined ? { rules } : { rules, destination };
}

export async function handleSaveNotificationRule(
  input: unknown,
  context: CallableContext,
  dependencies: Dependencies
): Promise<NotificationRuleOutput> {
  const payload = readSaveRuleInput(input);
  const role = await resolveNotificationSettingsRole(payload, context, dependencies);
  const collectionRef = dependencies.firestore.collection(
    `${GUILD_SHARES_COLLECTION}/${payload.guildId}/${NOTIFICATION_RULES_COLLECTION}`
  );
  const ruleRef =
    payload.ruleId === undefined ? collectionRef.doc(dependencies.createRuleId()) : collectionRef.doc(payload.ruleId);
  const currentSnapshot = await ruleRef.get();
  const now = dependencies.now();
  const createdMetadata = currentSnapshot.exists
    ? readCreatedMetadata(currentSnapshot.data())
    : { createdAt: now, createdByRole: role };
  const document = {
    ...payload.rule,
    conditions: { ...payload.rule.conditions },
    message: {
      ...payload.rule.message,
      mention: { ...payload.rule.message.mention }
    },
    ...createdMetadata,
    updatedAt: now
  };

  await ruleRef.set(document, { merge: false });

  return {
    id: ruleRef.id,
    ...payload.rule,
    ...createdMetadata,
    updatedAt: now
  };
}

export async function handleSaveNotificationRuleV2(
  input: unknown,
  context: CallableContext,
  dependencies: Dependencies
): Promise<NotificationRuleV2Output> {
  const payload = readSaveRuleV2Input(input);
  const role = await resolveNotificationSettingsRole(payload, context, dependencies);
  const collectionRef = dependencies.firestore.collection(
    `${GUILD_SHARES_COLLECTION}/${payload.guildId}/${NOTIFICATION_RULES_COLLECTION}`
  );
  const ruleRef =
    payload.ruleId === undefined ? collectionRef.doc(dependencies.createRuleId()) : collectionRef.doc(payload.ruleId);
  const currentSnapshot = await ruleRef.get();
  const now = dependencies.now();
  const createdMetadata = currentSnapshot.exists
    ? readCreatedMetadata(currentSnapshot.data())
    : { createdAt: now, createdByRole: role };
  const document = {
    ...payload.rule,
    schedule: { ...payload.rule.schedule },
    targetGuildIds: [...payload.rule.targetGuildIds],
    detailConditions: cloneDetailConditionRoot(payload.rule.detailConditions),
    message: {
      ...payload.rule.message,
      mention: { ...payload.rule.message.mention }
    },
    ...(payload.rule.temporarySuspension === undefined
      ? {}
      : { temporarySuspension: cloneTemporarySuspension(payload.rule.temporarySuspension) }),
    ...createdMetadata,
    updatedAt: now
  };

  await ruleRef.set(document, { merge: false });

  return {
    id: ruleRef.id,
    ...payload.rule,
    ...createdMetadata,
    updatedAt: now
  };
}

export async function handleDeleteNotificationRule(
  input: unknown,
  context: CallableContext,
  dependencies: Dependencies
): Promise<{ readonly ok: true }> {
  const payload = readDeleteRuleInput(input);
  await resolveNotificationSettingsRole(payload, context, dependencies);
  await dependencies.firestore
    .doc(`${GUILD_SHARES_COLLECTION}/${payload.guildId}/${NOTIFICATION_RULES_COLLECTION}/${payload.ruleId}`)
    .delete();

  return { ok: true };
}

export async function handleSuspendNotificationRule(
  input: unknown,
  context: CallableContext,
  dependencies: Dependencies
): Promise<NotificationTemporarySuspensionOutput> {
  const payload = readSuspendRuleInput(input);
  const role = await resolveNotificationSettingsRole(payload, context, dependencies);
  const ruleRef = dependencies.firestore.doc(
    `${GUILD_SHARES_COLLECTION}/${payload.guildId}/${NOTIFICATION_RULES_COLLECTION}/${payload.ruleId}`
  );
  const currentSnapshot = await ruleRef.get();
  if (!currentSnapshot.exists) {
    throw new HttpsError("not-found", "notification_rule_not_found");
  }

  const now = dependencies.now();
  const suspendedAt = timestampToIsoString(now);
  const expiresAt = new Date(Date.parse(suspendedAt) + 60 * 60 * 1000).toISOString();
  const temporarySuspension: NotificationTemporarySuspensionOutput = {
    suspendedAt,
    expiresAt,
    suspendedBy: context.authUid === null ? { role } : { uid: context.authUid }
  };

  await ruleRef.set(
    {
      temporarySuspension,
      updatedAt: now
    },
    { merge: true }
  );

  return temporarySuspension;
}

export async function handleSaveNotificationDestination(
  input: unknown,
  context: CallableContext,
  dependencies: Dependencies
): Promise<NotificationDestinationOutput> {
  const payload = readSaveDestinationInput(input);
  await assertGuildOwner(payload.guildId, context, dependencies);

  const destinationRef = getDestinationRef(dependencies.firestore, payload.guildId);
  const currentSnapshot = await destinationRef.get();
  const now = dependencies.now();
  const createdAt = currentSnapshot.exists ? currentSnapshot.data()?.createdAt : now;
  const document = {
    type: "discord_webhook",
    enabled: payload.destination.enabled,
    webhookUrl: payload.destination.webhookUrl.trim(),
    ...(payload.destination.defaultUsernameTemplate === undefined
      ? {}
      : { defaultUsernameTemplate: payload.destination.defaultUsernameTemplate }),
    createdAt,
    updatedAt: now
  };

  await destinationRef.set(document, { merge: false });

  return {
    id: DISCORD_DESTINATION_ID,
    type: "discord_webhook",
    enabled: payload.destination.enabled,
    webhookUrl: payload.destination.webhookUrl.trim(),
    ...(payload.destination.defaultUsernameTemplate === undefined
      ? {}
      : { defaultUsernameTemplate: payload.destination.defaultUsernameTemplate }),
    createdAt,
    updatedAt: now
  };
}

function getDestinationRef(firestore: FirestoreLike, guildId: string): DocumentReferenceLike {
  return firestore.doc(
    `${GUILD_SHARES_COLLECTION}/${guildId}/${NOTIFICATION_DESTINATIONS_COLLECTION}/${DISCORD_DESTINATION_ID}`
  );
}

async function resolveNotificationSettingsRole(
  payload: { readonly guildId: string; readonly accessKey?: string },
  context: CallableContext,
  dependencies: Dependencies
): Promise<NotificationSettingsRole> {
  if (context.authUid !== null) {
    const isOwner = await isGuildOwner(payload.guildId, context.authUid, dependencies);
    if (isOwner) {
      return "guildOwner";
    }
  }

  if (payload.accessKey !== undefined) {
    const share = await loadGuildShare(payload.guildId, dependencies);
    if (share.adminAccessKey === payload.accessKey) {
      return "admin";
    }
  }

  throw new HttpsError("permission-denied", "notification_settings_access_denied");
}

async function assertGuildOwner(
  guildId: string,
  context: CallableContext,
  dependencies: Dependencies
): Promise<void> {
  const authUid = requireAuth(context);
  const isOwner = await isGuildOwner(guildId, authUid, dependencies);
  if (!isOwner) {
    throw new HttpsError("permission-denied", "guild_owner_required");
  }
}

async function isGuildOwner(guildId: string, authUid: string, dependencies: Dependencies): Promise<boolean> {
  const share = await loadGuildShare(guildId, dependencies);
  return share.guildOwnerUid === authUid;
}

async function loadGuildShare(guildId: string, dependencies: Dependencies) {
  const snapshot = await dependencies.firestore.doc(`${GUILD_SHARES_COLLECTION}/${guildId}`).get();
  if (!snapshot.exists) {
    throw new HttpsError("permission-denied", "notification_settings_access_denied");
  }

  const data = snapshot.data() as GuildShareDocument | undefined;
  if (data === undefined) {
    throw new HttpsError("failed-precondition", "invalid_guild_share");
  }

  return {
    guildOwnerUid: typeof data.guildOwnerUid === "string" ? data.guildOwnerUid : null,
    adminAccessKey: typeof data.adminAccessKey === "string" ? data.adminAccessKey : null
  };
}

function createCallableContext(request: CallableRequest): CallableContext {
  return { authUid: request.auth?.uid ?? null };
}

function requireAuth(context: CallableContext): string {
  if (context.authUid === null || context.authUid.trim().length === 0) {
    throw new HttpsError("unauthenticated", "auth_required");
  }

  return context.authUid;
}

function readAuthorizedInput(input: unknown): { readonly guildId: string; readonly accessKey?: string } {
  const guildId = readGuildId(input);
  const accessKey = isPlainObject(input) && typeof input.accessKey === "string" ? input.accessKey.trim() : undefined;
  return accessKey === undefined || accessKey.length === 0 ? { guildId } : { guildId, accessKey };
}

function readSaveRuleInput(input: unknown): {
  readonly guildId: string;
  readonly accessKey?: string;
  readonly ruleId?: string;
  readonly rule: NotificationRuleInput;
} {
  const authorizedInput = readAuthorizedInput(input);
  if (!isPlainObject(input) || !isPlainObject(input.rule)) {
    throw new HttpsError("invalid-argument", "invalid_notification_rule");
  }

  const ruleId = typeof input.ruleId === "string" && input.ruleId.trim().length > 0 ? input.ruleId.trim() : undefined;
  return {
    ...authorizedInput,
    ...(ruleId === undefined ? {} : { ruleId }),
    rule: readNotificationRuleInput(input.rule)
  };
}

function readSaveRuleV2Input(input: unknown): {
  readonly guildId: string;
  readonly accessKey?: string;
  readonly ruleId?: string;
  readonly rule: NotificationRuleV2Input;
} {
  const authorizedInput = readAuthorizedInput(input);
  if (!isPlainObject(input) || !isPlainObject(input.rule)) {
    throw new HttpsError("invalid-argument", "invalid_notification_rule_v2");
  }

  const ruleId = typeof input.ruleId === "string" && input.ruleId.trim().length > 0 ? input.ruleId.trim() : undefined;
  return {
    ...authorizedInput,
    ...(ruleId === undefined ? {} : { ruleId }),
    rule: readNotificationRuleV2Input(input.rule)
  };
}

function readDeleteRuleInput(input: unknown): {
  readonly guildId: string;
  readonly accessKey?: string;
  readonly ruleId: string;
} {
  const authorizedInput = readAuthorizedInput(input);
  if (!isPlainObject(input) || typeof input.ruleId !== "string" || input.ruleId.trim().length === 0) {
    throw new HttpsError("invalid-argument", "invalid_notification_rule_id");
  }

  return { ...authorizedInput, ruleId: input.ruleId.trim() };
}

function readSuspendRuleInput(input: unknown): {
  readonly guildId: string;
  readonly accessKey?: string;
  readonly ruleId: string;
} {
  return readDeleteRuleInput(input);
}

function readSaveDestinationInput(input: unknown): {
  readonly guildId: string;
  readonly destination: NotificationDestinationInput;
} {
  const guildId = readGuildId(input);
  if (!isPlainObject(input) || !isPlainObject(input.destination)) {
    throw new HttpsError("invalid-argument", "invalid_notification_destination");
  }

  return { guildId, destination: readNotificationDestinationInput(input.destination) };
}

function readGuildId(input: unknown): string {
  if (!isPlainObject(input) || typeof input.guildId !== "string" || input.guildId.trim().length === 0) {
    throw new HttpsError("invalid-argument", "invalid_guild_id");
  }

  return input.guildId.trim();
}

function readNotificationRuleInput(data: Record<string, unknown>): NotificationRuleInput {
  if (
    (data.battleType !== "guildBattle" && data.battleType !== "grandBattle") ||
    typeof data.name !== "string" ||
    data.name.trim().length === 0 ||
    typeof data.enabled !== "boolean" ||
    !isPlainObject(data.conditions) ||
    !isPlainObject(data.message)
  ) {
    throw new HttpsError("invalid-argument", "invalid_notification_rule");
  }

  const conditions = readConditions(data.conditions);
  const message = readMessage(data.message);

  return {
    battleType: data.battleType,
    name: data.name.trim(),
    enabled: data.enabled,
    conditions,
    message
  };
}

export function shouldReadNotificationRuleV2Document(data: Record<string, unknown> | undefined): boolean {
  return data?.schemaVersion === 2;
}

export function validateNotificationRuleV2Input(data: Record<string, unknown>): NotificationRuleV2Input {
  return readNotificationRuleV2Input(data);
}

function readNotificationRuleV2Input(data: Record<string, unknown>): NotificationRuleV2Input {
  if (
    data.schemaVersion !== 2 ||
    (data.battleType !== "guildBattle" && data.battleType !== "grandBattle") ||
    typeof data.name !== "string" ||
    data.name.trim().length === 0 ||
    typeof data.enabled !== "boolean" ||
    !Number.isSafeInteger(data.sortOrder) ||
    typeof data.sortOrder !== "number" ||
    data.sortOrder < 0 ||
    !isPlainObject(data.schedule) ||
    !Array.isArray(data.targetGuildIds) ||
    !isPlainObject(data.detailConditions) ||
    !isPlainObject(data.message)
  ) {
    throw new HttpsError("invalid-argument", "invalid_notification_rule_v2");
  }

  return {
    schemaVersion: 2,
    battleType: data.battleType,
    name: data.name.trim(),
    enabled: data.enabled,
    sortOrder: data.sortOrder,
    schedule: readSchedule(data.schedule),
    targetGuildIds: readTargetGuildIds(data.targetGuildIds),
    detailConditions: readDetailConditionRoot(data.detailConditions),
    message: readMessage(data.message),
    ...(data.temporarySuspension === undefined
      ? {}
      : { temporarySuspension: readTemporarySuspension(data.temporarySuspension) })
  };
}

function readSchedule(data: Record<string, unknown>): NotificationRuleV2Input["schedule"] {
  if (typeof data.startTime !== "string" || !START_TIME_PATTERN.test(data.startTime)) {
    throw new HttpsError("invalid-argument", "invalid_notification_start_time");
  }

  if (data.endTime !== undefined && data.endTime !== null) {
    if (typeof data.endTime !== "string" || !START_TIME_PATTERN.test(data.endTime)) {
      throw new HttpsError("invalid-argument", "invalid_notification_end_time");
    }

    return { startTime: data.startTime, endTime: data.endTime };
  }

  return { startTime: data.startTime, ...(data.endTime === null ? { endTime: null } : {}) };
}

function readTargetGuildIds(values: readonly unknown[]): readonly string[] {
  if (values.length > 16) {
    throw new HttpsError("invalid-argument", "invalid_notification_target_guilds");
  }

  const guildIds = values.map((value) => {
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new HttpsError("invalid-argument", "invalid_notification_target_guilds");
    }

    return value.trim();
  });

  if (new Set(guildIds).size !== guildIds.length) {
    throw new HttpsError("invalid-argument", "invalid_notification_target_guilds");
  }

  return guildIds;
}

function readDetailConditionRoot(data: Record<string, unknown>): NotificationRuleV2Input["detailConditions"] {
  if (data.operator !== "OR" || !Array.isArray(data.children) || data.children.length === 0) {
    throw new HttpsError("invalid-argument", "invalid_notification_detail_conditions");
  }

  return {
    operator: "OR",
    children: data.children.map(readDetailConditionRootChild)
  };
}

function readDetailConditionRootChild(
  data: unknown
): NotificationDetailConditionInput | NotificationDetailConditionGroupInput {
  if (!isPlainObject(data)) {
    throw new HttpsError("invalid-argument", "invalid_notification_detail_conditions");
  }

  if (data.type === "condition") {
    return readDetailCondition(data);
  }

  if (data.type === "group") {
    return readDetailConditionGroup(data);
  }

  throw new HttpsError("invalid-argument", "invalid_notification_detail_conditions");
}

function readDetailConditionGroup(data: Record<string, unknown>): NotificationDetailConditionGroupInput {
  if ((data.operator !== "AND" && data.operator !== "OR") || !Array.isArray(data.children) || data.children.length === 0) {
    throw new HttpsError("invalid-argument", "invalid_notification_detail_conditions");
  }

  return {
    type: "group",
    operator: data.operator,
    children: data.children.map((child) => {
      if (!isPlainObject(child) || child.type !== "condition") {
        throw new HttpsError("invalid-argument", "invalid_notification_detail_conditions");
      }

      return readDetailCondition(child);
    })
  };
}

function readDetailCondition(data: Record<string, unknown>): NotificationDetailConditionInput {
  if (
    (data.field !== "defenseCount" && data.field !== "attackCount") ||
    (data.operator !== "<=" && data.operator !== ">=") ||
    !Number.isSafeInteger(data.value) ||
    typeof data.value !== "number" ||
    data.value < 0
  ) {
    throw new HttpsError("invalid-argument", "invalid_notification_detail_conditions");
  }

  return {
    type: "condition",
    field: data.field,
    operator: data.operator,
    value: data.value
  };
}

function readTemporarySuspension(data: unknown): NonNullable<NotificationRuleV2Input["temporarySuspension"]> {
  if (!isPlainObject(data) || typeof data.suspendedAt !== "string" || typeof data.expiresAt !== "string") {
    throw new HttpsError("invalid-argument", "invalid_notification_temporary_suspension");
  }

  if (!ISO_DATE_TIME_PATTERN.test(data.suspendedAt) || !ISO_DATE_TIME_PATTERN.test(data.expiresAt)) {
    throw new HttpsError("invalid-argument", "invalid_notification_temporary_suspension");
  }

  const suspendedAt = Date.parse(data.suspendedAt);
  const expiresAt = Date.parse(data.expiresAt);
  if (!Number.isFinite(suspendedAt) || expiresAt - suspendedAt !== 60 * 60 * 1000) {
    throw new HttpsError("invalid-argument", "invalid_notification_temporary_suspension");
  }

  return {
    suspendedAt: data.suspendedAt,
    expiresAt: data.expiresAt,
    ...(data.suspendedBy === undefined ? {} : { suspendedBy: readSuspendedBy(data.suspendedBy) })
  };
}

function readSuspendedBy(data: unknown): NonNullable<NonNullable<NotificationRuleV2Input["temporarySuspension"]>["suspendedBy"]> {
  if (!isPlainObject(data)) {
    throw new HttpsError("invalid-argument", "invalid_notification_temporary_suspension");
  }

  const role = data.role === "guildOwner" || data.role === "admin" ? data.role : undefined;
  const uid = typeof data.uid === "string" && data.uid.trim().length > 0 ? data.uid.trim() : undefined;
  if (role === undefined && uid === undefined) {
    throw new HttpsError("invalid-argument", "invalid_notification_temporary_suspension");
  }

  return {
    ...(role === undefined ? {} : { role }),
    ...(uid === undefined ? {} : { uid })
  };
}

function cloneDetailConditionRoot(
  root: NotificationRuleV2Input["detailConditions"]
): NotificationRuleV2Input["detailConditions"] {
  return {
    operator: "OR",
    children: root.children.map((child) =>
      child.type === "condition"
        ? { ...child }
        : {
            type: "group",
            operator: child.operator,
            children: child.children.map((condition) => ({ ...condition }))
          }
    )
  };
}

function cloneTemporarySuspension(
  temporarySuspension: NonNullable<NotificationRuleV2Input["temporarySuspension"]>
): NonNullable<NotificationRuleV2Input["temporarySuspension"]> {
  return {
    suspendedAt: temporarySuspension.suspendedAt,
    expiresAt: temporarySuspension.expiresAt,
    ...(temporarySuspension.suspendedBy === undefined
      ? {}
      : { suspendedBy: { ...temporarySuspension.suspendedBy } })
  };
}

function readConditions(data: Record<string, unknown>): NotificationRuleInput["conditions"] {
  if (typeof data.startTime !== "string" || !START_TIME_PATTERN.test(data.startTime)) {
    throw new HttpsError("invalid-argument", "invalid_notification_start_time");
  }

  return {
    startTime: data.startTime,
    defenseCountMax: readNullableNonNegativeInteger(data.defenseCountMax),
    attackCountMin: readNullableNonNegativeInteger(data.attackCountMin)
  };
}

function readMessage(data: Record<string, unknown>): NotificationRuleInput["message"] {
  if (
    typeof data.usernameTemplate !== "string" ||
    data.usernameTemplate.trim().length === 0 ||
    typeof data.titleTemplate !== "string" ||
    data.titleTemplate.trim().length === 0 ||
    typeof data.bodyTemplate !== "string" ||
    data.bodyTemplate.trim().length === 0 ||
    !isPlainObject(data.mention)
  ) {
    throw new HttpsError("invalid-argument", "invalid_notification_message");
  }

  const mention = readMention(data.mention);

  return {
    usernameTemplate: data.usernameTemplate,
    mention,
    titleTemplate: data.titleTemplate,
    bodyTemplate: data.bodyTemplate
  };
}

function readMention(data: Record<string, unknown>): NotificationRuleInput["message"]["mention"] {
  if (data.type !== "none" && data.type !== "here" && data.type !== "everyone" && data.type !== "custom") {
    throw new HttpsError("invalid-argument", "invalid_notification_mention");
  }

  if (data.type === "custom") {
    if (typeof data.customText !== "string" || data.customText.trim().length === 0) {
      throw new HttpsError("invalid-argument", "invalid_notification_mention");
    }

    return { type: "custom", customText: data.customText.trim() };
  }

  return { type: data.type };
}

function readNotificationDestinationInput(data: Record<string, unknown>): NotificationDestinationInput {
  if (typeof data.enabled !== "boolean" || typeof data.webhookUrl !== "string") {
    throw new HttpsError("invalid-argument", "invalid_notification_destination");
  }

  const webhookUrl = data.webhookUrl.trim();
  if (data.enabled && webhookUrl.length === 0) {
    throw new HttpsError("invalid-argument", "invalid_discord_webhook_url");
  }

  if (webhookUrl.length > 0 && !DISCORD_WEBHOOK_URL_PATTERN.test(webhookUrl)) {
    throw new HttpsError("invalid-argument", "invalid_discord_webhook_url");
  }

  return {
    enabled: data.enabled,
    webhookUrl,
    ...(typeof data.defaultUsernameTemplate === "string"
      ? { defaultUsernameTemplate: data.defaultUsernameTemplate }
      : {})
  };
}

function readNotificationRuleDocument(id: string, data: Record<string, unknown> | undefined): NotificationRuleOutput {
  if (data === undefined) {
    throw new HttpsError("failed-precondition", "invalid_notification_rule");
  }

  const rule = readNotificationRuleInput(data);
  const createdByRole =
    data.createdByRole === "guildOwner" || data.createdByRole === "admin" ? data.createdByRole : undefined;

  return {
    id,
    ...rule,
    ...(createdByRole === undefined ? {} : { createdByRole }),
    createdAt: data.createdAt,
    updatedAt: data.updatedAt
  };
}

function readNotificationRuleV2Document(id: string, data: Record<string, unknown> | undefined): NotificationRuleV2Output {
  if (data === undefined) {
    throw new HttpsError("failed-precondition", "invalid_notification_rule_v2");
  }

  const rule = readNotificationRuleV2Input(data);
  const createdByRole =
    data.createdByRole === "guildOwner" || data.createdByRole === "admin" ? data.createdByRole : undefined;

  return {
    id,
    ...rule,
    ...(createdByRole === undefined ? {} : { createdByRole }),
    createdAt: data.createdAt,
    updatedAt: data.updatedAt
  };
}

function readNotificationDestinationDocument(
  data: Record<string, unknown> | undefined
): NotificationDestinationOutput {
  if (
    data === undefined ||
    data.type !== "discord_webhook" ||
    typeof data.enabled !== "boolean" ||
    typeof data.webhookUrl !== "string"
  ) {
    throw new HttpsError("failed-precondition", "invalid_notification_destination");
  }

  return {
    id: DISCORD_DESTINATION_ID,
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

function readCreatedMetadata(data: Record<string, unknown> | undefined): {
  readonly createdAt: unknown;
  readonly createdByRole?: "guildOwner" | "admin";
} {
  const createdByRole =
    data?.createdByRole === "guildOwner" || data?.createdByRole === "admin" ? data.createdByRole : undefined;

  return {
    createdAt: data?.createdAt,
    ...(createdByRole === undefined ? {} : { createdByRole })
  };
}

function readNullableNonNegativeInteger(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new HttpsError("invalid-argument", "invalid_notification_count");
  }

  return value;
}

function timestampToIsoString(timestamp: Timestamp): string {
  const value = timestamp as Timestamp & { readonly toDate?: () => Date };
  const date = typeof value.toDate === "function" ? value.toDate() : new Date(timestamp as never);
  const isoString = date.toISOString();
  if (!ISO_DATE_TIME_PATTERN.test(isoString)) {
    throw new HttpsError("failed-precondition", "invalid_notification_temporary_suspension_clock");
  }

  return isoString;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
