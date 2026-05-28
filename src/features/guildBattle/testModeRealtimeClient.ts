import type {
  GvgRealtimeClient,
  GvgRealtimeClientEvent,
  GvgRealtimeClientListener,
  GvgRealtimeConnectionState,
  GvgRealtimeSubscription
} from "../gvg/realtimeClientTypes";
import type { GvgCastleId, GvgGuildId, GvgSnapshot, GvgWorldId } from "../gvg/types";
import { buildGvgStreamId } from "../gvg/streamId";
import type { RealtimePayloadBytes } from "../gvg/realtimeParserTypes";

type TestModeCastleState = {
  readonly castleId: GvgCastleId;
  readonly worldId: GvgWorldId;
  readonly ownerGuildId: GvgGuildId | null;
  readonly attackerGuildId: GvgGuildId | null;
  readonly defenseCount: number;
  readonly attackCount: number;
  readonly rawState: number;
  readonly fallenTimestamp: number;
  readonly lastWinPartyKnockOutCount: number;
};

const RAW_STATE_IDLE = 0;
const RAW_STATE_IN_BATTLE = 1;
const RAW_STATE_FALLEN = 2;
const REVIVED_DEFENSE_COUNT = 30;

export class TestModeGvgRealtimeClient implements GvgRealtimeClient {
  readonly subscriptions: GvgRealtimeSubscription[] = [];
  readonly sentUnsubscriptions: GvgRealtimeSubscription[] = [];
  private readonly listeners = new Set<GvgRealtimeClientListener>();
  private readonly castles = new Map<GvgCastleId, TestModeCastleState>();
  private currentState: GvgRealtimeConnectionState = { status: "idle" };
  private tickTimerId: ReturnType<typeof setInterval> | null = null;

  get state(): GvgRealtimeConnectionState {
    return this.currentState;
  }

  setSnapshot(snapshot: GvgSnapshot): void {
    this.castles.clear();

    for (const castle of snapshot.castles) {
      this.castles.set(castle.castleId, {
        castleId: castle.castleId,
        worldId: castle.worldId,
        ownerGuildId: castle.ownerGuildId,
        attackerGuildId: castle.attackerGuildId,
        defenseCount: castle.defenseCount,
        attackCount: castle.attackCount,
        rawState: castle.state === "fallen" ? RAW_STATE_FALLEN : castle.attackCount > 0 ? RAW_STATE_IN_BATTLE : RAW_STATE_IDLE,
        fallenTimestamp: castle.fallenAt === null ? 0 : Math.floor(new Date(castle.fallenAt).getTime() / 1000),
        lastWinPartyKnockOutCount: castle.lastWinPartyKnockOutCount
      });
    }
  }

  async connect(): Promise<void> {
    this.setState({ status: "connecting" });
    this.setState({ status: "connected" });
    this.emit({ type: "connected" });
    this.startTick();
  }

  disconnect(reason?: string): void {
    this.stopTick();
    this.setState({ status: "disconnected", reason });
    this.emit({ type: "disconnected", reason });
  }

  subscribe(subscription: GvgRealtimeSubscription): void {
    this.subscriptions.push(subscription);
  }

  unsubscribe(subscription: GvgRealtimeSubscription): void {
    this.sentUnsubscriptions.push(subscription);
  }

  addEventListener(listener: GvgRealtimeClientListener): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  increaseDefense(castleId: GvgCastleId, amount: number): void {
    this.updateCastle(castleId, (castle) => ({
      ...castle,
      defenseCount: castle.defenseCount + amount,
      rawState: castle.rawState === RAW_STATE_FALLEN ? RAW_STATE_FALLEN : castle.rawState
    }));
  }

  increaseAttack(castleId: GvgCastleId, amount: number): void {
    this.updateCastle(castleId, (castle) => ({
      ...castle,
      attackerGuildId: castle.attackerGuildId ?? ("999999999" as GvgGuildId),
      attackCount: castle.attackCount + amount,
      rawState: castle.defenseCount <= 0 ? RAW_STATE_FALLEN : RAW_STATE_IN_BATTLE
    }));
  }

