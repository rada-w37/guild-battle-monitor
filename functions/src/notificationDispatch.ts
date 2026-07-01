import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import * as logger from "firebase-functions/logger";

const DISCORD_DESTINATION_ID = "discord";
const FUNCTION_REGION = "asia-northeast1";
const NOTIFICATION_REQUESTS_COLLECTION = "notificationRequests";

type NotificationBattleType = "guildBattle" | "grandBattle";
type NotificationStatus = "processing" | "sent" | "skipped" | "failed";
type ErrorCode =
  | "destination_unavailable"
  | "discord_http_error"
  | "discord_post_failed"
  | "duplicate_finalized"
  | "duplicate_processing"
  | "duplicate_sent"
  | "invalid_request";

interface NotificationRequest {
  readonly guildId: string;
  readonly battleType: NotificationBattleType;
  readonly ruleId: string;
  readonly ruleName: string;
  readonly duplicateKey: string;
  readonly baseId?: string;
  readonly baseName: string;
  readonly attackerGuildId?: string;
  readonly attackerGuildName?: string;
  readonly defenseCount: number;
  readonly attackCount: number;
  readonly message: {
    readonly username?: string;
    readonly mentionText?: string;
    readonly title: string;
    readonly body: string;
  };
  readonly source?: {
    readonly observedAt?: unknown;
  };
}

interface NotificationDestinationDocument {
  readonly type?: unknown;
  readonly enabled?: unknown;
  readonly webhookUrl?: unknown;
}

interface DocumentSnapshotLike {
  readonly exists: boolean;
  data(): Record<string, unknown> | undefined;
}

interface DocumentReferenceLike {
  get(): Promise<DocumentSnapshotLike>;
  set(data: Record<string, unknown>, options?: { readonly merge: boolean }): Promise<unknown>;
  update(data: Record<string, unknown>): Promise<unknown>;
}

interface TransactionLike {
  get(ref: DocumentReferenceLike): Promise<DocumentSnapshotLike>;
  create(ref: DocumentReferenceLike, data: Record<string, unknown>): void;
}

interface FirestoreLike {
  doc(path: string): DocumentReferenceLike;
  runTransaction<T>(updateFunction: (transaction: TransactionLike) => Promise<T>): Promise<T>;
}

interface DiscordResponseLike {
  readonly ok: boolean;
  readonly status: number;
}

interface LoggerLike {
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
}

interface Dependencies {
  readonly firestore: FirestoreLike;
  readonly now: () => Timestamp;
  readonly postDiscordWebhook: (webhookUrl: string, payload: DiscordWebhookPayload) => Promise<DiscordResponseLike>;
  readonly logger: LoggerLike;
}

interface DiscordWebhookPayload {
  readonly username?: string;
  readonly content?: string;
  readonly allowed_mentions?: {
    readonly parse: readonly ["users", "roles"];
  };
  readonly embeds: readonly [
    {
      readonly title: string;
      readonly description: string;
      readonly timestamp?: string;
    }
  ];
}

interface SafeLogContext {
  readonly requestId: string;
  readonly guildId?: string;
  readonly ruleId?: string;
}

interface ProcessingLockResult {
  readonly acquired: boolean;
  readonly errorCode?: ErrorCode;
}

export const dispatchNotificationRequest = onDocumentCreated(
  { region: FUNCTION_REGION, document: `${NOTIFICATION_REQUESTS_COLLECTION}/{requestId}` },
  async (event) => {
    const requestId = event.params.requestId;
    await handleNotificationRequestCreated(requestId, event.data?.data(), createDefaultDependencies());
  }
);

function createDefaultDependencies(): Dependencies {
  return {
    firestore: getFirestore(),
    now: () => Timestamp.now(),
    postDiscordWebhook: async (webhookUrl, payload) =>
      fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }),
    logger
  };
}

