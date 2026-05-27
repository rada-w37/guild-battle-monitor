# Step3-E WebSocket Client Boundary Design

## Client responsibility

The realtime client boundary owns connection lifecycle and binary payload delivery only.

It can:

- connect
- disconnect
- subscribe
- unsubscribe
- emit raw binary payload events
- emit connection state events

It must not:

- parse binary payloads
- normalize raw messages
- merge messages into `GvgSnapshot`
- call Guild Battle selectors
- update UI
- emit notifications

## Event flow

The intended future flow is:

```txt
GvgRealtimeClient
-> payloadReceived
-> parseRealtimePayload
-> normalizeRealtimeGvgMessages
-> applyGvgRealtimeMessages
-> GvgSnapshot
-> UI
```

Step3-E stops at the client boundary and mock event emission.

## Connection lifecycle

`GvgRealtimeConnectionState` supports:

- `idle`
- `connecting`
- `connected`
- `reconnecting`
- `disconnected`
- `error`

Reconnect behavior is represented by `GvgRealtimeReconnectConfig`:

- `maxRetryCount`
- `retryIntervalMs`
- `exponentialBackoff`

No reconnect loop is implemented yet.

## Guild Battle subscription

`createGuildBattleSubscription(worldId)` builds a Guild Battle all-castles subscription.
It uses the stream ID field values:

- `castleId = 0`
- `block = 0`
- `worldGroupId = 0`
- `gvgClass = 0`
- `worldId = input world`

The subscription payload is the 4-byte stream ID encoded little-endian.
Grand Battle values remain in the underlying `GvgStreamScope` utilities and are not hard-coded into the lower-level stream ID builder.

## Mock client

`MockGvgRealtimeClient` exists for future tests.
It can emit payload and state events without opening a real WebSocket.

The next step can use it to test:

```txt
mock payload
-> parse
-> normalize
-> merge
```

without connecting to `wss://api.mentemori.icu/gvg`.
