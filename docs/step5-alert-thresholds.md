# Step5-E Alert Threshold Settings

## Implemented scope

Step5-E makes defense-count alert thresholds user-configurable.

Implemented:

- minimal expandable alert settings area
- warning / danger / critical defense-count inputs
- localStorage persistence
- settings load on startup
- validation
- reset to default
- selector connection through `GuildBattleAlertThresholds`
- realtime updates reuse the latest thresholds

The UI still does not implement notifications, server-side settings, reconnect changes, maps, or Grand Battle support.

## Threshold policy

Default values:

- warning: defense count less than 30
- danger: defense count less than 15
- critical: defense count less than 10

The selector now uses "less than" for defense-count thresholds.
Attack count greater than 0 and critical castle states still force `critical`.

## Validation

The editable defense thresholds must satisfy:

```txt
warning > danger > critical >= 0
```

Invalid input shows a small UI error and keeps the previous valid thresholds.

## localStorage

The storage key is:

```txt
guild-battle-monitor-alert-thresholds
```

localStorage is enough for this step because the setting is local to the browser and does not need account sync yet.
Broken or invalid stored values fall back to defaults.

## Future direction

Later this can move into a fuller settings panel with:

- clearer descriptions of "less than" boundaries
- per-world or per-guild presets
- import/export of local settings
- optional server sync if accounts are introduced

The selector/settings boundary should stay the same: UI collects threshold values, selectors calculate alert levels.