export async function handleNotificationRequestCreated(
  requestId: string,
  input: unknown,
  dependencies: Dependencies
): Promise<void> {
  const requestRef = getRequestRef(dependencies.firestore, requestId);
  const partialContext = createPartialLogContext(requestId, input);
  const request = readNotificationRequest(input);

  if (request === null) {
    const now = dependencies.now();
    await updateRequestStatus(requestRef, "failed", now, "invalid_request");
    dependencies.logger.warn("notification_request_failed", {
      ...partialContext,
      status: "failed",
      errorCode: "invalid_request"
    });
    return;
  }

  const logContext = { requestId, guildId: request.guildId, ruleId: request.ruleId };
  const historyRef = getHistoryRef(dependencies.firestore, request.guildId, requestId);
  const lockResult = await acquireProcessingLock(dependencies, historyRef, requestId, request);

  if (!lockResult.acquired) {
    const now = dependencies.now();
    await updateRequestStatus(requestRef, "skipped", now, lockResult.errorCode ?? "duplicate_finalized");
    dependencies.logger.info("notification_request_skipped", {
      ...logContext,
      status: "skipped",
      errorCode: lockResult.errorCode ?? "duplicate_finalized"
    });
    return;
  }

  const destination = await readDestination(dependencies.firestore, request.guildId);
  if (destination === null) {
    const now = dependencies.now();
    await updateHistoryStatus(historyRef, "skipped", now, { errorCode: "destination_unavailable" });
    await updateRequestStatus(requestRef, "skipped", now, "destination_unavailable");
    dependencies.logger.info("notification_request_skipped", {
      ...logContext,
      status: "skipped",
      errorCode: "destination_unavailable"
    });
    return;
  }

  const payload = createDiscordPayload(request);
  let response: DiscordResponseLike;

  try {
    response = await dependencies.postDiscordWebhook(destination.webhookUrl, payload);
  } catch {
    const now = dependencies.now();
    await updateHistoryStatus(historyRef, "failed", now, {
      errorCode: "discord_post_failed",
      errorMessage: "Discord POST failed"
    });
    await updateRequestStatus(requestRef, "failed", now, "discord_post_failed");
    dependencies.logger.error("notification_request_failed", {
      ...logContext,
      status: "failed",
      errorCode: "discord_post_failed"
    });
    return;
  }

  const now = dependencies.now();
  if (!response.ok) {
    await updateHistoryStatus(historyRef, "failed", now, {
      errorCode: "discord_http_error",
      errorMessage: `HTTP status: ${response.status}`
    });
    await updateRequestStatus(requestRef, "failed", now, "discord_http_error");
    dependencies.logger.warn("notification_request_failed", {
      ...logContext,
      status: "failed",
      errorCode: "discord_http_error"
    });
    return;
  }

  await updateHistoryStatus(historyRef, "sent", now, { notifiedAt: now });
  await updateRequestStatus(requestRef, "sent", now);
  dependencies.logger.info("notification_request_sent", { ...logContext, status: "sent" });
}

async function acquireProcessingLock(
  dependencies: Dependencies,
  historyRef: DocumentReferenceLike,
  requestId: string,
  request: NotificationRequest
): Promise<ProcessingLockResult> {
  return dependencies.firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(historyRef);
    if (snapshot.exists) {
      const status = snapshot.data()?.status;
      if (status === "sent") {
        return { acquired: false, errorCode: "duplicate_sent" };
      }
      if (status === "processing") {
        return { acquired: false, errorCode: "duplicate_processing" };
      }
      return { acquired: false, errorCode: "duplicate_finalized" };
    }

    const now = dependencies.now();
    transaction.create(historyRef, {
      ...createHistoryBase(requestId, request),
      status: "processing",
      createdAt: now,
      updatedAt: now
    });
    return { acquired: true };
  });
}

async function readDestination(firestore: FirestoreLike, guildId: string): Promise<{ readonly webhookUrl: string } | null> {
  const snapshot = await firestore
    .doc(`guildShares/${guildId}/notificationDestinations/${DISCORD_DESTINATION_ID}`)
    .get();
  if (!snapshot.exists) {
    return null;
  }

  const data = snapshot.data() as NotificationDestinationDocument | undefined;
  if (
    data === undefined ||
    data.type !== "discord_webhook" ||
    data.enabled !== true ||
    typeof data.webhookUrl !== "string" ||
    data.webhookUrl.trim().length === 0 ||
    !isValidDiscordWebhookUrl(data.webhookUrl.trim())
  ) {
    return null;
  }

  return { webhookUrl: data.webhookUrl.trim() };
}

function isValidDiscordWebhookUrl(webhookUrl: string): boolean {
  try {
    const url = new URL(webhookUrl);
    const segments = url.pathname.split("/");
    return (
      url.protocol === "https:" &&
      (url.hostname === "discord.com" || url.hostname === "discordapp.com") &&
      (url.port === "" || url.port === "443") &&
      url.search === "" &&
      url.hash === "" &&
      segments.length === 5 &&
      segments[0] === "" &&
      segments[1] === "api" &&
      segments[2] === "webhooks" &&
      segments[3].trim().length > 0 &&
      segments[4].trim().length > 0
    );
  } catch {
    return false;
  }
}

function createDiscordPayload(request: NotificationRequest): DiscordWebhookPayload {
  const timestamp = createDiscordTimestamp(request.source?.observedAt);
  const mentionText = request.message.mentionText;

  return {
    ...(request.message.username === undefined ? {} : { username: request.message.username }),
    ...(mentionText === undefined
      ? {}
      : {
          content: mentionText,
          allowed_mentions: { parse: ["users", "roles"] as const }
        }),
    embeds: [
      {
        title: request.message.title,
        description: request.message.body,
        ...(timestamp === undefined ? {} : { timestamp })
      }
    ]
  };
}

function createDiscordTimestamp(value: unknown): string | undefined {
  if (!isPlainObject(value) || typeof value.toDate !== "function") {
    return undefined;
  }

  const date = value.toDate();
  return date instanceof Date && !Number.isNaN(date.getTime()) ? date.toISOString() : undefined;
}

