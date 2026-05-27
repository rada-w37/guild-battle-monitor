# Step2-A REST Normalize Design

## REST initial state role

`/[world_id]/localgvg/latest` is the initial Guild Battle state source.
It is used before realtime updates arrive, but its raw response must not be passed to UI.

The fixed flow is:

1. REST raw response
2. `normalizeLocalGvgSnapshot`
3. `GvgSnapshot`
4. Guild Battle selectors
5. ViewModel for UI

## Response shape observed

The API returns an envelope:

- `status`: HTTP-like status number
- `timestamp`: Unix seconds for returned data
- `data.world_id`: four digit world ID
- `data.castles`: castle array
- `data.guilds`: guild ID to guild name map

Observed castle fields:

- `CastleId`
- `GuildId`
- `AttackerGuildId`
- `AttackPartyCount`
- `DefensePartyCount`
- `GvgCastleState`
- `UtcFallenTimeStamp`
- `LastWinPartyKnockOutCount`

Only fields needed for the Step1 GvG common model are strongly normalized.
Unknown fields remain allowed on REST response types through index signatures.

## Normalize responsibility

`src/features/gvg` owns normalize into GvG common models.
It does not fetch, subscribe, parse binary frames, or create UI state.

State mapping:

- `0`: `idle`
- `1`: `inBattle`
- `2`: `fallen`
- `3`: `counterattack`
- `4`: `counterattackSuccessful`
- other values: `unknown`

Status mapping:

- `fallen` state becomes `fallen`
- battle/counterattack states or `AttackPartyCount > 0` become `underAttack`
- `idle` becomes `normal`
- unknown state without attack count becomes `unknown`

## REST and WebSocket difference

REST provides a full initial snapshot.
WebSocket will later provide realtime updates for selected streams.
Both must normalize to the same `GvgCastle` and `GvgSnapshot` meanings before reaching selectors.

## Next Step2-B

Step2-B can add the actual REST read layer:

- endpoint URL builder for `/{worldId}/localgvg/latest`
- fetch wrapper with error handling
- runtime handoff from raw JSON to `normalizeLocalGvgSnapshot`
- tests for request boundary using mocks

UI connection should remain separate unless explicitly requested.
