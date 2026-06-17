import { loadFirebaseServices } from "../../lib/firebase";
export type OwnerGuildShareResult =
  | {
      readonly exists: false;
      readonly guildId: string;
    }
  | {
      readonly exists: true;
      readonly guildId: string;
      readonly world: number;
      readonly guildName: string;
      readonly adminAccessKey: string;
      readonly guestAccessKey: string;
    };

export interface SaveOwnerGuildShareResult {
  readonly guildId: string;
  readonly world: number;
  readonly guildName: string;
  readonly adminAccessKey: string;
  readonly guestAccessKey: string;
}

export interface SaveOwnerGuildShareInput {
  readonly guildId: string;
  readonly world: number;
  readonly guildName: string;
}

export interface SharedGuildAccessResult {
  readonly role: "admin" | "viewer";
  readonly guildId: string;
  readonly world: number;
  readonly guildName: string;
}

export async function getOwnerGuildShare(guildId: string): Promise<OwnerGuildShareResult> {
  const result = await callFunction("getOwnerGuildShare", { guildId });
  return createOwnerGuildShareResult(result);
}

export async function saveOwnerGuildShare(input: SaveOwnerGuildShareInput): Promise<SaveOwnerGuildShareResult> {
  const result = await callFunction("saveOwnerGuildShare", input);
  return createSaveOwnerGuildShareResult(result);
}

export async function verifyGuildShareAccess({
  guildId,
  accessKey
}: {
  readonly guildId: string;
  readonly accessKey: string;
}): Promise<SharedGuildAccessResult> {
  const result = await callFunction("verifyGuildShareAccess", { guildId, accessKey });
  return createSharedGuildAccessResult(result);
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

function createOwnerGuildShareResult(data: unknown): OwnerGuildShareResult {
  if (!isPlainObject(data) || typeof data.exists !== "boolean" || typeof data.guildId !== "string") {
    throw new Error("共有URL情報の形式が不正です。");
  }

  if (!data.exists) {
    return { exists: false, guildId: data.guildId };
  }

  if (
    typeof data.world !== "number" ||
    typeof data.guildName !== "string" ||
    typeof data.adminAccessKey !== "string" ||
    typeof data.guestAccessKey !== "string"
  ) {
    throw new Error("共有URL情報の形式が不正です。");
  }

  return {
    exists: true,
    guildId: data.guildId,
    world: data.world,
    guildName: data.guildName,
    adminAccessKey: data.adminAccessKey,
    guestAccessKey: data.guestAccessKey
  };
}

function createSaveOwnerGuildShareResult(data: unknown): SaveOwnerGuildShareResult {
  if (
    !isPlainObject(data) ||
    typeof data.guildId !== "string" ||
    typeof data.world !== "number" ||
    typeof data.guildName !== "string" ||
    typeof data.adminAccessKey !== "string" ||
    typeof data.guestAccessKey !== "string"
  ) {
    throw new Error("共有URL情報の形式が不正です。");
  }

  return {
    guildId: data.guildId,
    world: data.world,
    guildName: data.guildName,
    adminAccessKey: data.adminAccessKey,
    guestAccessKey: data.guestAccessKey
  };
}

function createSharedGuildAccessResult(data: unknown): SharedGuildAccessResult {
  if (
    !isPlainObject(data) ||
    (data.role !== "admin" && data.role !== "viewer") ||
    typeof data.guildId !== "string" ||
    typeof data.world !== "number" ||
    typeof data.guildName !== "string"
  ) {
    throw new Error("共有URL検証結果の形式が不正です。");
  }

  return {
    role: data.role,
    guildId: data.guildId,
    world: data.world,
    guildName: data.guildName
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
