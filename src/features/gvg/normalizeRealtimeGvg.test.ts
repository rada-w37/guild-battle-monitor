import { describe, expect, it } from "vitest";
import { DEFAULT_GUILD_BATTLE_ALERT_THRESHOLDS } from "../guildBattle/settings";
import { createOwnedCastleViewModels } from "../guildBattle/selectors";
import { applyGvgRealtimeMessages } from "./realtimeMerge";
import {
  normalizeRealtimeCastleState,
  normalizeRealtimeGvgMessage,
  normalizeRealtimeGvgMessages
} from "./normalizeRealtimeGvg";
import type { RawCastleStatusMessage, RawGuildMessage, RawRealtimeMessage } from "./realtimeParserTypes";
import { buildGvgStreamId } from "./streamId";
import type { GvgCastle, GvgCastleId, GvgGuildId, GvgSnapshot, GvgWorldId } from "./types";

const receivedAt = "2026-05-27T00:10:00.000Z";
const castleStreamId = buildGvgStreamId({
  castleId: 1,
  block: 0,
  worldGroupId: 0,
  gvgClass: 0,
  worldId: 1001
});
const guildStreamId = buildGvgStreamId({
  castleId: 0,
  block: 0,
  worldGroupId: 0,
  gvgClass: 0,
  worldId: 1001
});

function createRawCastleStatusMessage(
  overrides: Partial<RawCastleStatusMessage> = {}
): RawCastleStatusMessage {
  return {
    type: "castleStatus",
    streamId: castleStreamId,
    guildId: "438130839" as GvgGuildId,
    attackerGuildId: "123456789" as GvgGuildId,
    utcFallenTimestamp: 1779840300,
    defenseCount: 12,
    attackCount: 3,
    state: "inBattle",
    rawState: 1,
    lastWinPartyKnockOutCount: 4,
    ...overrides
  };
}

function createRawGuildMessage(overrides: Partial<RawGuildMessage> = {}): RawGuildMessage {
  return {
    type: "guild",
    streamId: guildStreamId,
    guildId: "438130839" as GvgGuildId,
    guildName: "Owner Guild",
    clearsPreviousGuilds: false,
    ...overrides
  };
}

describe("normalizeRealtimeGvgMessage", () => {
  it("normalizes raw castle status into castleUpdate", () => {
    const message = normalizeRealtimeGvgMessage(createRawCastleStatusMessage(), receivedAt);

    expect(message).toEqual({
      type: "castleUpdate",
      receivedAt,
      castle: {
        castleId: "1",
        worldId: "1001",
        state: "inBattle",
        ownerGuildId: "438130839001",
        attackerGuildId: "123456789001",
        defenseCount: 12,
        attackCount: 3,
        fallenAt: "2026-05-27T00:05:00.000Z",
        lastWinPartyKnockOutCount: 4,
        updatedAt: receivedAt
      }
    });
  });

  it("normalizes raw guild message into guildNameUpdate", () => {
    const message = normalizeRealtimeGvgMessage(createRawGuildMessage(), receivedAt);

    expect(message).toEqual({
      type: "guildNameUpdate",
      receivedAt,
      guild: {
        guildId: "438130839001",
        guildName: "Owner Guild"
      }
    });
  });

  it("keeps unknown raw messages", () => {
    const message = normalizeRealtimeGvgMessage(
      {
        type: "unknown",
        reason: "unsupported",
        bytes: [1, 2, 3]
      },
      receivedAt
    );

    expect(message).toEqual({
      type: "unknown",
      receivedAt,
      reason: "unsupported"
    });
  });

  it("normalizes multiple raw messages in order", () => {
    const rawMessages: RawRealtimeMessage[] = [
      createRawGuildMessage(),
      createRawCastleStatusMessage(),
      {
        type: "unknown",
        reason: "later",
        bytes: [9]
      }
    ];

    expect(normalizeRealtimeGvgMessages(rawMessages, receivedAt).map((message) => message.type)).toEqual([
      "guildNameUpdate",
      "castleUpdate",
      "unknown"
    ]);
  });

  it("maps unknown state to unknown", () => {
    const message = normalizeRealtimeGvgMessage(
      createRawCastleStatusMessage({ state: "rawUnknown", rawState: 99 }),
      receivedAt
    );

    expect(message.type).toBe("castleUpdate");
    if (message.type === "castleUpdate") {
      expect(message.castle.state).toBe("unknown");
    }
    expect(normalizeRealtimeCastleState(99)).toBe("unknown");
  });

  it("does not throw when guild name is empty", () => {
    const message = normalizeRealtimeGvgMessage(
      createRawGuildMessage({ guildName: "   " }),
      receivedAt
    );

    expect(message).toEqual({
      type: "unknown",
      receivedAt,
      reason: "guild message did not include a guild name"
    });
  });

  it("feeds normalized messages into snapshot merge", () => {
    const snapshot = createSnapshot();
    const messages = normalizeRealtimeGvgMessages(
      [createRawGuildMessage(), createRawCastleStatusMessage()],
      receivedAt
    );
    const updatedSnapshot = applyGvgRealtimeMessages(snapshot, messages);
    const viewModels = createOwnedCastleViewModels(updatedSnapshot, {
      ownGuildId: "438130839001" as GvgGuildId,
      alertThresholds: DEFAULT_GUILD_BATTLE_ALERT_THRESHOLDS
    });

    expect(updatedSnapshot.guildNames["438130839001" as GvgGuildId]).toBe("Owner Guild");
    expect(updatedSnapshot.castles[0].attackCount).toBe(3);
    expect(viewModels).toEqual([
      expect.objectContaining({
        castleId: "1",
        alertLevel: "danger",
        statusLabel: "侵攻中"
      })
    ]);
  });
});

function createSnapshot(): GvgSnapshot {
  return {
    worldId: "1001" as GvgWorldId,
    capturedAt: "2026-05-27T00:00:00.000Z",
    guildNames: {},
    castles: [createCastle()]
  };
}

function createCastle(): GvgCastle {
  return {
    castleId: "1" as GvgCastleId,
    worldId: "1001" as GvgWorldId,
    state: "idle",
    status: "normal",
    ownerGuildId: "438130839001" as GvgGuildId,
    attackerGuildId: null,
    defenseCount: 30,
    attackCount: 0,
    fallenAt: null,
    lastWinPartyKnockOutCount: 0,
    updatedAt: "2026-05-27T00:00:00.000Z"
  };
}
