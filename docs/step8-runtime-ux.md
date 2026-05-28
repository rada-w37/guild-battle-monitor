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
