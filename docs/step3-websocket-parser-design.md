# Step3-B WebSocket Parser Boundary Design

## Source specification

mentemori.icu documents `/gvg` as a binary WebSocket endpoint at `wss://api.mentemori.icu/gvg`.
All frames are binary and all integers are little-endian.

The server can send multiple messages in one WebSocket message.
The documented message categories are:

- Guild information messages
- Castle status messages

Guild information messages are identified by stream IDs whose castle ID field is `0`.
Castle status messages use castle IDs `1..21`.
Unknown or future message shapes must be preserved as `unknown` instead of crashing the app.

## Stream ID structure

A stream ID is a 4-byte integer:

- bits `0..4`: castle ID, `1..21`, or `0` for special use/all-castle subscription
- bits `5..7`: block, `0..3`, always `0` for Guild Battle
- bits `8..15`: world group ID, always `0` for Guild Battle
- bits `16..18`: class, `1..3`, always `0` for Guild Battle
- bits `19..31`: world ID

For Guild Battle all-castle subscription, use:

- `castleId = 0`
- `block = 0`
- `worldGroupId = 0`
- `gvgClass = 0`
- `worldId = target world`

Grand Battle fields are kept configurable in `GvgStreamScope`; the stream ID utilities do not hard-code Guild Battle-only values.

## Parser responsibility

Parser responsibility is intentionally narrow:

```txt
binary payload
-> RawRealtimeMessage[]
```

The parser should decode bytes into minimal raw transport messages only.
It should not create UI models, own-guild ViewModels, alert levels, or mutate snapshots.

Raw message types are:

- `RawGuildMessage`
- `RawCastleStatusMessage`
- `RawUnknownRealtimeMessage`

`parseRealtimePayload` exists only as an explicit unimplemented boundary in Step3-B.

## Normalize responsibility

The next layer will convert raw parser output into app-level messages:

```txt
RawRealtimeMessage
-> normalizeRealtimeGvgMessage
-> GvgRealtimeMessage
-> applyGvgRealtimeMessage
-> GvgSnapshot
```

This keeps byte-layout parsing separate from semantic mapping such as:

- guild ID expansion/display policy
- state number to `GvgCastleState`
- timestamp conversion
- status derivation
- unknown message fallback

## Parser does not do

- open WebSocket connections
- subscribe or unsubscribe
- use UI state
- call Guild Battle selectors
- emit notifications
- decide alert levels
- update `GvgSnapshot`

## Next step

Step3-C can implement `normalizeRealtimeGvgMessage` using parser fixtures:

- raw guild message to `guildNameUpdate`
- raw castle status message to `castleUpdate`
- raw unknown message to `unknown`
- guild ID display/comparison consistency with REST normalize

Actual byte parsing can remain a later isolated step.
