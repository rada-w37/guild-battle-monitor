import type {
  GvgRealtimeClient,
  GvgRealtimeClientEvent,
  GvgRealtimeClientListener,
  GvgRealtimeConnectionState,
  GvgRealtimeSubscription
} from "./realtimeClientTypes";

export const GVG_REALTIME_WEBSOCKET_ENDPOINT = "wss://api.mentemori.icu/gvg";

const WEBSOCKET_CONNECTING = 0;
const WEBSOCKET_OPEN = 1;

type BrowserWebSocketLike = Pick<
  WebSocket,
  "binaryType" | "close" | "readyState" | "send" | "addEventListener" | "removeEventListener"
>;

export interface BrowserGvgRealtimeClientOptions {
  readonly endpoint?: string;
  readonly createWebSocket?: (endpoint: string) => BrowserWebSocketLike;
}

const CONNECTING_OR_OPEN_STATES = new Set<GvgRealtimeConnectionState["status"]>(["connecting", "connected"]);

export class BrowserGvgRealtimeClient implements GvgRealtimeClient {
  private readonly endpoint: string;
  private readonly createWebSocket: (endpoint: string) => BrowserWebSocketLike;
  private readonly listeners = new Set<GvgRealtimeClientListener>();
  private socket: BrowserWebSocketLike | null = null;
  private connectPromise: Promise<void> | null = null;
  private currentState: GvgRealtimeConnectionState = { status: "idle" };

  constructor(options: BrowserGvgRealtimeClientOptions = {}) {
    this.endpoint = options.endpoint ?? GVG_REALTIME_WEBSOCKET_ENDPOINT;
    this.createWebSocket =
      options.createWebSocket ??
      ((endpoint) => {
        return new WebSocket(endpoint);
      });
  }

  get state(): GvgRealtimeConnectionState {
    return this.currentState;
  }

  connect(): Promise<void> {
    if (CONNECTING_OR_OPEN_STATES.has(this.currentState.status)) {
      return this.connectPromise ?? Promise.resolve();
    }

    this.setState({ status: "connecting" });
    const socket = this.createWebSocket(this.endpoint);
    socket.binaryType = "arraybuffer";
    this.socket = socket;

    this.connectPromise = new Promise((resolve, reject) => {
      const handleOpen = (): void => {
        socket.addEventListener("error", this.handleRuntimeError);
        this.setState({ status: "connected" });
        this.emit({ type: "connected" });
        cleanupConnectListeners();
        resolve();
      };

      const handleError = (): void => {
        const error = new Error("GvG realtime WebSocket error");
        this.removeRuntimeListeners(socket);
        this.socket = null;
        this.connectPromise = null;
        this.setState({ status: "error", error });
        this.emit({ type: "error", error });
        cleanupConnectListeners();
        reject(error);
      };

      const cleanupConnectListeners = (): void => {
        socket.removeEventListener("open", handleOpen);
        socket.removeEventListener("error", handleError);
      };

      socket.addEventListener("open", handleOpen);
      socket.addEventListener("error", handleError);
      socket.addEventListener("message", this.handleMessage);
      socket.addEventListener("close", this.handleClose);
    });

    return this.connectPromise;
  }

  disconnect(reason?: string): void {
    const socket = this.socket;
    this.socket = null;
    this.connectPromise = null;

    if (socket === null) {
      if (this.currentState.status !== "disconnected") {
        this.setState({ status: "disconnected", reason });
        this.emit({ type: "disconnected", reason });
      }
      return;
    }

    this.removeRuntimeListeners(socket);

    if (socket.readyState === WEBSOCKET_CONNECTING || socket.readyState === WEBSOCKET_OPEN) {
      socket.close();
    }

    this.setState({ status: "disconnected", reason });
    this.emit({ type: "disconnected", reason });
  }

  subscribe(subscription: GvgRealtimeSubscription): void {
    this.sendIfConnected(subscription.payload);
  }

  unsubscribe(subscription: GvgRealtimeSubscription): void {
    this.sendIfConnected(subscription.payload);
  }

  addEventListener(listener: GvgRealtimeClientListener): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  private readonly handleMessage = (event: MessageEvent): void => {
    void this.emitPayload(event.data);
  };

  private readonly handleClose = (): void => {
    if (this.socket !== null) {
      this.removeRuntimeListeners(this.socket);
    }

    this.socket = null;
    this.connectPromise = null;
    this.setState({ status: "disconnected", reason: "closed" });
    this.emit({ type: "disconnected", reason: "closed" });
  };

  private readonly handleRuntimeError = (): void => {
    const error = new Error("GvG realtime WebSocket error");
    this.setState({ status: "error", error });
    this.emit({ type: "error", error });
  };

  private async emitPayload(payload: unknown): Promise<void> {
    if (payload instanceof ArrayBuffer) {
      this.emit({ type: "payloadReceived", payload: new Uint8Array(payload) });
      return;
    }

    if (ArrayBuffer.isView(payload)) {
      this.emit({
        type: "payloadReceived",
        payload: new Uint8Array(payload.buffer, payload.byteOffset, payload.byteLength)
      });
      return;
    }

    if (isBlobLike(payload)) {
      this.emit({ type: "payloadReceived", payload: new Uint8Array(await payload.arrayBuffer()) });
      return;
    }

    const error = new Error("GvG realtime WebSocket received unsupported payload");
    this.setState({ status: "error", error });
    this.emit({ type: "error", error });
  }

  private sendIfConnected(payload: Uint8Array): void {
    if (this.socket?.readyState !== WEBSOCKET_OPEN) {
      return;
    }

    this.socket.send(payload);
  }

  private removeRuntimeListeners(socket: BrowserWebSocketLike): void {
    socket.removeEventListener("message", this.handleMessage);
    socket.removeEventListener("close", this.handleClose);
    socket.removeEventListener("error", this.handleRuntimeError);
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

function isBlobLike(payload: unknown): payload is Blob {
  return typeof Blob !== "undefined" && payload instanceof Blob;
}
