import { randomInt } from "node:crypto";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { HttpsError, onCall, type CallableRequest } from "firebase-functions/v2/https";

const ACCESS_KEY_RANDOM_LENGTH = 12;
const ACCESS_KEY_CHARACTERS = "abcdefghijklmnopqrstuvwxyz0123456789";
const GUILD_SHARES_COLLECTION = "guildShares";

interface GuildShareDocument {
  readonly guildOwnerUid?: unknown;
  readonly adminAccessKey?: unknown;
  readonly guestAccessKey?: unknown;
  readonly world?: unknown;
  readonly guildName?: unknown;
  readonly createdAt?: unknown;
  readonly updatedAt?: unknown;
}

interface GuildShareRecord {
  readonly guildOwnerUid: string | null;
  readonly adminAccessKey: string;
  readonly guestAccessKey: string;
  readonly world: number;
  readonly guildName: string;
}

interface DocumentSnapshotLike {
  readonly exists: boolean;
  data(): GuildShareDocument | undefined;
}

interface DocumentReferenceLike {
  get(): Promise<DocumentSnapshotLike>;
  set(data: Record<string, unknown>, options: { readonly merge: boolean }): Promise<unknown>;
}

interface FirestoreLike {
  doc(path: string): DocumentReferenceLike;
}

interface Dependencies {
  readonly firestore: FirestoreLike;
  readonly now: () => Timestamp;
  readonly createAccessKeys: () => Pick<GuildShareRecord, "adminAccessKey" | "guestAccessKey">;
}

interface CallableContext {
  readonly authUid: string | null;
}

export interface GetOwnerGuildShareOutput {
  readonly exists: boolean;
  readonly guildId: string;
  readonly world?: number;
  readonly guildName?: string;
  readonly adminAccessKey?: string;
  readonly guestAccessKey?: string;
}

export interface SaveOwnerGuildShareOutput {
  readonly guildId: string;
  readonly world: number;
  readonly guildName: string;
  readonly adminAccessKey: string;
  readonly guestAccessKey: string;
}

export interface VerifyGuildShareAccessOutput {
  readonly role: "admin" | "viewer";
  readonly guildId: string;
  readonly world: number;
  readonly guildName: string;
}

export const getOwnerGuildShare = onCall(async (request: CallableRequest) =>
  handleGetOwnerGuildShare(request.data, createCallableContext(request), createDefaultDependencies())
);

export const saveOwnerGuildShare = onCall(async (request: CallableRequest) =>
  handleSaveOwnerGuildShare(request.data, createCallableContext(request), createDefaultDependencies())
);

export const verifyGuildShareAccess = onCall(async (request: CallableRequest) =>
  handleVerifyGuildShareAccess(request.data, createDefaultDependencies())
);

function createDefaultDependencies(): Dependencies {
  return {
    firestore: getFirestore(),
    now: () => Timestamp.now(),
    createAccessKeys
  };
}

export async function handleGetOwnerGuildShare(
  input: unknown,
  context: CallableContext,
  dependencies: Dependencies
): Promise<GetOwnerGuildShareOutput> {
  const authUid = requireAuth(context);
  const guildId = readGuildId(input);
  const snapshot = await dependencies.firestore.doc(`${GUILD_SHARES_COLLECTION}/${guildId}`).get();

  if (!snapshot.exists) {
    return { exists: false, guildId };
  }

  const share = readGuildShare(snapshot.data());
  assertGuildOwner(share, authUid);

  return {
    exists: true,
    guildId,
    world: share.world,
    guildName: share.guildName,
    adminAccessKey: share.adminAccessKey,
    guestAccessKey: share.guestAccessKey
  };
}

export async function handleSaveOwnerGuildShare(
  input: unknown,
  context: CallableContext,
  dependencies: Dependencies
): Promise<SaveOwnerGuildShareOutput> {
  const authUid = requireAuth(context);
  const payload = readSaveOwnerGuildShareInput(input);
  const documentRef = dependencies.firestore.doc(`${GUILD_SHARES_COLLECTION}/${payload.guildId}`);
  const snapshot = await documentRef.get();

  if (!snapshot.exists) {
    throw new HttpsError("failed-precondition", "guild_share_not_found");
  }

  const share = readGuildShare(snapshot.data());
  assertGuildOwner(share, authUid);

  await documentRef.set(
    {
      world: payload.world,
      guildName: payload.guildName,
      updatedAt: dependencies.now()
    },
    { merge: true }
  );

  return {
    guildId: payload.guildId,
    world: payload.world,
    guildName: payload.guildName,
    adminAccessKey: share.adminAccessKey,
    guestAccessKey: share.guestAccessKey
  };
}