function createHistoryBase(requestId: string, request: NotificationRequest) {
  return {
    requestId,
    duplicateKey: request.duplicateKey,
    ruleId: request.ruleId,
    ruleName: request.ruleName,
    battleType: request.battleType,
    ...(request.baseId === undefined ? {} : { baseId: request.baseId }),
    baseName: request.baseName,
    ...(request.attackerGuildId === undefined ? {} : { attackerGuildId: request.attackerGuildId }),
    ...(request.attackerGuildName === undefined ? {} : { attackerGuildName: request.attackerGuildName }),
    defenseCount: request.defenseCount,
    attackCount: request.attackCount,
    destinationId: DISCORD_DESTINATION_ID
  };
}

async function updateHistoryStatus(
  historyRef: DocumentReferenceLike,
  status: Exclude<NotificationStatus, "processing">,
  now: Timestamp,
  options: {
    readonly errorCode?: ErrorCode;
    readonly errorMessage?: string;
    readonly notifiedAt?: Timestamp;
  } = {}
): Promise<void> {
  await historyRef.set(
    {
      status,
      updatedAt: now,
      ...(options.errorCode === undefined ? {} : { errorCode: options.errorCode }),
      ...(options.errorMessage === undefined ? {} : { errorMessage: options.errorMessage }),
      ...(options.notifiedAt === undefined ? {} : { notifiedAt: options.notifiedAt })
    },
    { merge: true }
  );
}

async function updateRequestStatus(
  requestRef: DocumentReferenceLike,
  status: Exclude<NotificationStatus, "processing">,
  processedAt: Timestamp,
  errorCode?: ErrorCode
): Promise<void> {
  await requestRef.set(
    {
      status,
      processedAt,
      ...(errorCode === undefined ? {} : { errorCode })
    },
    { merge: true }
  );
}

function getRequestRef(firestore: FirestoreLike, requestId: string): DocumentReferenceLike {
  return firestore.doc(`${NOTIFICATION_REQUESTS_COLLECTION}/${requestId}`);
}

function getHistoryRef(firestore: FirestoreLike, guildId: string, requestId: string): DocumentReferenceLike {
  return firestore.doc(`guildShares/${guildId}/notificationHistories/${requestId}`);
}

function readNotificationRequest(input: unknown): NotificationRequest | null {
  if (!isPlainObject(input) || !isPlainObject(input.message)) {
    return null;
  }

  const guildId = readRequiredPathSegment(input.guildId);
  const battleType = input.battleType === "guildBattle" || input.battleType === "grandBattle" ? input.battleType : null;
  const ruleId = readRequiredString(input.ruleId);
  const ruleName = readRequiredString(input.ruleName);
  const duplicateKey = readRequiredString(input.duplicateKey);
  const baseName = readRequiredString(input.baseName);
  const title = readRequiredString(input.message.title);
  const body = readOptionalMessageBody(input.message.body);
  const defenseCount = readNonNegativeInteger(input.defenseCount);
  const attackCount = readNonNegativeInteger(input.attackCount);

  if (
    guildId === null ||
    battleType === null ||
    ruleId === null ||
    ruleName === null ||
    duplicateKey === null ||
    baseName === null ||
    title === null ||
    body === null ||
    defenseCount === null ||
    attackCount === null
  ) {
    return null;
  }

  const baseId = readOptionalString(input.baseId);
  const attackerGuildId = readOptionalString(input.attackerGuildId);
  const attackerGuildName = readOptionalString(input.attackerGuildName);
  const username = readOptionalString(input.message.username);
  const mentionText = readOptionalString(input.message.mentionText);
  const source = isPlainObject(input.source) ? { observedAt: input.source.observedAt } : undefined;

  return {
    guildId,
    battleType,
    ruleId,
    ruleName,
    duplicateKey,
    ...(baseId === undefined ? {} : { baseId }),
    baseName,
    ...(attackerGuildId === undefined ? {} : { attackerGuildId }),
    ...(attackerGuildName === undefined ? {} : { attackerGuildName }),
    defenseCount,
    attackCount,
    message: {
      ...(username === undefined ? {} : { username }),
      ...(mentionText === undefined ? {} : { mentionText }),
      title,
      body
    },
    ...(source === undefined ? {} : { source })
  };
}

function createPartialLogContext(requestId: string, input: unknown): SafeLogContext {
  if (!isPlainObject(input)) {
    return { requestId };
  }

  const guildId = readOptionalString(input.guildId);
  const ruleId = readOptionalString(input.ruleId);
  return {
    requestId,
    ...(guildId === undefined ? {} : { guildId }),
    ...(ruleId === undefined ? {} : { ruleId })
  };
}

function readRequiredString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function readRequiredPathSegment(value: unknown): string | null {
  const text = readRequiredString(value);
  if (text === null || text.includes("/")) {
    return null;
  }

  return text;
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function readOptionalMessageBody(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function readNonNegativeInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
