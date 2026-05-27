# Step3-A Realtime Merge Design

## Roles

REST `localgvg/latest` remains the initial full snapshot source.
Future WebSocket messages are treated as normalized deltas that update that snapshot.

The intended flow is:

1. WebSocket binary
2. WebSocket parser
3. `normalizeRealtimeGvgMessage`
4. `GvgRealtimeMessage`
5. `applyGvgRealtimeMessage`
6. `GvgSnapshot`
7. Guild Battle selectors
8. UI

Step3-A implements only steps 4 and 5.
It does not connect to WebSocket, parse binary payloads, auto-refresh, notify, or update UI.

## Why UI does not receive deltas

UI should always receive a complete `GvgSnapshot`.
This keeps screens independent from transport details and lets REST and WebSocket share the same Guild Battle selectors.
Realtime update ordering, unknown castle IDs, and guild-name merges stay in the GvG common layer.

## Unknown castle IDs

If a normalized castle update references a castle ID that is not in the REST snapshot, the merge layer adds it.
This favors resilience over strict rejection because REST snapshots and realtime streams may differ due to timing, cache, or future API changes.

## Guild names

Castle status updates may not include guild names, so `guildNames` is preserved when applying castle updates.
A minimal `guildNameUpdate` message exists for a future stream that can update the name map without changing castles.

## Immutable updates

All merge functions return a new `GvgSnapshot`.
The source snapshot and its castle list are not mutated.

## Next step

The next step can design WebSocket message normalization:

- binary payload shape investigation
- parser boundary
- `normalizeRealtimeGvgMessage`
- fixture-based tests that produce `GvgRealtimeMessage`

The merge layer should remain reusable by REST-only UI and future realtime UI.
