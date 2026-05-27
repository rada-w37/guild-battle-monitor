# Step4-A WebSocket Runtime Client

## Runtime client responsibility

`BrowserGvgRealtimeClient` is the first real WebSocket adapter.
It owns only the transport boundary:

- open `wss://api.mentemori.icu/gvg`
- close the socket
- send subscribe and unsubscribe payloads
- convert binary WebSocket messages into `payloadReceived` events
- publish connection state changes

It does not parse payloads, normalize realtime messages, merge snapshots, update UI, reconnect, or notify users.

## Position in the realtime pipeline

The client stops at raw binary delivery:

```txt
BrowserGvgRealtimeClient
-> payloadReceived
-> parseRealtimePayload
-> normalizeRealtimeGvgMessages
-> applyGvgRealtimeMessages
-> GvgSnapshot
-> UI
```

Step4-A implements only the first two lines.

## Mock and runtime clients

`MockGvgRealtimeClient` remains useful for deterministic tests.
`BrowserGvgRealtimeClient` implements the same `GvgRealtimeClient` interface, so later steps can inject either client without changing parser, normalize, merge, or selector code.

## Binary payloads

The runtime client sets `binaryType = "arraybuffer"` and accepts both `ArrayBuffer` and `Blob` message data.
Payloads are emitted as bytes through `payloadReceived`.

## Subscription

Guild Battle subscription payloads are still built by `createGuildBattleSubscription(worldId)`.
The runtime client only sends the provided payload when connected.

`unsubscribe` also sends the subscription payload through the same boundary for now because the current client interface models only a stream payload.
If the upstream protocol later needs a distinct unsubscribe frame, that should be added to the subscription builder rather than parser or UI code.

## Reconnect

Reconnect is intentionally not implemented in Step4-A.
The current client reports `error` and `disconnected` states, which is enough to verify runtime connection boundaries before adding retry policy.

## Next step

The next step can connect this runtime client to the existing payload processing service, still behind a small application boundary.
UI realtime wiring should happen only after the runtime-to-snapshot flow is tested without a screen.
