import type { GuildShare } from "./types";

const ACCESS_KEY_RANDOM_LENGTH = 12;
const ACCESS_KEY_CHARACTERS = "abcdefghijklmnopqrstuvwxyz0123456789";

export function createGuildShare(guildId: string): GuildShare {
  return {
    guildId,
    adminAccessKey: createAccessKey("a_"),
    guestAccessKey: createAccessKey("g_")
  };
}

export function createGuildShareUrl(origin: string, guildId: string, accessKey: string): string {
  return `${origin.replace(/\/$/, "")}/${encodeURIComponent(guildId)}/${encodeURIComponent(accessKey)}`;
}

function createAccessKey(prefix: "a_" | "g_"): string {
  const randomValues = new Uint32Array(ACCESS_KEY_RANDOM_LENGTH);
  crypto.getRandomValues(randomValues);
  const randomPart = Array.from(
    randomValues,
    (value) => ACCESS_KEY_CHARACTERS[value % ACCESS_KEY_CHARACTERS.length]
  ).join("");

  return `${prefix}${randomPart}`;
}
