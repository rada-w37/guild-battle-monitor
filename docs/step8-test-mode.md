# Step8-B DEV test mode

Step8-B adds a DEV-only realtime test mode for checking alert UI outside Guild Battle hours.

## Scope

- DEV-only toggle UI
- `TestModeGvgRealtimeClient`
- per-castle buttons for:
  - defense +5
  - defense +10
  - attack +5
  - attack +10
  - revive
- random one-per-second battle decrement while defense and attack are both present
- fallen state when defense reaches 0

## Runtime boundary

Production still uses `BrowserGvgRealtimeClient`.

Test mode swaps the realtime client implementation only:

```txt
TestModeGvgRealtimeClient
-> binary castle status payload
-> parseRealtimePayload
-> normalizeRealtimeGvgMessages
-> applyGvgRealtimeMessages
-> GvgSnapshot
-> Guild Battle selectors
-> UI
```

Parser, normalize, merge, selector, and UI display logic are reused.

## DEV-only policy

The toggle and row operation buttons are rendered only when `import.meta.env.DEV` is true.

The production build does not expose test mode controls.

## Not changed

- Browser WebSocket client behavior
- parser responsibility
- normalize responsibility
- merge responsibility
- notification behavior
- map display
- Grand Battle support