  reviveCastle(castleId: GvgCastleId): void {
    this.updateCastle(castleId, (castle) => ({
      ...castle,
      defenseCount: Math.max(castle.defenseCount, REVIVED_DEFENSE_COUNT),
      attackCount: 0,
      rawState: RAW_STATE_IDLE,
      fallenTimestamp: 0
    }));
  }

  private startTick(): void {
    if (this.tickTimerId !== null) {
      return;
    }

    this.tickTimerId = setInterval(() => {
      for (const castle of this.castles.values()) {
        if (castle.defenseCount <= 0 || castle.attackCount <= 0) {
          continue;
        }

        const shouldDecreaseDefense = Math.random() < 0.5;
        this.updateCastle(castle.castleId, (currentCastle) => {
          const defenseCount = shouldDecreaseDefense
            ? Math.max(0, currentCastle.defenseCount - 1)
            : currentCastle.defenseCount;
          const attackCount = shouldDecreaseDefense
            ? currentCastle.attackCount
            : Math.max(0, currentCastle.attackCount - 1);

          return {
            ...currentCastle,
            defenseCount,
            attackCount,
            rawState: defenseCount <= 0 ? RAW_STATE_FALLEN : attackCount > 0 ? RAW_STATE_IN_BATTLE : RAW_STATE_IDLE,
            fallenTimestamp:
              defenseCount <= 0 ? Math.floor(Date.now() / 1000) : currentCastle.fallenTimestamp
          };
        });
      }
    }, 1000);
  }

  private stopTick(): void {
    if (this.tickTimerId === null) {
      return;
    }

    clearInterval(this.tickTimerId);
    this.tickTimerId = null;
  }

  private updateCastle(
    castleId: GvgCastleId,
    updater: (castle: TestModeCastleState) => TestModeCastleState
  ): void {
    const castle = this.castles.get(castleId);

    if (!castle) {
      return;
    }

    const nextCastle = updater(castle);
    this.castles.set(castleId, nextCastle);
    this.emitPayload(createCastleStatusPayload(nextCastle));
  }

  private emitPayload(payload: RealtimePayloadBytes): void {
    this.emit({ type: "payloadReceived", payload });
  }

  private setState(state: GvgRealtimeConnectionState): void {
    this.currentState = state;
    this.emit({ type: "stateChanged", state });
  }

  private emit(event: GvgRealtimeClientEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}

function createCastleStatusPayload(castle: TestModeCastleState): Uint8Array {
  const payload = new Uint8Array(24);
  const view = new DataView(payload.buffer);
  const streamId = buildGvgStreamId({
    castleId: Number(castle.castleId),
    block: 0,
    worldGroupId: 0,
    gvgClass: 0,
    worldId: Number(castle.worldId)
  });

  view.setUint32(0, streamId, true);
  view.setUint32(4, toRawGuildId(castle.ownerGuildId, castle.worldId), true);
  view.setUint32(8, toRawGuildId(castle.attackerGuildId, castle.worldId), true);
  view.setUint32(12, castle.fallenTimestamp, true);
  view.setUint16(16, castle.defenseCount, true);
  view.setUint16(18, castle.attackCount, true);
  view.setUint8(20, castle.rawState);
  view.setUint8(21, 0);
  view.setUint16(22, castle.lastWinPartyKnockOutCount, true);

  return payload;
}

function toRawGuildId(guildId: GvgGuildId | null, worldId: GvgWorldId): number {
  if (guildId === null) {
    return 0;
  }

  const guildIdText = String(guildId);
  const worldSuffix = String(Number(worldId) % 1000).padStart(3, "0");
  const rawGuildId = guildIdText.endsWith(worldSuffix)
    ? guildIdText.slice(0, -worldSuffix.length)
    : guildIdText;
  const rawGuildIdNumber = Number(rawGuildId);

  return Number.isFinite(rawGuildIdNumber) ? rawGuildIdNumber : 0;
}
