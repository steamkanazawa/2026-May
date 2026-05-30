# HikamersCraft Status Page

Pterodactyl の指定したサーバーだけを表示し、Minecraft のプレイヤー人数もローカルから確認するステータスページです。

## 必要条件

- Node.js 20 以上
- Pterodactyl Panel の Client API Key (`ptlc_...`)
- このアプリを実行するホストから各 Minecraft サーバーの割り当てポートへ接続できること

## 1. インストール

```bash
unzip hikamers-status-page.zip
cd hikamers-status-page
npm install
cp .env.example .env
```

`.env` を編集して、Client API Key を設定します。

```env
PTERODACTYL_PANEL_URL=https://panel.hikamerscraft.com
PTERODACTYL_API_KEY=ptlc_ここにClient_API_Key
PORT=3000
HOST=127.0.0.1
POLL_INTERVAL_MS=60000
REQUEST_TIMEOUT_MS=5000
```

## 2. 表示するサーバーを設定

`config/servers.json` を編集します。配列の項目を追加すると表示サーバーが増え、削除すると非表示になります。

```json
[
  {
    "id": "survival",
    "name": "Survival Server",
    "pterodactylIdentifier": "abc12345",
    "minecraft": {
      "enabled": true,
      "edition": "java",
      "host": "127.0.0.1",
      "port": 25565
    }
  }
]
```

### `pterodactylIdentifier` の確認方法

Panel で対象サーバーを開いた際の URL が以下のような形式の場合、`abc12345` の部分です。

```text
https://panel.hikamerscraft.com/server/abc12345
```

### Minecraft の接続先

このアプリは同じ自宅サーバー上で動作する前提なので、通常は `host` を `127.0.0.1`、`port` を Pterodactyl の割り当てポートにします。Java 版は `edition: "java"`、統合版は `edition: "bedrock"` にします。

## 3. 起動

```bash
npm start
```

ブラウザで同じサーバーから確認する場合:

```text
http://127.0.0.1:3000
```

LAN 内の別端末から見る場合は `.env` の `HOST=0.0.0.0` に変更し、以下の形式で開きます。

```text
http://自宅サーバーのLAN内IP:3000
```

## 表示情報

- Pterodactyl: コンテナ状態、CPU、メモリ、稼働時間
- Minecraft Ping: プレイヤー人数、最大人数、バージョン、MOTD
- ステータスページ: 直近48回の履歴 (`data/history.json` に保存)

## 注意点

- `.env` は公開しないでください。APIキーが含まれます。
- 外部公開する際は Node.js のポートを直接公開せず、HTTPS のリバースプロキシまたは Cloudflare Tunnel の背後に配置してください。
- Client API Key のユーザーがアクセスできないPterodactylサーバーは表示できません。
