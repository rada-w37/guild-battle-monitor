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

  // APIによって数値/文字列/ゼロ埋めの差があり得るため、比較専用IDは表示用IDから分離する。
  return displayGuildId.replace(/^0+(?=\d)/, "");
}
