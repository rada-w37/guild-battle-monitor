import type { GvgCastleId } from "../gvg/types";

export type GuildBattleCastleType = "temple" | "castle" | "church";

export interface GuildBattleCastleMetadata {
  readonly castleId: number;
  readonly name: string;
  readonly type: GuildBattleCastleType;
}

export interface GuildBattleCastleMetadataView {
  readonly castleName: string;
  readonly castleType: GuildBattleCastleType | "unknown";
  readonly castleTypeLabel: string;
}

export const GUILD_BATTLE_CASTLE_METADATA = [
  { castleId: 1, name: "ブラッセル", type: "temple" },
  { castleId: 2, name: "ウィスケルケー", type: "castle" },
  { castleId: 3, name: "モダーヴ", type: "castle" },
  { castleId: 4, name: "シメイ", type: "castle" },
  { castleId: 5, name: "グラベンスティン", type: "castle" },
  { castleId: 6, name: "カンブル", type: "church" },
  { castleId: 7, name: "クインティヌス", type: "church" },
  { castleId: 8, name: "ランベール", type: "church" },
  { castleId: 9, name: "サンジャック", type: "church" },
  { castleId: 10, name: "ミヒャエル", type: "church" },
  { castleId: 11, name: "ナミュール", type: "church" },
  { castleId: 12, name: "シャルルロア", type: "church" },
  { castleId: 13, name: "アルゼット", type: "church" },
  { castleId: 14, name: "エノー", type: "church" },
  { castleId: 15, name: "ワーヴル", type: "church" },
  { castleId: 16, name: "モンス", type: "church" },
  { castleId: 17, name: "クリストフ", type: "church" },
  { castleId: 18, name: "コルトレイク", type: "church" },
  { castleId: 19, name: "イーペル", type: "church" },
  { castleId: 20, name: "サルヴァトール", type: "church" },
  { castleId: 21, name: "バーフ", type: "church" }
] as const satisfies readonly GuildBattleCastleMetadata[];

const CASTLE_METADATA_BY_ID = new Map<number, GuildBattleCastleMetadata>(
  GUILD_BATTLE_CASTLE_METADATA.map((metadata) => [metadata.castleId, metadata])
);

export function getGuildBattleCastleMetadata(castleId: GvgCastleId): GuildBattleCastleMetadataView {
  const numericCastleId = Number(castleId);

  if (!Number.isInteger(numericCastleId)) {
    return {
      castleName: `拠点 ${castleId}`,
      castleType: "unknown",
      castleTypeLabel: "不明"
    };
  }

  const metadata = CASTLE_METADATA_BY_ID.get(numericCastleId);

  if (!metadata) {
    return {
      castleName: `拠点 ${numericCastleId}`,
      castleType: "unknown",
      castleTypeLabel: "不明"
    };
  }

  return {
    castleName: metadata.name,
    castleType: metadata.type,
    castleTypeLabel: formatGuildBattleCastleType(metadata.type)
  };
}

export function formatGuildBattleCastleType(type: GuildBattleCastleType): string {
  switch (type) {
    case "temple":
      return "神殿";
    case "castle":
      return "城";
    case "church":
      return "教会";
  }
}
