# Handoff.md

## Current Goal

KOO定刻起動など本来機能へ戻れる状態にする。Step7 composition化は必要時まで延期可能。

## Current Status

- Branch: `feature/リファクタリング`
- Latest commit: `9ac13bd refactor(ko-monitor): step5 extract load state hook`
- Step1〜6完了: appMode/capability安定化、Firebase副作用整理、battle detection分離、GrandBattle自動解決分離、KO monitor分離、realtime分離。
- `GuildBattlePlaceholder.tsx` は2266行。副作用の中核はhook/serviceへ移動済みだが、画面shellとフォーム/state同期は残っている。
- 作業ツリーはクリーン。

## Architecture

- `AppModeProvider` / `appMode.tsx`: owner/admin/guest route解決。
- `appCapabilities.ts`: mode / Firebase / permissions由来のcapability生成。
- `FirebasePhase0App.tsx`: Auth、owner profile、share URL、public sharedGuild、notification destinationを扱う。
- `GuildBattlePlaceholder.tsx`: GuildBattle/GrandBattle画面shell、設定UI、手動更新、hook接続。
- `useBattleDetection.ts`: battle detection REST取得と判定。
- `grandBattleAutoResolution.ts`: Firebase版GrandBattle自動解決。
- `useGuildBattleRealtime.ts` / `useGrandBattleRealtime.ts`: realtime start/stop。
- `useKoMonitorLoadState.ts`: KO monitor取得/購読state。

## Decisions

- effect依存はprimitive中心にする。
- repository / callback / options は必要に応じてref/useMemo/useCallbackで安定化する。
- 同値state更新は抑止する。
- エラー時は可能な範囲で前回表示データを維持する。
- realtime start/stopはidempotentにする。
- KO購読は明示subscription keyで管理する。
- UI仕様、Firestore schema、KO推定ロジックは変更しない。
- Step7 composition化は緊急ではない。

## Important Files

- `src/features/guildBattle/GuildBattlePlaceholder.tsx`
- `src/features/guildBattle/useBattleDetection.ts`
- `src/features/guildBattle/grandBattleAutoResolution.ts`
- `src/features/guildBattle/useGuildBattleRealtime.ts`
- `src/features/grandBattle/useGrandBattleRealtime.ts`
- `src/features/koMonitor/useKoMonitorLoadState.ts`
- `src/features/notifications/FirebasePhase0App.tsx`
- `src/app/appCapabilities.ts`
- `src/app/appMode.tsx`

## Remaining Tasks

1. KOO定刻起動など本来機能へ戻る。
2. 必要になった時点でStep7 composition化を実施する。
3. Step7を行う場合は、GuildBattle panel、GrandBattle panel、Settings dialog、owned guild draft、GrandBattle manual sourceを小分けに抽出する。

## Known Issues

- `GuildBattlePlaceholder.tsx` はまだ大きく、UI部品と一部I/O関数が同居している。
- 既存テストでReact `act(...)` warningが一部残っている。
- Hosting本番でのadmin/owner/guest実ブラウザ確認は未実施。

## Validation Status

- Step5完了時: `npm.cmd run test` 成功、41 files / 326 tests passed。
- Step5完了時: `npm.cmd run typecheck` 成功。
- Step6完了時: `npm.cmd run test` 成功、40 files / 322 tests passed。
- Step6完了時: `npm.cmd run typecheck` 成功。
- 最新Handoff更新時はテスト未実行、`git status --short` は更新前クリーン。

## Next Session Start

1. `git status --short`
2. `git log -6 --oneline`
3. KOO定刻起動タスクの対象ファイルを確認する。
4. `GuildBattlePlaceholder.tsx` を触る作業なら、先にStep7 composition化の要否を再判断する。
