# Step7-A Castle metadata

Step7-A adds minimal Guild Battle castle metadata so the UI can show readable castle names instead of only numeric castle IDs.

## Implemented scope

- `castleId` to castle name lookup
- castle type metadata: temple, castle, church
- Japanese type labels: 神殿, 城, 教会
- safe fallback for unknown castle IDs
- ViewModel fields for display
- castle list UI display update

## Why minimal metadata

The current goal is easier monitoring, not map rendering.

GuildBattleMonitor should help users quickly understand:

- which castles are owned
- which castles are dangerous
- which castle a row refers to

For this step, names and simple type labels are enough. Coordinates, map edges, and declaration rules would add design weight without being needed for the current list-based MVP.

## Metadata boundary

Metadata is owned by the Guild Battle feature layer:

```txt
GvgSnapshot
-> Guild Battle selector
-> castleName / castleTypeLabel in ViewModel
-> UI display
```

The UI does not read metadata objects directly. It only renders ViewModel fields.

## Fallback policy

If metadata is missing, the selector returns:

```txt
拠点 {castleId}
```

The type becomes `unknown` and the type label becomes `不明`. This keeps REST and realtime updates safe even if the API sends an unexpected castle ID.

## Not implemented

- map display
- coordinates
- adjacency
- line drawing
- declaration availability
- Grand Battle metadata
- normalize, parser, or WebSocket changes

## Future candidates

Later steps may add:

- map coordinates
- display order
- neighboring castle relationships
- declaration route rules
- Grand Battle-specific metadata

Those should be added as separate metadata fields only when the UI or rules actually need them.
