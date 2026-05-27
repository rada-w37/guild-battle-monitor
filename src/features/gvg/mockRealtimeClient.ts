import type {
  GvgRealtimeClient,
  GvgRealtimeClientEvent,
  GvgRealtimeClientListener,
  GvgRealtimeConnectionState,
  GvgRealtimeSubscription
} from "./realtimeClientTypes";
import type { RealtimePayloadBytes } from "./realtimeParserTypes";

export class MockGvgRealtimeClient implements GvgRealtimeClient {
  readonly subscriptions: GvgRealtimeSubscription[] = [];
  readonly sentUnsubscriptions: GvgRealtimeSubscription[] = [];
  private listeners = new Set<GvgRealtimeClientListener>();
  private currentState: GvgRealtimeConnectionState = { status: "idle" };

  get state(): GvgRealtimeConnectionState {
    return this.currentState;
  }

  async connect(): Promise<void> {
    this.setState({ status: "connecting" });
    this.setState({ status: "connected" });
    this.emit({ type: "connected" });
  }

  disconnect(reason?: string): void {
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

  emitPayload(payload: RealtimePayloadBytes): void {
    this.emit({ type: "payloadReceived", payload });
  }

  emitError(error: Error): void {
    this.setState({ status: "error", error });
    this.emit({ type: "error", error });
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
