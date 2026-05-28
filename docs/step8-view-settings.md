# Step8-H View Settings Persistence

Step8-H persists monitor screen settings in localStorage so browser reloads do not reset the working view.

## Storage key

The view settings use a dedicated key:

```txt
guild-battle-monitor-view-settings
```

This is separate from the existing alert threshold key:

```txt
guild-battle-monitor-alert-thresholds
```

## Saved values

Saved:

- `world`: user-facing world input, such as `37`
- `selectedGuildId`: selected defense guild ID, or empty string for all castles
- `sortByAlert`: danger sort on/off
- `autoUpdate`: auto update on/off

Not saved here:

- normalized `worldId`
- guild name
- REST snapshot contents
- realtime connection state
- DevTest mode
- alert thresholds, because those already have a dedicated storage helper

## Design choices

`world` is stored instead of `worldId` because the user edits world numbers like `37`; the application still derives `worldId = 1000 + world` only when loading.

`selectedGuildId` is stored instead of guild name because names are display-only and can be missing, duplicated, or updated by realtime messages. If the restored guild ID is not present in the current snapshot candidates, the UI safely falls back to all castles.

JSON parse failures and invalid stored field types fall back to defaults:

- `world`: empty
- `selectedGuildId`: empty
- `sortByAlert`: false
- `autoUpdate`: true

The screen still does not auto-fetch on startup. Restored `world` is only placed in the input; the user starts loading with Enter or `更新`.
