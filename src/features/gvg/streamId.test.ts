import { describe, expect, it } from "vitest";
import {
  buildGvgStreamId,
  createGuildBattleAllCastlesStreamScope,
  decodeGvgStreamId
} from "./streamId";
import type { GvgWorldId } from "./types";

describe("GvG stream ID", () => {
  it("builds and decodes a Guild Battle all-castles scope", () => {
    const scope = createGuildBattleAllCastlesStreamScope("1001" as GvgWorldId);
    const streamId = buildGvgStreamId(scope);

    expect(decodeGvgStreamId(streamId)).toEqual({
      castleId: 0,
      block: 0,
      worldGroupId: 0,
      gvgClass: 0,
      worldId: 1001
    });
  });

  it("builds the documented Guild Battle castle stream ID example", () => {
    const streamId = buildGvgStreamId({
      castleId: 21,
      block: 0,
      worldGroupId: 0,
      gvgClass: 0,
      worldId: 6017
    });

    expect(streamId.toString(16)).toBe("bc080015");
    expect(decodeGvgStreamId(streamId)).toEqual({
      castleId: 21,
      block: 0,
      worldGroupId: 0,
      gvgClass: 0,
      worldId: 6017
    });
  });

  it("keeps Grand Battle fields configurable for future use", () => {
    const streamId = buildGvgStreamId({
      castleId: 7,
      block: 2,
      worldGroupId: 12,
      gvgClass: 3,
      worldId: 0
    });

    expect(decodeGvgStreamId(streamId)).toEqual({
      castleId: 7,
      block: 2,
      worldGroupId: 12,
      gvgClass: 3,
      worldId: 0
    });
  });

  it("rejects out-of-range fields", () => {
    expect(() =>
      buildGvgStreamId({
        castleId: 32,
        block: 0,
        worldGroupId: 0,
        gvgClass: 0,
        worldId: 1001
      })
    ).toThrow("castleId");
  });
});
