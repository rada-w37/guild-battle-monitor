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
Step8-C changed the monitor policy so attack count and battle state no longer force `critical`; they are displayed separately from alert severity.

## Step5-F UX clarification

Step5-F does not change alert logic. It only makes the existing threshold rules easier to understand in the settings UI.

The UI now explains that thresholds use a "less than" rule:

- warning 30 means defense count 29 or lower becomes warning
- danger 15 means defense count 14 or lower becomes danger
- critical 10 means defense count 9 or lower becomes critical

The settings panel also shows the current boundary labels directly:

```txt
warning: less than 30
danger: less than 15
critical: less than 10
```

Critical remains the highest-priority alert. If a castle is under attack, or its state is one of the critical battle states, it is shown as critical regardless of defense count.

This explanation was added because "30" can otherwise be misunderstood as "30 or lower". Keeping the wording close to the actual selector rule reduces accidental over-alerting or under-alerting when users tune thresholds.

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
