# Step5-A Alert UI and Castle List UX

## Implemented scope

Step5-A improves the REST snapshot list display without changing WebSocket, parser, normalize, or merge logic.

Implemented:

- show all castles when own guild ID is empty
- show all castles when the entered guild ID has no owned defense castles
- show owned castles only when the entered guild ID has matches
- show display-mode guidance
- show alert labels in Japanese
- show summary counts by alert level
- keep initial order stable by castle ID
- allow optional alert-priority sorting

## All-castle fallback

The UI no longer hides the list when own guild ID is empty.

Display modes:

- own guild unspecified: all castles
- owned castles found: owned castles only
- owned castles not found: all castles

The display decision is made in Guild Battle selectors, not inside the table rendering logic.

## Sort order

The default sort is castle ID order because it keeps positions stable while realtime updates arrive.

Alert-priority sort is available as an explicit option.
It can move rows during realtime updates, so it is not the default.

## Alert labels

Current labels:

- `safe`: 安全
- `warning`: 注意
- `danger`: 危険
- `critical`: 最優先 / 侵攻中

The UI uses both text and CSS classes so the state is not color-only.
The alert calculation itself remains in selector/settings code.

## Future guild selection UI

Later, own guild selection should move away from raw ID-only input.

Planned direction:

- build candidate guilds from `GvgSnapshot.guildNames` and castle `ownerGuildId`
- show guilds that currently own defense castles
- provide a guild-name combobox
- filter candidates by prefix while typing
- store the selected value internally as `guildId`
- never mix display names, display IDs, and normalized comparison IDs

## Future threshold settings

Later, add a small settings window for alert thresholds.

Initial threshold proposal:

- warning: defense count less than 30
- danger: defense count less than 15
- critical: defense count less than 10

The current selector uses `<=` thresholds.
When user-facing settings are added, the UI wording and implementation must agree on whether the boundary means "less than" or "less than or equal".

Thresholds should remain configurable because preferred defense-count sensitivity varies by play style.