export async function handleVerifyGuildShareAccess(
  input: unknown,
  dependencies: Dependencies
): Promise<VerifyGuildShareAccessOutput> {
  const payload = readVerifyGuildShareAccessInput(input);
  const snapshot = await dependencies.firestore.doc(`${GUILD_SHARES_COLLECTION}/${payload.guildId}`).get();

  if (!snapshot.exists) {
    throw new HttpsError("permission-denied", "guild_share_access_denied");
  }

  const share = readGuildShare(snapshot.data(), { requireOwnerUid: false });

  if (payload.accessKey === share.adminAccessKey) {
    return {
      role: "admin",
      guildId: payload.guildId,
      world: share.world,
      guildName: share.guildName
    };
  }

  if (payload.accessKey === share.guestAccessKey) {
    return {
      role: "viewer",
      guildId: payload.guildId,
      world: share.world,
      guildName: share.guildName
    };
  }

  throw new HttpsError("permission-denied", "guild_share_access_denied");
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

function assertGuildOwner(share: GuildShareRecord, authUid: string) {
  if (share.guildOwnerUid === null || share.guildOwnerUid !== authUid) {
    throw new HttpsError("permission-denied", "guild_owner_required");
  }
}

function readGuildId(input: unknown): string {
  if (!isPlainObject(input) || typeof input.guildId !== "string" || input.guildId.trim().length === 0) {
    throw new HttpsError("invalid-argument", "invalid_guild_id");
  }

  return input.guildId.trim();
}

function readSaveOwnerGuildShareInput(input: unknown) {
  const guildId = readGuildId(input);

  if (
    !isPlainObject(input) ||
    typeof input.world !== "number" ||
    !Number.isInteger(input.world) ||
    typeof input.guildName !== "string" ||
    input.guildName.trim().length === 0
  ) {
    throw new HttpsError("invalid-argument", "invalid_guild_share");
  }

  return {
    guildId,
    world: input.world,
    guildName: input.guildName.trim()
  };
}

function readVerifyGuildShareAccessInput(input: unknown) {
  const guildId = readGuildId(input);

  if (!isPlainObject(input) || typeof input.accessKey !== "string" || input.accessKey.trim().length === 0) {
    throw new HttpsError("invalid-argument", "invalid_access_key");
  }

  return {
    guildId,
    accessKey: input.accessKey.trim()
  };
}

function readGuildShare(
  data: GuildShareDocument | undefined,
  options: { readonly requireOwnerUid?: boolean } = {}
): GuildShareRecord {
  const requireOwnerUid = options.requireOwnerUid ?? true;

  if (
    data === undefined ||
    typeof data.adminAccessKey !== "string" ||
    typeof data.guestAccessKey !== "string" ||
    typeof data.world !== "number" ||
    !Number.isInteger(data.world) ||
    typeof data.guildName !== "string" ||
    data.guildName.trim().length === 0
  ) {
    throw new HttpsError("failed-precondition", "invalid_guild_share");
  }

  if (requireOwnerUid && typeof data.guildOwnerUid !== "string") {
    throw new HttpsError("permission-denied", "guild_owner_required");
  }

  return {
    guildOwnerUid: typeof data.guildOwnerUid === "string" ? data.guildOwnerUid : null,
    adminAccessKey: data.adminAccessKey,
    guestAccessKey: data.guestAccessKey,
    world: data.world,
    guildName: data.guildName
  };
}

function createAccessKeys(): Pick<GuildShareRecord, "adminAccessKey" | "guestAccessKey"> {
  return {
    adminAccessKey: createAccessKey("a_"),
    guestAccessKey: createAccessKey("g_")
  };
}

function createAccessKey(prefix: "a_" | "g_"): string {
  let randomPart = "";

  for (let index = 0; index < ACCESS_KEY_RANDOM_LENGTH; index += 1) {
    randomPart += ACCESS_KEY_CHARACTERS[randomInt(ACCESS_KEY_CHARACTERS.length)];
  }

  return `${prefix}${randomPart}`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
