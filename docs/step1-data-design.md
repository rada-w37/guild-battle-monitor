# Step1 Data Design

## Data flow

GuildBattleMonitorではAPI生データをUIへ直接渡さない。

1. REST `localgvg/latest` または `/gvg` WebSocket の生データを受け取る。
2. normalize層でAPI差異を吸収し、`src/features/gvg` の共通モデルへ変換する。
3. `src/features/guildBattle` のselectorでGuild Battle固有の判定を行う。
4. UIには表示専用のViewModelを渡す。

## Responsibility

- `src/features/gvg`: Guild Battle / Grand Battleで共有するGvG共通モデルを置く。
- `src/features/guildBattle`: GuildBattleMonitor固有の設定、判定、ViewModelを置く。
- `src/features/grandBattle`: 将来追加するGrand Battle固有層。GvG共通モデルを再利用する。
- `src/shared`: featureに依存しない共通部品を置く。

## State and status policy

`GvgCastleState` と `GvgCastleStatus` は、現時点では必要最小限の値だけを型定義している。
未確認のREST/WebSocket値は、将来のnormalize層で `unknown` に寄せる。

## Guild ID policy

guild IDはAPIによって数値、文字列、ゼロ埋めの差が出る可能性がある。
表示用IDはAPI由来の文字列表現を保ち、比較時だけ `normalizeGvgGuildIdForComparison` で比較用IDへ変換する。
表示用IDと比較用IDを混同しない。

## Alert policy

初期しきい値は `DEFAULT_GUILD_BATTLE_ALERT_THRESHOLDS` で管理する。

- `safe`: `defenseCount > 30`
- `warning`: `defenseCount <= 30`
- `danger`: `defenseCount <= 10`
- `critical`: `attackCount > 0` または `state` が `inBattle` / `fallen` / `counterattack`

判定優先度は `critical > danger > warning > safe` とする。
