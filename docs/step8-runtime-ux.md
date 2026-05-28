# Step8-A Runtime UX

Step8-A improves display density and readability for live Guild Battle monitoring.

## UX premise

During 20:45-21:30, the user may keep the game on one side and GuildBattleMonitor on the other, or use the game on PC while checking this tool on a phone.

The UI should prioritize noticing dangerous castles over showing every technical field equally.

## Information priority

High priority:

- castle name
- alert level
- battle state
- defense count
- attack count

Medium priority:

- owner guild
- attacker guild

Low priority:

- guild IDs
- captured timestamp
- technical details

Step8-A keeps low-priority data available, but displays it smaller inside the row instead of giving it full table columns.

## List design

The castle list now uses a compact monitoring-list layout:

- fewer columns than the previous wide table
- castle ID and type are shown as supporting text under the castle name
- guild IDs are shown as supporting text under guild names
- defense and attack counts are visually stronger
- alert level is also reflected on the row class

The default order remains castle ID order. Danger order is still opt-in only.

## Dangerous castle visibility

Dangerous rows use calm visual emphasis:

- left border accent
- subtle row background
- alert badge

No blinking, animation, or aggressive red-only treatment is used.

## Mobile position

Mobile is a secondary monitoring surface.

On narrow screens the list switches to compact two-column row cards, hides the header, and removes the timestamp. This avoids a wide horizontal table while keeping alert, state, defense count, and attack count readable.

## Not changed

- alert threshold logic
- realtime behavior
- reconnect behavior
- notification behavior
- map display
- autocomplete
- Grand Battle support

## Step8-C cleanup

Step8-C moves the UI closer to an operations monitor after real-device review.

Changes:

- Removed the `GvG common foundation` eyebrow.
- Replaced `worldId` input with user-facing `world`.
- `world` is converted internally with `worldId = 1000 + world`.
- The default world input is empty.
- Step8-C initially tried auto-load after world entry, but Step8-D removed it after iPhone testing.
- The old initial-load button was replaced with a smaller `更新` button for manual refresh.
- Removed the direct own guild ID input; guild selection is done through the candidate select.
- Changed danger sorting from a select to a checkbox.
- Removed the normal snapshot result card from the main monitor area.
- Kept worldId, castle count, guild count, and capturedAt under DEV-only details.
- Removed visible guild IDs from normal owner/attacker columns.
- Removed castle ID and castle type from the normal castle column.
- Shows owner guild only when displaying all castles.
- Hides owner guild when a specific guild is selected.
- Shows row update time only in DEV.

Alert and battle state are intentionally separated:

- Alert level is based on defense count thresholds.
- Being under attack does not by itself raise alert level.
- Under-attack state remains visible as battle state.

Mobile is treated as a compact monitoring surface. The narrow layout keeps the row close to:

```txt
ブラッセル  防0  攻0
```

and hides lower-priority guild and timestamp details.

## Step8-D iPhone follow-up

Step8-D applies the real-device iPhone review fixes without changing WebSocket, parser, normalize, or merge responsibilities.

Changes:

- Removed world-input auto fetch. Typing `37` only edits the field; the `更新` button loads `worldId = 1037`.
- Moved guild selection directly above the monitoring list so filtering is close to the rows it affects.
- Removed the alert summary panel from the normal view.
- Removed alert label text and battle-state label text from each row. Row color and left border carry alert severity, while battle state stays out of the compact operational row.
- Changed visible attack wording from `侵` to `攻`.
- Added compact KO display for attack-side and defense-side KO values.
- Changed user-facing realtime wording to `自動更新`.
- Made auto update a single toggle button: `自動更新 ON` / `自動更新 OFF`.
- Kept connection state as a small setting-area hint and removed the separate realtime block.
- Tightened world and threshold inputs to reduce vertical space.
- Adjusted mobile rows so `防 656` and `攻 123` stay on one line with `white-space: nowrap` and fixed minimum count widths.

The auto update default remains ON. If the user turns it OFF before pressing `更新`, REST loading still works but WebSocket monitoring is not started. If it is ON when the snapshot loads, the realtime runtime starts after the REST snapshot is available.

## Step8-E final UI pass

Step8-E moves settings out of the monitoring surface so the castle list stays dominant on PC and iPhone.

Changes:

- Removed the world input placeholder. The field is now visually empty until the user enters a world number.
- Moved alert thresholds, danger sorting, and auto update into a settings dialog opened from the gear-style button in the header.
- Kept `自動更新` as a single toggle button. Inside the dialog it displays only `ON` / `OFF` because the section label already provides context.
- Renamed the guild selector label to `防衛ギルド`.
- Removed display-mode explanation messages above the list.
- Kept alert and battle-state text out of the normal rows. Severity remains visible through row background and left border only.
- Fixed the count columns so `防 0`, `防 40`, `防 656`, `攻 39`, and `50 KO` keep stable horizontal positions.
- Step8-E initially showed KO only when the value was 10 or higher; Step8-F changed this to always-on `KO n` display.
- The current data model exposes `lastWinPartyKnockOutCount`; Step8-F displays that compactly as `KO n` and keeps future attack/defense-specific KO naming open until the realtime model is clarified.
- Castles without an attacker guild and without attack parties are treated as `safe` even if defense count is below thresholds. They are not urgent targets without a declaration.
- Owner-based filtering remains tied to the latest `GvgSnapshot`, so a castle captured by the selected defense guild appears after realtime ownership updates.

DevTest mode is intentionally not fixed in this step. The UI surface is still settling, so TestMode behavior will be handled separately after the monitor layout is stable.

## Step8-F final micro adjustments

Step8-F focuses on small PC/iPhone interaction and readability fixes.

Changes:

- World input now submits with Enter, including iPhone keyboard submit/Go behavior, while keeping the `更新` button.
- The empty world helper sentence was removed because the input and button already explain the action.
- Defense, attack, and KO are fixed monitoring columns with tabular numbers. This keeps `防 42`, `防 719`, `攻 0`, and `KO 0` visually stable.
- KO is always displayed as `KO n`. It no longer appears/disappears based on threshold because stable scan positions are more important during live monitoring.
- KO tone remains compact: blue for available defense-side KO data, red reserved for future attack-side KO data, and neutral for zero/unknown.
- The settings dialog no longer repeats connection text such as `自動更新中`; the ON/OFF button is the source of truth there.
- A small connection indicator was added near `拠点監視`. It uses CSS circles rather than emoji: green connected, yellow connecting/reconnecting, red disconnected, gray auto-update off.
- Hover/title text names the communication state, and clicking the indicator opens the settings dialog. This keeps the settings route unified.
