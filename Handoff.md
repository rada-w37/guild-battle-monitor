# Handoff.md

## Current Goal

通知設定v2 UI修正後の実ブラウザ確認とデプロイ要否判断。

## Current Status

- 通知設定v2 UI修正はローカル実装・コミット済み。
- 完了済み: ダークモード下部バー、Grand Battle初期タブ、縦レイアウト、保存成功メッセージ非表示、下部余白、Discordプレビューアイコン、変数挿入先、Undo同期改善。
- 最新コミット: `2aeedb5 fix(notification-rule): step6 refine variable undo sync`
- Hosting/Functionsへの今回変更のデプロイは未実施。

## Architecture

- Client entry: `FirebasePhase0App`
- Notification dialog UI: `NotificationSettingsDialog`
- Dialog styles: `src/app/styles.css`
- v2 rule draft: `notificationRuleV2Draft`
- v2 callable client: `notificationSettingsFunctionsRepository`

## Decisions

- 通知ルールv2の保存形式・Firestore schema・Functions仕様は変更しない。
- `schemaVersion: 2`, `targetGuildIds`, `detailConditions`, `temporarySuspension` は既存仕様維持。
- 変数ボタンは `Discord表示名` / `通知タイトル` / `通知本文` のフォーカス中フィールドだけに挿入する。
- 3フィールド以外にフォーカスがある場合、変数挿入はno-op。
- Undo/Redoはブラウザ標準履歴に寄せ、独自Undoスタックは作らない。

## Important Files

```text
Handoff.md
src/features/notifications/NotificationSettingsDialog.tsx
src/features/notifications/FirebasePhase0App.test.tsx
src/app/styles.css
src/features/notifications/notificationTemplates.ts
```

## Remaining Tasks

1. ログイン済み実ブラウザで通知設定v2画面を手動確認する。
2. Discord表示名/通知タイトル/通知本文で `aaa{拠点名}aaa` のCtrl+Z/Ctrl+Yを確認する。
3. Grand Battle/ダークモード、縦レイアウト、保存/破棄/未保存変更確認を画面確認する。
4. デプロイ要否を決める。

## Known Issues

- 実アプリ画面でのUndo確認は未ログインのため未実施。
- `npm.cmd run test` で既存テスト由来のstderr警告が出るが、テストは成功する。
- 今回のUI修正はまだHostingへデプロイしていない。

## Validation Status

- `npm.cmd run test -- src/features/notifications/FirebasePhase0App.test.tsx`: passed, 53 tests
- `npm.cmd run typecheck`: passed
- `npm.cmd run test`: passed, 373 tests
- `npm.cmd run build`: passed
- Chrome最小DOM検証: input/textareaとも変数挿入後の1回目Ctrl+Zで全消しにならないことを確認
- `git status --short`: clean before this Handoff update

## Next Session Start

1. `git status --short`
2. `git log -5 --oneline`
3. `Handoff.md` のRemaining Tasks順に実ブラウザ確認を始める
