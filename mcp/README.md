# ai-data-flow MCP server

ai-data-flow バックエンドの公開API (`/api`) を **APIキー認証**で叩く MCP サーバ。
Claude（Desktop / Code）から IPLoT 方法論パイプラインを直接操作できる。

## セットアップ

```bash
cd mcp
npm install
```

## APIキーの発行

1. Web版にログインしてトークン(JWT)を取得（ブラウザの localStorage `accessToken`）。
2. キーを発行（平文キーはこのレスポンスでのみ返る）:

```bash
curl -X POST "$API_URL/api/api-keys" \
  -H "Authorization: Bearer <JWT>" \
  -H "Content-Type: application/json" \
  -d '{"name":"mcp","projectId":null}'
# → { "key": "sk_xxxxxxxx...", ... } を控える
```

失効: `DELETE /api/api-keys/:id`、一覧: `GET /api/api-keys`。

## 起動

```bash
AIDATAFLOW_API_URL=http://localhost:5021 AIDATAFLOW_API_KEY=sk_xxxx node index.mjs
```

## Claude Desktop / Claude Code への登録

`claude_desktop_config.json`（または `.mcp.json`）に追加:

```json
{
  "mcpServers": {
    "ai-data-flow": {
      "command": "node",
      "args": ["/Users/kazuyukijimbo/ai-data-flow/mcp/index.mjs"],
      "env": {
        "AIDATAFLOW_API_URL": "http://localhost:5021",
        "AIDATAFLOW_API_KEY": "sk_xxxx"
      }
    }
  }
}
```

## 公開ツール

| ツール | 対応エンドポイント |
|---|---|
| `list_organizations` / `list_projects` / `get_project` | 組織・プロジェクト |
| `list_phases` / `initialize_phases` / `transition_phase` | フェーズ Ph.0–7 |
| `list_flows` / `get_flow` / `create_flow` | 業務フロー(ASIS/TOBE) |
| `list_issue_trees` / `get_issue_tree` / `create_issue_tree` / `add_issue_node` / `set_node_verification` | 課題ツリー(なぜ型/打ち手型) |
| `list_gap_items` / `create_gap_item` / `resolve_gap_item` | GAP(ASIS↔TOBE差分) |
| `list_tables` / `list_roles` | データカタログ・ロール(CRUD表の素材) |

APIキーは発行ユーザーの権限で動作する（バックエンドの `JwtAuthGuard` が `x-api-key` を受理）。
