import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { HttpsError, onCall, type CallableRequest } from "firebase-functions/v2/https";

const API_BASE_URL = "https://api.mentemori.icu";
const FUNCTION_REGION = "asia-northeast1";
const GUILD_SHARES_COLLECTION = "guildShares";
const GUILD_BATTLE_GUILD_CANDIDATES_COLLECTION = "guildBattleGuildCandidates";
const GUILD_BATTLE_GUILD_CANDIDATE_SYNC_STATUSES_COLLECTION = "guildBattleGuildCandidateSyncStatuses";
const GUILD_BATTLE_CANDIDATE_SYNC_STATUS_ID = "latest";
const GUILD_RANKING_SOURCE = "guild_ranking/latest";
const WORLD_ID_BASE = 1000;
const CANDIDATE_LIMIT = 16;

interface GuildShareDocument {
  readonly guildOwnerUid?: unknown;
  readonly adminAccessKey?: unknown;
  readonly world?: unknown;
}

interface GuildShareRecord {
  readonly guildOwnerUid: string | null;
  readonly adminAccessKey: string | null;
  readonly world: number | null;
}

interface GuildBattleGuildCandidate {
  readonly guildId: string;
  readonly guildName: string;
  readonly rank: number;
}

interface SyncGuildBattleGuildCandidatesOutput {
  readonly worldId: number;
  readonly candidates: readonly GuildBattleGuildCandidate[];
  readonly syncedAt?: unknown;
}

interface DocumentSnapshotLike {
  readonly exists: boolean;
  data(): Record<string, unknown> | undefined;
}

interface DocumentReferenceLike {
  readonly id: string;
  get(): Promise<DocumentSnapshotLike>;
}

interface WriteBatchLike {
  set(
    ref: DocumentReferenceLike,
    data: Record<string, unknown>,
    options?: { readonly merge: boolean }
  ): WriteBatchLike;
  commit(): Promise<unknown>;
}

interface FirestoreLike {
  doc(path: string): DocumentReferenceLike;
  batch(): WriteBatchLike;
}

type GuildRankingFetcher = (url: string) => Promise<{
  readonly ok: boolean;
  readonly status: number;
  readonly statusText: string;
  json(): Promise<unknown>;
}>;

interface Dependencies {
  readonly firestore: FirestoreLike;
  readonly now: () => Timestamp;
  readonly fetcher: GuildRankingFetcher;
  readonly apiBaseUrl: string;
}

interface CallableContext {
  readonly authUid: string | null;
}

export const syncGuildBattleGuildCandidates = onCall({ region: FUNCTION_REGION }, async (request: CallableRequest) =>
  handleSyncGuildBattleGuildCandidates(request.data, createCallableContext(request), createDefaultDependencies())
);

function createDefaultDependencies(): Dependencies {
  return {
    firestore: getFirestore(),
    now: () => Timestamp.now(),
    fetcher: globalThis.fetch,
    apiBaseUrl: API_BASE_URL
  };
}

export async function handleSyncGuildBattleGuildCandidates(
  input: unknown,
  context: CallableContext,
  dependencies: Dependencies
): Promise<SyncGuildBattleGuildCandidatesOutput> {
  const payload = readSyncInput(input);
  const share = await resolveNotificationSettingsShare(payload, context, dependencies);
  const world = resolveSyncWorld(payload, share, context);
  const worldId = WORLD_ID_BASE + world;
  let candidates: readonly GuildBattleGuildCandidate[];

  try {
    candidates = await fetchGuildBattleGuildCandidates(worldId, dependencies);
  } catch (error) {
    const storedCandidates = await loadStoredGuildBattleGuildCandidates(payload.guildId, dependencies);
    if (storedCandidates !== null) {
      return storedCandidates;
    }

    throw error;
  }

  const syncedAt = dependencies.now();
  const batch = dependencies.firestore.batch();

  for (const candidate of candidates) {
    batch.set(
      dependencies.firestore.doc(
        `${GUILD_SHARES_COLLECTION}/${payload.guildId}/${GUILD_BATTLE_GUILD_CANDIDATES_COLLECTION}/${candidate.guildId}`
      ),
      {
        ...candidate,
        worldId,
        source: GUILD_RANKING_SOURCE,
        syncedAt
      },
      { merge: false }
    );
  }

  batch.set(
    dependencies.firestore.doc(
      `${GUILD_SHARES_COLLECTION}/${payload.guildId}/${GUILD_BATTLE_GUILD_CANDIDATE_SYNC_STATUSES_COLLECTION}/${GUILD_BATTLE_CANDIDATE_SYNC_STATUS_ID}`
    ),
    {
      worldId,
      source: GUILD_RANKING_SOURCE,
      candidateGuildIds: candidates.map((candidate) => candidate.guildId),
      syncedAt
    },
    { merge: false }
  );

  await batch.commit();

  return { worldId, candidates, syncedAt };
}

