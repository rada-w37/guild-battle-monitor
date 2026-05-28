# Step6-A State display model

Step6-A separates alert level from battle state display.

## Alert level

Alert level means how urgently the user should look at a castle.

Inputs:

- defense count
- attack count
- critical battle states from settings

Labels:

- safe
- warning
- danger
- critical

This logic remains in Guild Battle selectors/settings. Step6-A does not change threshold behavior.

## Battle state label

Battle state label means the game-state interpretation shown in the castle list.

Current display mapping:

- normal REST/WebSocket state: `通常`
- under attack, attack count greater than 0, or `inBattle`: `侵攻中`
- fallen state/status: `占拠`
- `counterattack`: `反撃待ち`
- `counterattackSuccessful`: `反撃中`
- unknown state/status: `不明`

Cooldown is documented in the game rules, but current normalized state does not expose a confirmed cooldown value. The UI should not infer cooldown unless the normalize layer later confirms a reliable state/status.

## ViewModel boundary

The UI receives `statusLabel` and `statusTone` from the Guild Battle selector layer.

The UI does not decide whether a castle is under attack, fallen, or unknown. It only renders the ViewModel.

## Notification decision

No notification event model is added in this step.

Alert escalation may be useful in the future, but notifications are intentionally postponed because the MVP is focused on always-visible monitoring and because external notification channels add integration complexity.

## Not implemented

- push notifications
- Discord, Slack, or LINE integration
- automatic reconnect changes
- map display
- Grand Battle support
