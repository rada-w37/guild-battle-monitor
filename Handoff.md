# Handoff.md

## Current Goal

通知ルールv2の対象ギルド複数選択保存を本番環境へ反映し、保存後の再読込で `targetGuildIds` が維持されることを確認する。

## Current Status

- `targetGuildIds` 保存不具合の原因は、`VITE_ENABLE_NOTIFICATION_RULE_V2` 未設定時にlegacy保存経路へ落ちること。
- 修正コミット作成済み: `d606adc fix(notification-rule): enable v2 storage by default`
- `notificationRuleV2` は未設定時もv2有効。明示的に `VITE_ENABLE_NOTIFICATION_RULE_V2=false` の場合のみlegacy経路。
- ローカル検証は完了。Hosting/Functionsへの今回変更のデプロイは未実施。

## Architecture

- Client entry: `FirebasePhase0App`
- Notification dialog: `NotificationSettingsDialog`
- v2 storage flag: `featureFlags.notificationRuleV2`
- v2 callable client: `notificationSettingsFunctionsRepository`
- v2 callable functions: `getNotificationSettingsV2`, `saveNotificationRuleV2`
- Rule storage: `guildShares/{guildId}/notificationRules/{ruleId}`

## Decisions

- GBM v2の対象ギルドID配列は `targetGuildIds` を正とする。
- `targetGuildIds` はGuild Battleの侵攻ギルドIDフィルタ。
- 全ギルド対象は `targetGuildIds: []`。
- 指定ギルドのみで0件選択は保存不可。
- 候補外の保存済みギルドIDはUI候補へ補完表示し、保存値を消さない。

## Important Files

```text
Handoff.md
.env.example
src/config/featureFlags.ts
src/features/notifications/FirebasePhase0App.tsx
src/features/notifications/FirebasePhase0App.test.tsx
src/features/notifications/NotificationSettingsDialog.tsx
src/features/notifications/notificationRuleV2Draft.ts
src/features/notifications/notificationSettingsFunctionsRepository.ts
functions/src/notificationSettings.ts
functions/src/notificationSettings.test.ts
```

## Remaining Tasks

1. 必要ならFirebase Hostingへデプロイする。
2. 実環境で通知ルール編集画面を開き、指定ギルド複数選択の保存/再読込を確認する。
3. KOO側へ `targetGuildIds` は `attackerGuildId` フィルタとして引き継ぐ。

## Known Issues

- 今回変更はまだHostingへデプロイしていない。
- `npm.cmd run test` 実行時、既存テスト由来のstderr警告は出るがテストは成功する。

## Validation Status

- `npm.cmd run test -- src/features/notifications/FirebasePhase0App.test.tsx`: passed, 51 tests
- `npm.cmd run test`: passed, 370 tests
- `npm.cmd run typecheck`: passed
- `npm.cmd run test:functions`: passed, 42 tests
- `npm.cmd run build`: passed
- `git status --short`: clean before this Handoff update

## Next Session Start

1. `git status --short`
2. `git log -3 --oneline`
3. デプロイ要否を確認する
4. 実環境で `targetGuildIds` 保存/再読込を確認する
