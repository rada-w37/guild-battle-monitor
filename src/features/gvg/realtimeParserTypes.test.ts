import { describe, expect, it } from "vitest";
import { buildGvgStreamId } from "./streamId";
import { parseRealtimePayload, type RawRealtimeMessage, type RealtimeParserResult } from "./realtimeParserTypes";

describe("realtime parser boundary types", () => {
  it("can represent unknown messages without dropping bytes", () => {
    const streamId = buildGvgStreamId({
      castleId: 0,
      block: 0,
      worldGroupId: 0,
      gvgClass: 0,
      worldId: 1001
    });
    const message: RawRealtimeMessage = {
      type: "unknown",
      streamId,
      reason: "unsupported message shape",
      bytes: [1, 2, 3]
    };

    expect(message).toEqual({
      type: "unknown",
      streamId,
      reason: "unsupported message shape",
      bytes: [1, 2, 3]
    });
  });

  it("supports parser results containing multiple raw messages", () => {
    const result: RealtimeParserResult = {
      status: "ok",
      messages: [
        {
          type: "unknown",
          reason: "first",
          bytes: [1]
        },
        {
          type: "unknown",
          reason: "second",
          bytes: [2]
        }
      ]
    };

    expect(result.messages).toHaveLength(2);
  });

  it("keeps the binary parser as an explicit unimplemented boundary", () => {
    const result = parseRealtimePayload([0, 1, 2, 3]);

    expect(result.status).toBe("error");
    expect(result.messages).toEqual([]);
    if (result.status === "error") {
      expect(result.error.message).toContain("not implemented");
    }
  });
});
