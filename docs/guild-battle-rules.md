# Guild Battle rules

This document records the Guild Battle assumptions used by GuildBattleMonitor.

## Schedule

- Strategy phase: 7:45-20:30
- Battle phase: 20:45-21:30
- Guild Battle is not held during Grand Battle periods.
- The castles owned at 21:30 are carried over to the next day.

## Battle flow

- Defenders place parties on owned castles.
- Attackers place invasion parties on declared castles.
- During battle, one party is resolved per second automatically.
- Defense count and attack count decrease as parties lose.
- When defense count reaches 0, the castle is captured.
- After capture, the castle enters a 15-minute cooldown.
- During cooldown, the original defending guild can declare a counterattack.
- If a counterattack has been declared, attack and defense switch after cooldown and battle resumes.

## MVP notification policy

Notifications are outside the MVP scope.

Reasons:

- External notifications can cover the game screen during play.
- Discord, Slack, LINE, and push integrations have different permission and delivery requirements.
- The main purpose of this tool is always-visible monitoring, not notification delivery.
- Avoiding notification features now keeps the MVP small and follows YAGNI.

Alert escalation may become a future notification trigger candidate, but for now the product should prioritize clear on-screen visibility.
