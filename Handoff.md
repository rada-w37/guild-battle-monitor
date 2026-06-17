# Handoff.md

## Next Session Start

1. `git status --short`
2. `git log -6 --oneline`
3. Handoff.md を確認
4. Discord通知 Phase1 の実装Planを作成
5. `notificationRules` / `notificationDestinations` のFunctions設計確認
6. `NotificationSettingsDialog` の構成確認
7. 実装開始

## Validation Status

* `npm.cmd run test`: passed
* `npm.cmd run test:functions`: passed
* `npm.cmd run typecheck`: passed
* `npm.cmd run build:functions`: passed
* Functions deploy済み

  * region: `asia-northeast1`
* Hosting deploy済み
* Firestore Rules deploy済み
* Owner/Admin/Viewer URL 実機確認済み

Latest commits:

* `2999123 fix(functions): set share callable region`
* `77865c5 fix(share-url): step1 move share access to functions`

## Known Issues

* 所属ギルド設定UIが今後の権限モデルと不整合

  * Notion Issue化済み
  * 今回は未対応
* functions依存の audit warning

  * moderate 8 / high 5
  * 未調査
* 既に壊れた旧共有URLは自動復旧しない

## Remaining Tasks

1. Discord通知 Phase1
2. Discord通知 Phase2: KOO連携による通知判定/送信
3. guild owner申請機能
4. site owner承認機能
5. guild member/admin付与機能
6. 所属ギルド設定UI整理
7. URL再発行機能
8. 操作ログ

## Important Files

```text
src/features/notifications/
src/features/guildBattle/GuildBattlePlaceholder.tsx
src/features/notifications/FirebasePhase0App.tsx
src/lib/firebase.ts
src/app/styles.css

functions/src/index.ts
functions/src/guildShare.ts

firestore.rules
firebase.json
docs/step1-share-functions-deploy.md
```

## Decisions

* `guildShares/{guildId}` が共有URL/accessKeyの唯一の正。
* clientは `guildShares/{guildId}` を直接read/writeしない。
* Owner表示/保存、Admin/Viewer URL検証はCallable Functions経由。
* Functions regionは `asia-northeast1`。
* `guildOwnerUid` がguild owner判定の正。
* `profile.guildId` は権限根拠にしない。
* 旧guestはUI上 `viewer` / `Viewer URL` とする。
* `guestAccessKey` は内部互換のため当面維持。
* Discord通知 Phase1では通知送信しない。
* Webhook URLはguild ownerのみ表示/編集可。
* adminは通知ルール編集可、Webhook不可。
* viewer / signed-in user / anonymous は通知設定不可。

## Architecture

共有URL:

```text
guildShares/{guildId}
  guildOwnerUid
  adminAccessKey
  guestAccessKey
  world
  guildName
```

Step1 Functions:

```text
getOwnerGuildShare
saveOwnerGuildShare
verifyGuildShareAccess
```

通知ルール保存先:

```text
guildShares/{guildId}/notificationRules/{ruleId}
```

通知先保存先:

```text
guildShares/{guildId}/notificationDestinations/discord
```

通知Phase1条件:

```text
開始時刻
防御数 ○○以下
侵攻数 ○○以上
```

通知Phase1テンプレート変数:

```text
{拠点名}
{侵攻ギルド}
{防御数}
{侵攻数}
{通知時刻}
{通知ルール名}
```

通知実行方針:

```text
GBM: 通知ルール管理
KOO: 通知判定
Function: Webhook読込/Discord送信
```

## Current Status

Step1 共有URL/accessKey固定化 + Functions移行は完了。

完了済み:

* Functions基盤追加
* `guildOwnerUid` 導入
* `guildShares/{guildId}` client直接read/write禁止
* Owner表示/保存のFunctions移行
* Admin/Viewer URL検証のFunctions移行
* Viewer URL表記対応
* Functions / Hosting / Firestore Rules deploy
* 実機確認

## Current Goal

Discord通知 Phase1 を実装する。

対象:

* 通知設定ダイアログ
* 通知ルールCRUD
* 通知ルール保存/読込
* Discord Webhook保存/読込
* テンプレート変数プレビュー
* 権限制御
