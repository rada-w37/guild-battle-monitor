import { describe, expect, it } from "vitest";
import { normalizeRealtimeGvgMessages } from "./normalizeRealtimeGvg";
import { buildGvgStreamId } from "./streamId";
import {
  parseRealtimePayload,
  type RawRealtimeMessage,
  type RealtimeParserResult
} from "./realtimeParserTypes";

const guildStreamId = buildGvgStreamId({
  castleId: 0,
  block: 0,
  worldGroupId: 0,
  gvgClass: 0,
  worldId: 1001
});

const castleStreamId = buildGvgStreamId({
  castleId: 1,
  block: 0,
  worldGroupId: 0,
  gvgClass: 0,
  worldId: 1001
});

describe("realtime parser boundary types", () => {
  it("can represent unknown messages without dropping bytes", () => {
    const message: RawRealtimeMessage = {
      type: "unknown",
      streamId: guildStreamId,
      reason: "unsupported message shape",
      bytes: [1, 2, 3]
    };

    expect(message).toEqual({
      type: "unknown",
      streamId: guildStreamId,
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
});

describe("parseRealtimePayload", () => {
  it("parses guild information messages", () => {
    const result = parseRealtimePayload(createGuildMessageBytes(438130839, "Guild"));

    expect(result.status).toBe("ok");
    expect(result.messages).toEqual([
      {
        type: "guild",
        streamId: guildStreamId,
        guildId: "438130839",
        guildName: "Guild",
        clearsPreviousGuilds: false
      }
    ]);
  });

  it("parses castle status messages using little-endian integers", () => {
    const result = parseRealtimePayload(
      createCastleStatusBytes({
        guildId: 438130839,
        attackerGuildId: 123456789,
        fallenTimestamp: 1779840300,
        defenseCount: 513,
        attackCount: 258,
        rawState: 4,
        koCount: 1027
      })
    );

    expect(result.status).toBe("ok");
    expect(result.messages).toEqual([
      {
        type: "castleStatus",
        streamId: castleStreamId,
        guildId: "438130839",
        attackerGuildId: "123456789",
        utcFallenTimestamp: 1779840300,
        defenseCount: 513,
        attackCount: 258,
        state: "rawUnknown",
        rawState: 4,
        lastWinPartyKnockOutCount: 1027
      }
    ]);
  });

  it("keeps unknown stream message bytes", () => {
    const unknownStreamId = buildGvgStreamId({
      castleId: 31,
      block: 0,
      worldGroupId: 0,
      gvgClass: 0,
      worldId: 1001
    });
    const bytes = writeUint32(unknownStreamId, [9, 8, 7]);
    const result = parseRealtimePayload(bytes);

    expect(result.status).toBe("ok");
    expect(result.messages).toEqual([
      {
        type: "unknown",
        streamId: unknownStreamId,
        reason: "unknown castle ID in stream ID: 31",
        bytes
      }
    ]);
  });

  it("parses multiple messages in order", () => {
    const payload = [
      ...createGuildMessageBytes(438130839, "Guild"),
      ...createCastleStatusBytes({ rawState: 1 })
    ];
    const result = parseRealtimePayload(payload);

    expect(result.status).toBe("ok");
    expect(result.messages.map((message) => message.type)).toEqual(["guild", "castleStatus"]);
  });

  it("does not throw for broken payloads", () => {
    const result = parseRealtimePayload([1, 2, 3]);

    expect(result.status).toBe("error");
    expect(result.messages).toEqual([
      {
        type: "unknown",
        reason: "payload ended before stream ID",
        bytes: [1, 2, 3]
      }
    ]);
  });

  it("can feed parsed messages into realtime normalize", () => {
    const result = parseRealtimePayload([
      ...createGuildMessageBytes(438130839, "Guild"),
      ...createCastleStatusBytes({ rawState: 1 })
    ]);

    expect(result.status).toBe("ok");
    const messages = normalizeRealtimeGvgMessages(result.messages, "2026-05-27T00:10:00.000Z");

    expect(messages.map((message) => message.type)).toEqual(["guildNameUpdate", "castleUpdate"]);
  });
});

function createGuildMessageBytes(guildId: number, guildName: string): number[] {
  const guildNameBytes = Array.from(new TextEncoder().encode(guildName));

  return [
    ...writeUint32(guildStreamId),
    ...writeUint32(guildId),
    guildNameBytes.length,
    ...guildNameBytes
  ];
}

function createCastleStatusBytes(
  overrides: Partial<{
    guildId: number;
    attackerGuildId: number;
    fallenTimestamp: number;
    defenseCount: number;
    attackCount: number;
    rawState: number;
    koCount: number;
  }> = {}
): number[] {
  return [
    ...writeUint32(castleStreamId),
    ...writeUint32(overrides.guildId ?? 438130839),
    ...writeUint32(overrides.attackerGuildId ?? 0),
    ...writeUint32(overrides.fallenTimestamp ?? 0),
    ...writeUint16(overrides.defenseCount ?? 10),
    ...writeUint16(overrides.attackCount ?? 0),
    overrides.rawState ?? 0,
    0,
    ...writeUint16(overrides.koCount ?? 0)
  ];
}

function writeUint32(value: number, tail: readonly number[] = []): number[] {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value, true);

  return [...bytes, ...tail];
}

function writeUint16(value: number): number[] {
  const bytes = new Uint8Array(2);
  new DataView(bytes.buffer).setUint16(0, value, true);

  return [...bytes];
}