async function fetchGuildBattleGuildCandidates(
  worldId: number,
  dependencies: Dependencies
): Promise<readonly GuildBattleGuildCandidate[]> {
  const url = buildGuildRankingLatestUrl(worldId, dependencies.apiBaseUrl);
  let response: Awaited<ReturnType<GuildRankingFetcher>>;

  try {
    response = await dependencies.fetcher(url);
  } catch (error) {
    throw new HttpsError("unavailable", "guild_ranking_fetch_failed");
  }

  if (!response.ok) {
    throw new HttpsError("unavailable", "guild_ranking_fetch_failed");
  }

  const payload = await readGuildRankingJson(response);
  const rankings = readRankings(payload);
  const stockRanking = rankings.stock;

  if (!Array.isArray(stockRanking)) {
    throw new HttpsError("failed-precondition", "invalid_guild_ranking_stock");
  }

  const candidates = stockRanking.slice(0, CANDIDATE_LIMIT).map(readGuildRankingCandidate);
  if (candidates.length !== CANDIDATE_LIMIT) {
    throw new HttpsError("failed-precondition", "insufficient_guild_ranking_stock");
  }

  return candidates;
}

function buildGuildRankingLatestUrl(worldId: number, apiBaseUrl: string): string {
  const normalizedBaseUrl = apiBaseUrl.endsWith("/") ? apiBaseUrl : `${apiBaseUrl}/`;
  return new URL(`${worldId}/guild_ranking/latest`, normalizedBaseUrl).toString();
}

async function readGuildRankingJson(response: Pick<Awaited<ReturnType<GuildRankingFetcher>>, "json">): Promise<unknown> {
  try {
    return await response.json();
  } catch (error) {
    throw new HttpsError("failed-precondition", "invalid_guild_ranking_response");
  }
}

function readRankings(payload: unknown): Record<string, unknown> {
  const data = isPlainObject(payload) && isPlainObject(payload.data) ? payload.data : payload;
  if (!isPlainObject(data) || !isPlainObject(data.rankings)) {
    throw new HttpsError("failed-precondition", "missing_guild_ranking_data");
  }

  return data.rankings;
}

function readGuildRankingCandidate(entry: unknown, index: number): GuildBattleGuildCandidate {
  if (!isPlainObject(entry)) {
    throw new HttpsError("failed-precondition", "invalid_guild_ranking_stock");
  }

  const guildId = readStringField(entry, ["guildId", "guild_id", "GuildId", "id"]);
  const guildName = readStringField(entry, ["guildName", "guild_name", "GuildName", "name"]);
  if (guildId === null || guildName === null) {
    throw new HttpsError("failed-precondition", "invalid_guild_ranking_stock");
  }

  return {
    guildId,
    guildName,
    rank: readPositiveIntegerField(entry, ["rank", "Rank"]) ?? index + 1
  };
}

function readStringField(data: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = data[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }

    if (typeof value === "number" && Number.isSafeInteger(value)) {
      return String(value);
    }
  }

  return null;
}

function readPositiveIntegerField(data: Record<string, unknown>, keys: readonly string[]): number | null {
  for (const key of keys) {
    const value = data[key];
    if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) {
      return value;
    }
  }

  return null;
}

