import type { GvgGuildId } from "./types";

export function normalizeGvgGuildIdForComparison(
  guildId: GvgGuildId | string | number | null | undefined
): string | null {
  if (guildId === null || guildId === undefined) {
    return null;
  }

  const displayGuildId = String(guildId).trim();

  if (displayGuildId.length === 0) {
    return null;
  }

  // API responses may differ by number/string/zero padding. Keep display IDs separate from comparison IDs.
  return displayGuildId.replace(/^0+(?=\d)/, "");
}
