# Step4-B Realtime Runtime Pipeline

## Runtime responsibility

`GvgRealtimeSnapshotRuntime` connects a realtime client to the existing payload pipeline.
It owns application-level snapshot state outside UI:

- connect the injected `GvgRealtimeClient`
- subscribe with `createGuildBattleSubscription(snapshot.worldId)`
- listen for `payloadReceived`
- call `processRealtimePayload`
- keep the latest `GvgSnapshot`
- notify callers through `onSnapshotUpdated`

It does not update React state, render UI, reconnect, notify users, or change parser/normalize/merge behavior.

## Pipeline connection point

The runtime connects these existing layers:

```txt
GvgRealtimeClient
-> payloadReceived
-> processRealtimePayload
-> parseRealtimePayload
-> normalizeRealtimeGvgMessages
-> applyGvgRealtimeMessages
-> current GvgSnapshot
```

`BrowserGvgRealtimeClient` and `MockGvgRealtimeClient` both satisfy the same client interface, so tests can run without opening `wss://api.mentemori.icu/gvg`.

## Snapshot lifecycle

The runtime starts from a REST-derived initial snapshot.
Each realtime payload is applied to the current snapshot and replaces the runtime's internal snapshot reference with the immutable result.

Payloads are ignored when no snapshot has been started or after the runtime is stopped.
Unknown payloads are still passed through the parser/normalize/merge pipeline; the current merge behavior leaves the snapshot unchanged.

## UI is still disconnected

Step4-B intentionally stops before React integration.
The callback shape exists so a later UI step can subscribe to snapshot updates, but no component imports or uses the runtime yet.

## Reconnect

Reconnect remains out of scope.
If the client disconnects, the runtime does not create a retry loop or resubscribe automatically.

## Next step

The next step can add a small UI realtime control after REST snapshot load:

1. create a runtime from the current snapshot
2. start realtime monitoring
3. update UI state from `onSnapshotUpdated`
4. keep manual stop/disconnect available
