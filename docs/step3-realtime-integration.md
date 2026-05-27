# Step3-F Realtime Integration Design

## Flow

Step3-F verifies the realtime pipeline without opening a WebSocket:

```txt
mock binary payload
-> parseRealtimePayload
-> normalizeRealtimeGvgMessages
-> applyGvgRealtimeMessages
-> GvgSnapshot
-> createOwnedCastleViewModels
```

## Responsibilities

- Parser reads bytes and produces raw realtime messages.
- Normalize maps raw transport messages to `GvgRealtimeMessage`.
- Merge applies normalized messages immutably to `GvgSnapshot`.
- Guild Battle selectors produce owner-focused ViewModels.
- UI is not involved in this step.

## Why this layer exists

The integration service proves the layers compose before adding a real WebSocket client.
It also gives future UI or client code a single pure entry point for payload processing:

- `processRealtimePayload`
- `applyRealtimePayloadToSnapshot`

## Covered realtime scenarios

- defense count updates
- attack count updates
- alert level changes
- ownership changes
- guild name updates
- unknown payload tolerance
- source snapshot immutability

## Next step

The next step can add a real WebSocket adapter or a manual UI debug path.
The adapter should emit `payloadReceived` events only and reuse this integration service for parse, normalize, and merge.