async function loadStoredGuildBattleGuildCandidates(
  guildId: string,
  dependencies: Dependencies
): Promise<SyncGuildBattleGuildCandidatesOutput | null> {
  const statusSnapshot = await dependencies.firestore
    .doc(
      `${GUILD_SHARES_COLLECTION}/${guildId}/${GUILD_BATTLE_GUILD_CANDIDATE_SYNC_STATUSES_COLLECTION}/${GUILD_BATTLE_CANDIDATE_SYNC_STATUS_ID}`
    )
    .get();
  if (!statusSnapshot.exists) {
    return null;
  }

  const status = statusSnapshot.data();
  if (
    status === undefined ||
    typeof status.worldId !== "number" ||
    !Number.isInteger(status.worldId) ||
    !Array.isArray(status.candidateGuildIds)
  ) {
    return null;
  }

  const candidateGuildIds = status.candidateGuildIds.filter(
    (candidateGuildId): candidateGuildId is string => typeof candidateGuildId === "string" && candidateGuildId.trim().length > 0
  );
  const candidates: GuildBattleGuildCandidate[] = [];

  for (const candidateGuildId of candidateGuildIds) {
    const candidateSnapshot = await dependencies.firestore
      .doc(`${GUILD_SHARES_COLLECTION}/${guildId}/${GUILD_BATTLE_GUILD_CANDIDATES_COLLECTION}/${candidateGuildId}`)
      .get();
    const candidate = candidateSnapshot.exists ? readStoredGuildBattleGuildCandidate(candidateSnapshot.data()) : null;
    if (candidate !== null) {
      candidates.push(candidate);
    }
  }

  return candidates.length === 0
    ? null
    : {
        worldId: status.worldId,
        candidates,
        syncedAt: status.syncedAt
      };
}

function readStoredGuildBattleGuildCandidate(data: Record<string, unknown> | undefined): GuildBattleGuildCandidate | null {
  if (
    data === undefined ||
    typeof data.guildId !== "string" ||
    typeof data.guildName !== "string" ||
    typeof data.rank !== "number" ||
    !Number.isInteger(data.rank)
  ) {
    return null;
  }

  return {
    guildId: data.guildId,
    guildName: data.guildName,
    rank: data.rank
  };
}

async function resolveNotificationSettingsShare(
  payload: { readonly guildId: string; readonly accessKey?: string },
  context: CallableContext,
  dependencies: Dependencies
): Promise<GuildShareRecord> {
  const share = await loadGuildShare(payload.guildId, dependencies);

  if (context.authUid !== null && share.guildOwnerUid === context.authUid) {
    return share;
  }

  if (payload.accessKey !== undefined && share.adminAccessKey === payload.accessKey) {
    return share;
  }

  throw new HttpsError("permission-denied", "notification_settings_access_denied");
}

async function loadGuildShare(guildId: string, dependencies: Dependencies): Promise<GuildShareRecord> {
  const snapshot = await dependencies.firestore.doc(`${GUILD_SHARES_COLLECTION}/${guildId}`).get();
  if (!snapshot.exists) {
    throw new HttpsError("permission-denied", "notification_settings_access_denied");
  }

  const data = snapshot.data();
  if (data === undefined) {
    throw new HttpsError("failed-precondition", "invalid_guild_share");
  }

  const world = typeof data.world === "number" && Number.isInteger(data.world) ? data.world : null;
  return {
    guildOwnerUid: typeof data.guildOwnerUid === "string" ? data.guildOwnerUid : null,
    adminAccessKey: typeof data.adminAccessKey === "string" ? data.adminAccessKey : null,
    world
  };
}

function readAuthorizedInput(input: unknown): { readonly guildId: string; readonly accessKey?: string } {
  const guildId = readGuildId(input);
  const accessKey = isPlainObject(input) && typeof input.accessKey === "string" ? input.accessKey.trim() : undefined;
  return accessKey === undefined || accessKey.length === 0 ? { guildId } : { guildId, accessKey };
}

function readSyncInput(input: unknown): { readonly guildId: string; readonly accessKey?: string; readonly world?: number } {
  const authorizedInput = readAuthorizedInput(input);
  const world =
    isPlainObject(input) &&
    typeof input.world === "number" &&
    Number.isInteger(input.world) &&
    input.world > 0
      ? input.world
      : undefined;
  return world === undefined ? authorizedInput : { ...authorizedInput, world };
}

function resolveSyncWorld(
  payload: { readonly world?: number },
  share: GuildShareRecord,
  context: CallableContext
): number {
  if (context.authUid !== null && share.guildOwnerUid === context.authUid && payload.world !== undefined) {
    return payload.world;
  }

  if (share.world !== null) {
    return share.world;
  }

  throw new HttpsError("failed-precondition", "invalid_guild_share");
}

function readGuildId(input: unknown): string {
  if (!isPlainObject(input) || typeof input.guildId !== "string" || input.guildId.trim().length === 0) {
    throw new HttpsError("invalid-argument", "invalid_guild_id");
  }

  return input.guildId.trim();
}

function createCallableContext(request: CallableRequest): CallableContext {
  return { authUid: request.auth?.uid ?? null };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
