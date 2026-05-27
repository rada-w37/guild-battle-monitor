import type {
  GvgCastle,
  GvgCastleStatus,
  GvgCastleUpdate,
  GvgRealtimeMessage,
  GvgSnapshot
} from "./types";

export function applyGvgRealtimeMessage(
  snapshot: GvgSnapshot,
  message: GvgRealtimeMessage
): GvgSnapshot {
  switch (message.type) {
    case "snapshot":
      return message.snapshot;
    case "castleUpdate":
      return applyGvgCastleUpdate(snapshot, message.castle);
    case "guildNameUpdate":
      return {
        ...snapshot,
        guildNames: {
          ...snapshot.guildNames,
          [message.guild.guildId]: message.guild.guildName
        }
      };
    case "unknown":
      return snapshot;
  }
}

export function applyGvgRealtimeMessages(
  snapshot: GvgSnapshot,
  messages: readonly GvgRealtimeMessage[]
): GvgSnapshot {
  return messages.reduce(
    (currentSnapshot, message) => applyGvgRealtimeMessage(currentSnapshot, message),
    snapshot
  );
}

export function applyGvgCastleUpdate(
  snapshot: GvgSnapshot,
  update: GvgCastleUpdate
): GvgSnapshot {
  const updatedCastle = createCastleFromUpdate(snapshot, update);
  const existingIndex = snapshot.castles.findIndex((castle) => castle.castleId === update.castleId);

  if (existingIndex === -1) {
    return {
      ...snapshot,
      capturedAt: update.updatedAt,
      castles: [...snapshot.castles, updatedCastle]
    };
  }

  return {
    ...snapshot,
    capturedAt: update.updatedAt,
    castles: snapshot.castles.map((castle, index) =>
      index === existingIndex ? updatedCastle : castle
    )
  };
}

function createCastleFromUpdate(snapshot: GvgSnapshot, update: GvgCastleUpdate): GvgCastle {
  return {
    castleId: update.castleId,
    worldId: update.worldId ?? snapshot.worldId,
    state: update.state,
    status: update.status ?? deriveGvgCastleStatus(update),
    ownerGuildId: update.ownerGuildId,
    attackerGuildId: update.attackerGuildId,
    defenseCount: update.defenseCount,
    attackCount: update.attackCount,
    fallenAt: update.fallenAt,
    lastWinPartyKnockOutCount: update.lastWinPartyKnockOutCount,
    updatedAt: update.updatedAt
  };
}

function deriveGvgCastleStatus(update: GvgCastleUpdate): GvgCastleStatus {
  if (update.state === "fallen") {
    return "fallen";
  }

  if (
    update.state === "inBattle" ||
    update.state === "counterattack" ||
    update.state === "counterattackSuccessful" ||
    update.attackCount > 0
  ) {
    return "underAttack";
  }

  if (update.state === "unknown") {
    return "unknown";
  }

  return "normal";
}
