import { describe, expect, it } from "vitest";
import type { GvgCastleId } from "../gvg/types";
import {
  formatGuildBattleCastleType,
  getGuildBattleCastleMetadata
} from "./castleMetadata";

describe("guild battle castle metadata", () => {
  it("resolves castle names from castleId", () => {
    expect(getGuildBattleCastleMetadata("1" as GvgCastleId)).toEqual({
      castleName: "ブラッセル",
      castleType: "temple",
      castleTypeLabel: "神殿"
    });
    expect(getGuildBattleCastleMetadata("2" as GvgCastleId).castleName).toBe("ウィスケルケー");
  });

  it("resolves castle type labels", () => {
    expect(formatGuildBattleCastleType("temple")).toBe("神殿");
    expect(formatGuildBattleCastleType("castle")).toBe("城");
    expect(formatGuildBattleCastleType("church")).toBe("教会");
  });

  it("falls back safely when metadata is missing", () => {
    expect(getGuildBattleCastleMetadata("99" as GvgCastleId)).toEqual({
      castleName: "拠点 99",
      castleType: "unknown",
      castleTypeLabel: "不明"
    });
  });

  it("falls back safely when castleId is not numeric", () => {
    expect(getGuildBattleCastleMetadata("castle-x" as GvgCastleId)).toEqual({
      castleName: "拠点 castle-x",
      castleType: "unknown",
      castleTypeLabel: "不明"
    });
  });
});
