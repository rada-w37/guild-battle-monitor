# AppCapabilities Roadmap

## 目的

通知機能の本格化やKO監視機能の追加に備えて、表示/非表示、操作可否、保存可否の条件を画面ごとのJSXに散らしすぎないようにする。

現時点では大規模な設計変更は行わず、まず `AppCapabilities` として条件に名前を付ける最小整理に留める。

## AppCapabilities が必要な理由

現在の表示条件は、主に以下へ分散している。

- URL由来の `appMode`
- Firebase有効/無効
- ログイン状態
- Firestore persistence の有無
- GitHub Pages版とFirebase Hosting版の差分
- owner/admin/guest/未ログインowner の差分

設定画面だけを見ると `SettingsCapabilities` でも足りるように見えるが、今後はメイン画面側にも表示条件が増える見込みがある。

たとえばKO監視テーブルは、Firebase Hosting版のみ表示し、GitHub Pages版では非表示にしたい可能性がある。この条件は設定画面専用ではなく、アプリ全体の capability として扱う方が自然。

## 分けて考える概念

### firebaseEnabled

Firebase機能が使えるかどうか。

例:

- Auth が使える
- Firestore に保存できる
- 通知設定を読込/保存できる

### deploymentTarget

どこに公開されているか。

例:

- GitHub Pages
- Firebase Hosting

`firebaseEnabled` と `deploymentTarget` は似ているが同じではない。将来的には Firebase SDK を使えるかと、どのURL/Hosting上で動いているかを別々に判断できるようにする。

### appMode

URLや共有URLから解決される利用モード。

例:

- owner
- admin
- guest

### authState

ログイン状態。

例:

- ログイン済み owner
- 未ログイン owner
- Auth unavailable

### persistence

保存先の種類。

例:

- localStorage
- Firestore
- 保存なし

localStorage と Firestore は責務が違うため、repository を無理に統合しない。

## 最終イメージ

アプリ全体の条件を `AppCapabilities` に集約し、各画面ではそこから画面用 ViewModel を作る。

例:

```ts
const appCapabilities = createAppCapabilities(context);
const settingsViewModel = createSettingsViewModel(appCapabilities);
const mainViewModel = createMainViewModel(appCapabilities);
```

`AppCapabilities` はアプリ全体の可能/不可を表し、`SettingsViewModel` や `MainViewModel` は各画面の表示単位へ変換する。

## 通知機能で増えそうな capability

- 通知ON/OFF編集可否
- Discord Webhook URL表示可否
- Discord Webhook URL編集可否
- 通知ルール表示可否
- 通知ルール編集可否
- 通知送信先の追加/削除可否

Webhook URL は送信先そのものなので owner 管理に寄せる。admin は通知ON/OFFや通知ルール調整だけ可能にする余地がある。

## KO監視機能で増えそうな capability

- KO監視テーブル表示可否
- KOデータ更新可否
- KO監視アプリ連携可否
- KO監視設定表示可否
- KO監視設定編集可否

KO監視テーブル自体は今回実装しない。将来的に `appCapabilities.koMonitor.visible` のような枠で扱えるようにする。

## 今回やること

- `AppCapabilities` の最小型を追加する
- 既存挙動を変えず、設定画面まわりの一部条件に名前を付ける
- GitHub Pages版でFirebase/Firestore前提の設定を表示しない条件を明確にする
- KO監視テーブル用の枠だけ用意する

## 今回やらないこと

- 全画面の ViewModel 化
- Auth / appMode / Firebase wrapper の全面再設計
- localStorage と Firestore の repository 統合
- 通知・KO監視を先回りした巨大な汎用設定フレームワーク化
- 設定画面の大規模なコンポーネント分割
- GuildBattlePlaceholder 全体の state 分割

## 後続課題

1. `deploymentTarget` を明示的に導入するか検討する。
2. `createSettingsViewModel(appCapabilities)` を追加し、設定画面の表示順と表示条件を寄せる。
3. `createMainViewModel(appCapabilities)` を追加し、メイン画面側の表示条件を寄せる。
4. 通知ルール追加時に notification capability を細分化する。
5. KO監視機能追加時に `koMonitor` capability を具体化する。
