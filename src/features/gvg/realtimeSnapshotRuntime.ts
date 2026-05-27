import { processRealtimePayload, type RealtimePayloadProcessResult } from "./realtimeIntegrationService";
import { createGuildBattleSubscription, type GvgRealtimeClient, type GvgRealtimeSubscription } from "./realtimeClientTypes";
import type { GvgSnapshot } from "./types";

export interface GvgRealtimeSnapshotRuntimeOptions {
  readonly client: GvgRealtimeClient;
  readonly getReceivedAt?: () => string;
  readonly onSnapshotUpdated?: (snapshot: GvgSnapshot, result: RealtimePayloadProcessResult) => void;
  readonly onError?: (error: Error) => void;
}

export class GvgRealtimeSnapshotRuntime {
  private readonly client: GvgRealtimeClient;
  private readonly getReceivedAt: () => string;
  private readonly onSnapshotUpdated?: (snapshot: GvgSnapshot, result: RealtimePayloadProcessResult) => void;
  private readonly onError?: (error: Error) => void;
  private readonly removeClientListener: () => void;
  private currentSubscription: GvgRealtimeSubscription | null = null;
  private currentSnapshot: GvgSnapshot | null = null;
  private isStarted = false;

  constructor(options: GvgRealtimeSnapshotRuntimeOptions) {
    this.client = options.client;
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

  get snapshot(): GvgSnapshot | null {
    return this.currentSnapshot;
  }

  async start(initialSnapshot: GvgSnapshot): Promise<void> {
    this.currentSnapshot = initialSnapshot;

    if (this.isStarted) {
      return;
    }

    this.isStarted = true;
    const subscription = createGuildBattleSubscription(initialSnapshot.worldId);
    this.currentSubscription = subscription;

    await this.client.connect();
    this.client.subscribe(subscription);
  }

  stop(reason = "runtime stopped"): void {
    if (this.currentSubscription !== null) {
      this.client.unsubscribe(this.currentSubscription);
    }

    this.client.disconnect(reason);
    this.currentSubscription = null;
    this.isStarted = false;
  }

  dispose(reason = "runtime disposed"): void {
    this.stop(reason);
    this.removeClientListener();
    this.currentSnapshot = null;
  }

  private applyPayload(payload: Parameters<typeof processRealtimePayload>[1]): void {
    if (!this.isStarted || this.currentSnapshot === null) {
      return;
    }

    try {
      const result = processRealtimePayload(this.currentSnapshot, payload, this.getReceivedAt());
      this.currentSnapshot = result.snapshot;
      this.onSnapshotUpdated?.(result.snapshot, result);
    } catch (error) {
      this.onError?.(error instanceof Error ? error : new Error("GvG realtime payload processing failed"));
    }
  }
}
