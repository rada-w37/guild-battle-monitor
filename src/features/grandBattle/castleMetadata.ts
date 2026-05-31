export type GrandBattleCastleType = "temple" | "castle" | "church";

export interface GrandBattleCastlePointInfo {
  readonly name: string;
  readonly name_en: string;
  readonly type: GrandBattleCastleType;
}

export const CASTLE_ID_TO_POINT_INFO: Readonly<Record<number, GrandBattleCastlePointInfo>> = {
  1: { name: "アイン", name_en: "ein", type: "temple" },
  2: { name: "イエソド", name_en: "yesod", type: "castle" },
  3: { name: "マルクト", name_en: "malkuth", type: "castle" },
  4: { name: "ケテル", name_en: "keter", type: "castle" },
  5: { name: "テファレト", name_en: "tiferet", type: "castle" },
  6: { name: "クシェル", name_en: "cushel", type: "church" },
  7: { name: "シトリ", name_en: "citri", type: "church" },
  8: { name: "トパズ", name_en: "toppaz", type: "church" },
  9: { name: "メラル", name_en: "meral", type: "church" },
  10: { name: "ペリド", name_en: "perido", type: "church" },
  11: { name: "ファリア", name_en: "pharia", type: "church" },
  12: { name: "ラピス", name_en: "lapis", type: "church" },
  13: { name: "ラリマル", name_en: "larimal", type: "church" },
  14: { name: "マリン", name_en: "marin", type: "church" },
  15: { name: "アメト", name_en: "amest", type: "church" },
  16: { name: "ラペン", name_en: "laven", type: "church" },
  17: { name: "ジルコン", name_en: "zircon", type: "church" },
  18: { name: "オニキス", name_en: "onyx", type: "church" },
  19: { name: "フロライト", name_en: "floryte", type: "church" },
  20: { name: "ガネット", name_en: "ganette", type: "church" },
  21: { name: "ルラ", name_en: "rula", type: "church" }
};

export function getGrandBattleCastleName(castleId: string): string {
  const numericCastleId = Number(castleId);

  if (!Number.isInteger(numericCastleId)) {
    return `拠点 ${castleId}`;
  }

  return CASTLE_ID_TO_POINT_INFO[numericCastleId]?.name ?? `拠点 ${castleId}`;
}
