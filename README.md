# Guild Battle Monitor

A monitoring and visualization tool for guild battles and grand battles in
Memento Mori, a mobile RPG developed by Bank of Innovation.

This project helps guild members and players better understand battle
situations, improve coordination, and reduce manual monitoring effort during
guild events.

## What is this?

Guild Battle Monitor is a community tool designed to support battle monitoring
and situational awareness in Memento Mori guild battles and grand battles.

The goal of this project is to make battle information easier to understand and
share, helping players and guild members coordinate more effectively during
competitive events.

This project is publicly shared and actively maintained as a solo-developed
tool, with improvements driven by practical usage and player feedback.

## Features

Current features include:

- Guild battle monitoring
- Grand battle monitoring
- Castle and point status visualization
- Battle state visualization
- Information support for guild coordination

> **Note:** Features are under continuous improvement and may change over time.

## Why this exists

Guild battles often require quick situational awareness and communication
between members.

Without external support tools, players may need to manually track battle
progress, monitor multiple locations, or repeatedly share status updates.

This project aims to:

- Improve battle visibility
- Reduce manual monitoring effort
- Support guild coordination
- Make battle information easier to understand for guild members and players
  during Memento Mori battle events

## Tech Stack

Current technology stack:

- React
- TypeScript
- Vite
- GitHub Pages

Additional technologies may be introduced as the project evolves.

## Development Status

This is an actively maintained solo-developed project.

Development is iterative and driven by practical usage, feature improvements,
and player feedback.

The project is continuously evolving.

## Roadmap

Planned or under consideration:

- Discord notification support
- Improved monitoring features
- UI/UX improvements
- Additional visualization support

Roadmap items may change based on user needs and project direction.

## Disclaimer

This is an unofficial community project and is not affiliated with Memento Mori
or Bank of Innovation.

All related trademarks, copyrights, and game assets belong to their respective
owners.
# Firebase Phase0

GitHub Pages版では `VITE_ENABLE_FIREBASE=false` を使用し、Firebase初期化・Auth購読・Firestoreアクセスを無効化します。

Firebase Hosting版では `.env.example` を参考に `VITE_ENABLE_FIREBASE=true` とFirebase configを設定してください。Firebase configが不足している場合もBattle Monitor本体は動作し、ログイン・通知設定のみ利用不可になります。

Phase0ではGoogleログインと `notificationDestinations/default` の読込・保存のみを提供します。通知送信と `notificationRules` のUI・保存処理は対象外です。
