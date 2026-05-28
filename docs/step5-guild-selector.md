# Step5-B Guild Selector

## Implemented scope

Step5-B adds a minimal guild selector based on the current `GvgSnapshot`.

Implemented:

- guild candidate generation in Guild Battle selectors
- candidates limited to guilds that currently own defense castles
- duplicate owner guilds merged into one candidate
- `ownedCastleCount` aggregation
- guild-name fallback when `guildNames` has no entry
- minimal `<select>` UI
- internal selected value stored as `guildId`
- existing direct guild ID input kept for now
- all-castle fallback preserved
- candidate list updates when realtime snapshot updates

Autocomplete, prefix filtering, and custom combobox behavior are intentionally not implemented.

## Candidate generation

`createGuildBattleGuildCandidates(snapshot)` reads:

- `snapshot.castles[].ownerGuildId`
- `snapshot.guildNames`

It ignores castles without an owner guild ID.
The same guild ID is merged and counted once with `ownedCastleCount`.

Candidate sort:

1. `ownedCastleCount` descending
2. `guildName` ascending

When a name is missing, the UI-facing fallback is `Guild {guildId}`.

## Select first

A native select is enough for this step.
It gives a stable, testable path to move away from raw guild ID input without introducing combobox complexity or a new library.

The first option is `全拠点表示`.
Its value is an empty string, so it preserves the existing all-castle fallback.

## Why store guildId

The selected value is always the `guildId`.
Guild names are display-only and may be missing, duplicated, or updated by realtime messages.

This keeps display names, display IDs, and normalized comparison IDs separate.

## Future autocomplete

Later, replace the native select with an autocomplete/combobox:

- show guild names and owned castle counts
- allow prefix filtering
- keep the selected internal value as `guildId`
- keep direct ID entry only as an advanced fallback if needed

## Not implemented

- autocomplete
- prefix filtering
- custom combobox
- alert threshold UI
- reconnect behavior
- map display
- Grand Battle support
