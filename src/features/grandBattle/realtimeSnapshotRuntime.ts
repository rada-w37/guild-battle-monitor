import {
  createGrandBattleSubscription,
  type GvgRealtimeClient,
  type GvgRealtimeSubscription
} from "../gvg/realtimeClientTypes";
import { processGrandBattleRealtimePayload, type GrandBattleRealtimePayloadProcessResult } from "./realtimeMerge";
import type { GrandBattleSnapshot } from "./types";

export interface GrandBattleRealtimeSnapshotRuntimeOptions {
  readonly client: GvgRealtimeClient;
  readonly createSubscription?: (snapshot: GrandBattleSnapshot) => GvgRealtimeSubscription;
  readonly getReceivedAt?: () => string;
  readonly onSnapshotUpdated?: (
    snapshot: GrandBattleSnapshot,
    result: GrandBattleRealtimePayloadProcessResult
  ) => void;
  readonly onError?: (error: Error) => void;
}

export class GrandBattleRealtimeSnapshotRuntime {
  private readonly client: GvgRealtimeClient;
  private readonly createSubscription: (snapshot: GrandBattleSnapshot) => GvgRealtimeSubscription;
  private readonly getReceivedAt: () => string;
  private readonly onSnapshotUpdated?: (
    snapshot: GrandBattleSnapshot,
    result: GrandBattleRealtimePayloadProcessResult
  ) => void;
  private readonly onError?: (error: Error) => void;
  private readonly removeClientListener: () => void;
  private currentSubscription: GvgRealtimeSubscription | null = null;
  private currentSnapshot: GrandBattleSnapshot | null = null;
  private isStarted = false;

  constructor(options: GrandBattleRealtimeSnapshotRuntimeOptions) {
    this.client = options.client;
    this.createSubscription =
      options.createSubscription ??
      ((snapshot) =>
        createGrandBattleSubscription({
          worldGroupId: snapshot.worldGroupId,
          classId: snapshot.source.classId,
          blockId: snapshot.source.blockId
        }));
    this.getReceivedAt = options.getReceivedAt ?? (() => new Date().toISOString());
    this.onSnapshotUpdated = options.onSnapshotUpdated;
    this.onError = options.onError;
    this.removeClientListener = this.client.addEventListener((event) => {
      if (event.type !== "payloadReceived") {
        return;
      }

      this.applyPayload(event.payload);
    });
  }

  get snapshot(): GrandBattleSnapshot | null {
    return this.currentSnapshot;
  }

  async start(initialSnapshot: GrandBattleSnapshot): Promise<void> {
    this.currentSnapshot = initialSnapshot;

    if (this.isStarted) {
      return;
    }

    this.isStarted = true;
    const subscription = this.createSubscription(initialSnapshot);
    this.currentSubscription = subscription;

    await this.client.connect();
    this.client.subscribe(subscription);
  }

  stop(reason = "grand battle runtime stopped"): void {
    if (this.currentSubscription !== null) {
      this.client.unsubscribe(this.currentSubscription);
    }

    this.client.disconnect(reason);
    this.currentSubscription = null;
    this.isStarted = false;
  }

  dispose(reason = "grand battle runtime disposed"): void {
    this.stop(reason);
    this.removeClientListener();
    this.currentSnapshot = null;
  }

  private applyPayload(payload: Parameters<typeof processGrandBattleRealtimePayload>[1]): void {
    if (!this.isStarted || this.currentSnapshot === null) {
      return;
    }

    try {
      const result = processGrandBattleRealtimePayload(this.currentSnapshot, payload, this.getReceivedAt());
      this.currentSnapshot = result.snapshot;
      this.onSnapshotUpdated?.(result.snapshot, result);
    } catch (error) {
      this.onError?.(error instanceof Error ? error : new Error("GrandBattle realtime payload processing failed"));
    }
  }
}
