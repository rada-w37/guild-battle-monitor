# Handoff.md

## Current Goal

通知機能本格化・KO監視追加に備え、表示/非表示・操作可否を AppCapabilities に薄く集約する。

## Current Status

- ブランチ: `feature/軽微なリファクタリング`
- 最新コミット: `af20f5c refactor(app): add app capabilities foundation`
- `AppCapabilities` 最小層を追加済み。
- 設定画面まわりの一部条件を capability 経由へ移行済み。
- 将来設計メモを `docs/app-capabilities-roadmap.md` に追加済み。
- 作業ツリーはクリーン。

## Architecture

- `App.tsx` は `VITE_ENABLE_FIREBASE` で Firebase有効版 / GitHub Pages相当版を切替。
- `appMode.tsx` は URL 由来の `owner/admin/guest` と基本 permissions を解決。
- `appCapabilities.ts` は mode / Firebase有無 / persistence有無 / ログイン状態から薄い capability を作る。
- `GuildBattlePlaceholder.tsx` は設定画面とメイン画面の主要 UI を持つ。
- `FirebasePhase0App.tsx` は Auth / Firestore / notification / share / owner profile をラップする。

## Decisions

- GitHub Pages版では Firebase/Auth/Firestore 前提UIを出さない。
- Firebase有効版では owner/admin/guest の既存表示差分を維持。
- Discord Webhook URL は owner のみ表示。
- localStorage設定と Firestore保存は統合しない。
- `canEditViewSettings` と `canPersistViewSettings` は別概念。
- KO監視テーブルは未実装。capability 枠のみ用意。
- 大規模 ViewModel 化はまだしない。

## Important Files

- `src/app/appCapabilities.ts`
- `src/app/appCapabilities.test.ts`
- `src/app/appMode.tsx`
- `src/app/App.tsx`
- `src/features/guildBattle/GuildBattlePlaceholder.tsx`
- `src/features/notifications/FirebasePhase0App.tsx`
- `docs/app-capabilities-roadmap.md`

## Remaining Tasks

1. 必要なら `feature/軽微なリファクタリング` を push / PR 化。
2. `createSettingsViewModel(appCapabilities)` の小規模導入を検討。
3. 通知ルール追加時に notification capability を細分化。
4. KO監視追加時に `koMonitor` capability を具体化。
5. `deploymentTarget` 導入要否を検討。

## Known Issues

- `firebaseEnabled` と `deploymentTarget` はまだ分離されていない。
- `permissionsOverride` はまだ `FirebasePhase0App.tsx` に残っている。
- 設定画面 JSX の全面整理は未実施。

## Validation Status

- `npm.cmd run test`: 成功（37 files / 292 tests）
- `npm.cmd run typecheck`: 成功
- `npm.cmd run build`: 成功
- `git diff --check`: 成功

## Next Session Start

1. `git status -sb`
2. `git log -1 --oneline`
3. `src/app/appCapabilities.ts` と `docs/app-capabilities-roadmap.md` を読む
4. push / PR 化するか、次の小規模 capability 整理へ進むか判断
