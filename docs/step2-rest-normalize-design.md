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

## Step2-B REST boundary

The REST boundary is split into two responsibilities:

- API client: builds `/{worldId}/localgvg/latest`, calls an injectable fetcher, validates HTTP/API envelope failures, and returns `LocalGvgApiResponse`.
- Application service: calls the API client and immediately passes the raw response to `normalizeLocalGvgSnapshot`, returning only `GvgSnapshot`.

UI must not call `fetch` directly because raw REST shapes are API-specific and may change.
Keeping fetch behind the API client prevents UI from depending on `CastleId`, `GuildId`, or envelope fields.

Step2-B still does not connect the result to React state or rendering.
The minimal `AsyncLoadState<T>` type exists only so the next UI step can represent idle/loading/success/error without introducing a state management library.

## Next UI connection step

The next step can call `loadLocalGvgSnapshot` from a small application boundary, store `AsyncLoadState<GvgSnapshot>` in local React state, then pass the normalized snapshot to Guild Battle selectors.
REST response objects should remain outside UI components.

## Step2-C minimal UI connection

The placeholder screen now accepts a `worldId`, calls `loadLocalGvgSnapshot`, and stores only `AsyncLoadState<GvgSnapshot>` in local React state.
It renders idle, loading, error, and success states without exposing REST response fields to UI.

The success view is intentionally limited to snapshot overview data:

- world ID
- castle count
- guild count
- captured timestamp
- a simple normalized castle list

Still not implemented:

- WebSocket updates
- binary parsing
- auto refresh
- alert/monitoring UI
- map display
- routing

The next step can pass the normalized `GvgSnapshot` through Guild Battle selectors to create owner-focused ViewModels.
