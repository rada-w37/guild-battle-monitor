# Discord Webhook Tester

Discord Webhook の `content` / `embeds` / `allowed_mentions` の組み合わせを実機確認するためのローカル専用ツールです。GBM 本体、Firebase Functions、本番ビルドには接続していません。

## 起動手順

```bash
cd tools/discord-webhook-tester
npm.cmd start
```

起動後、ブラウザで `http://127.0.0.1:5177` を開きます。別ポートを使う場合は PowerShell で `$env:PORT='5178'; npm.cmd start` のように指定してください。

## 送信方式

- ブラウザはローカルサーバーの `/api/send` に送信します。
- ローカルサーバーが Discord Webhook URL に POST します。
- Webhook URL は保存しません。
- 送信履歴は保存しません。
- Git 管理対象に Webhook URL や送信履歴を含めません。
- 送信先は `https://discord.com/api/webhooks/{id}/{token}` または `https://discordapp.com/api/webhooks/{id}/{token}` のみ許可しています。

## プリセット

### A. title in content / mention in embed

```json
{
  "content": "通知タイトル",
  "embeds": [
    {
      "description": "@here\n通知本文"
    }
  ],
  "allowed_mentions": {
    "parse": ["everyone"]
  }
}
```

### B. title + body + mention in content

```json
{
  "content": "通知タイトル\n\n通知本文\n\n@here",
  "allowed_mentions": {
    "parse": ["everyone"]
  }
}
```

### C. title + mention in content / body in embed

```json
{
  "content": "通知タイトル\n\n@here",
  "embeds": [
    {
      "description": "通知本文"
    }
  ],
  "allowed_mentions": {
    "parse": ["everyone"]
  }
}
```

### D. mention only in content / title and body in embed

```json
{
  "content": "@here",
  "embeds": [
    {
      "title": "通知タイトル",
      "description": "通知本文"
    }
  ],
  "allowed_mentions": {
    "parse": ["everyone"]
  }
}
```

## 実機確認観点

- Discord 画面上でメンションがリンク表示されるか。
- メンション対象者に通知が飛ぶか。
- メッセージがハイライトされるか。
- スマホ Push 通知の先頭に何が表示されるか。
- `@here` が `content` 内と `embed.description` 内でどう変わるか。
- role mention が `content` 内と `embed.description` 内でどう変わるか。
- user mention が `content` 内と `embed.description` 内でどう変わるか。
- `allowed_mentions: { "parse": [] }` で通知やリンク化が抑止されるか。
- `allowed_mentions` の `users` / `roles` / `everyone` の違いが通知対象に反映されるか。

## 注意

このツールは実際の Discord Webhook にメッセージを送信します。検証用チャンネルと検証用 Webhook を使い、不要なメンション通知が飛ばないように注意してください。
