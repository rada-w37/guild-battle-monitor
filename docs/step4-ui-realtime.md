# Step4-C Realtime UI Connection

## UI connection scope

Step4-C connects the existing REST snapshot screen to `GvgRealtimeSnapshotRuntime`.
The UI can now:

- load the initial REST snapshot
- start realtime monitoring after `worldId` and own guild ID are present
- show the realtime connection state
- stop realtime monitoring
- update the displayed `GvgSnapshot` when `onSnapshotUpdated` fires

The owned-castle list still uses `createOwnedCastleViewModels`.
The UI does not inspect realtime payloads directly.

## Runtime lifecycle

The UI creates a realtime client only when monitoring starts.
`GvgRealtimeSnapshotRuntime.start(snapshot)` connects the client, subscribes to Guild Battle updates, and applies incoming payloads through the existing parser/normalize/merge pipeline.

On stop, snapshot reload, or component unmount, the runtime is disposed and the client is disconnected.

## Not implemented yet

Reconnect remains out of scope.
If the socket closes or errors, the UI shows the connection state but does not retry automatically.

The following are also still out of scope:

- notifications
- map display
- background processing
- Grand Battle support
- alert UI polish

## Next step

The next step can improve runtime ergonomics around connection errors and manual recovery, or add a narrow realtime debug path for development without changing the parser, normalize, or merge layers.
