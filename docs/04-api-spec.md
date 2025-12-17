# API設計書

## 1. 概要

- **ベースURL**: `http://localhost:3001/api`
- **認証**: Bearer Token (JWT)
- **形式**: JSON

## 2. 認証 API

### POST /auth/register
ユーザー登録

**リクエスト**
```json
{
  "email": "user@example.com",
  "password": "password123",
  "name": "山田 太郎"
}
```

**レスポンス** `201 Created`
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "山田 太郎"
  }
}
```

### POST /auth/login
ログイン

**リクエスト**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**レスポンス** `200 OK`
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "山田 太郎",
    "organizations": [
      { "id": "uuid", "name": "Acme Inc", "role": "OWNER" }
    ]
  }
}
```

### GET /auth/me
現在のユーザー情報取得

**ヘッダー**: `Authorization: Bearer {token}`

**レスポンス** `200 OK`
```json
{
  "id": "uuid",
  "email": "user@example.com",
  "name": "山田 太郎",
  "organizations": [...]
}
```

## 3. 組織 API

### GET /organizations
ユーザーの組織一覧

**レスポンス**
```json
[
  {
    "id": "uuid",
    "name": "Acme Inc",
    "slug": "acme-inc",
    "description": "テクノロジー企業",
    "_count": { "projects": 3, "members": 5 }
  }
]
```

### POST /organizations
組織作成

**リクエスト**
```json
{
  "name": "Acme Inc",
  "slug": "acme-inc",
  "description": "テクノロジー企業"
}
```

### GET /organizations/:id
組織詳細

### PUT /organizations/:id
組織更新

### DELETE /organizations/:id
組織削除

## 4. プロジェクト API

### GET /projects?organizationId={orgId}
プロジェクト一覧

### POST /projects?organizationId={orgId}
プロジェクト作成

**リクエスト**
```json
{
  "name": "ECサイト",
  "slug": "ec-site",
  "description": "オンラインショップ"
}
```

### GET /projects/:id
プロジェクト詳細

### PUT /projects/:id
プロジェクト更新

### DELETE /projects/:id
プロジェクト削除

## 5. ロール API

### GET /roles?projectId={projectId}
ロール一覧

### POST /roles?projectId={projectId}
ロール作成

**リクエスト**
```json
{
  "name": "顧客",
  "type": "HUMAN",
  "description": "エンドユーザー",
  "color": "#3B82F6"
}
```

### GET /roles/:id
ロール詳細

### PUT /roles/:id
ロール更新

### DELETE /roles/:id
ロール削除

## 6. テーブル API

### GET /tables?projectId={projectId}
テーブル一覧

**レスポンス**
```json
[
  {
    "id": "uuid",
    "name": "users",
    "displayName": "ユーザー",
    "description": "ユーザーアカウント情報",
    "tags": ["master", "auth"],
    "_count": { "columns": 8 }
  }
]
```

### POST /tables?projectId={projectId}
テーブル作成

**リクエスト**
```json
{
  "name": "users",
  "displayName": "ユーザー",
  "description": "ユーザーアカウント情報",
  "tags": ["master", "auth"]
}
```

### GET /tables/:id
テーブル詳細（カラム含む）

### PUT /tables/:id
テーブル更新

### DELETE /tables/:id
テーブル削除

## 7. カラム API

### GET /columns?tableId={tableId}
カラム一覧

### POST /columns?tableId={tableId}
カラム作成

**リクエスト**
```json
{
  "name": "email",
  "displayName": "メールアドレス",
  "dataType": "STRING",
  "description": "ログイン用メールアドレス",
  "isPrimaryKey": false,
  "isForeignKey": false,
  "isNullable": false,
  "isUnique": true
}
```

### GET /columns/:id
カラム詳細

### PUT /columns/:id
カラム更新

### DELETE /columns/:id
カラム削除

## 8. 業務フロー API

### GET /flows?projectId={projectId}
フロー一覧

### POST /flows?projectId={projectId}
フロー作成

**リクエスト**
```json
{
  "name": "注文処理フロー",
  "description": "注文から発送までの処理"
}
```

### GET /flows/:id
フロー詳細（ノード・エッジ含む）

**レスポンス**
```json
{
  "id": "uuid",
  "name": "注文処理フロー",
  "version": 1,
  "nodes": [
    {
      "id": "uuid",
      "type": "START",
      "label": "開始",
      "positionX": 100,
      "positionY": 50,
      "role": { "id": "uuid", "name": "顧客" }
    }
  ],
  "edges": [
    {
      "id": "uuid",
      "sourceNodeId": "uuid",
      "targetNodeId": "uuid",
      "label": "Yes"
    }
  ]
}
```

### PUT /flows/:id
フロー更新

### DELETE /flows/:id
フロー削除

## 9. フローノード API

### GET /flow-nodes?flowId={flowId}
ノード一覧

### POST /flow-nodes?flowId={flowId}
ノード作成

**リクエスト**
```json
{
  "type": "PROCESS",
  "label": "注文確認",
  "description": "注文内容を確認",
  "positionX": 200,
  "positionY": 150,
  "roleId": "uuid"
}
```

### PUT /flow-nodes/:id
ノード更新

### DELETE /flow-nodes/:id
ノード削除

## 10. フローエッジ API

### GET /flow-edges?flowId={flowId}
エッジ一覧

### POST /flow-edges?flowId={flowId}
エッジ作成

**リクエスト**
```json
{
  "sourceNodeId": "uuid",
  "targetNodeId": "uuid",
  "label": "Yes",
  "condition": "amount > 10000"
}
```

### PUT /flow-edges/:id
エッジ更新

### DELETE /flow-edges/:id
エッジ削除

## 11. CRUDマッピング API

### GET /crud-mappings?columnId={columnId}
カラムのCRUDマッピング一覧

### POST /crud-mappings?columnId={columnId}
CRUDマッピング作成

**リクエスト**
```json
{
  "operation": "CREATE",
  "roleId": "uuid",
  "flowNodeId": "uuid",
  "condition": "新規登録時",
  "description": "ユーザーがメールアドレスを入力"
}
```

### PUT /crud-mappings/:id
CRUDマッピング更新

### DELETE /crud-mappings/:id
CRUDマッピング削除

## 12. エクスポート API

### GET /export/flow/:flowId/mermaid
フローをmermaid形式でエクスポート

**レスポンス**
```json
{
  "mermaid": "flowchart TD\n    subgraph Customer [顧客]\n        start((開始))\n    end\n    ..."
}
```

### GET /export/project/:projectId/mermaid
プロジェクト全体をmermaid形式でエクスポート

**レスポンス**
```json
{
  "er": "erDiagram\n    users ||--o{ orders : places\n    ...",
  "flows": [
    { "name": "注文処理フロー", "diagram": "flowchart TD..." }
  ]
}
```

### GET /export/project/:projectId/ai
AIエージェント向けエクスポート

**レスポンス**
```json
{
  "project": {
    "name": "ECサイト",
    "description": "オンラインショップ"
  },
  "roles": [
    { "name": "顧客", "type": "HUMAN", "responsibilities": ["商品閲覧", "注文"] }
  ],
  "dataModel": {
    "erDiagram": "erDiagram...",
    "tables": [
      {
        "name": "users",
        "columns": [
          {
            "name": "email",
            "type": "STRING",
            "crudOperations": [
              { "operation": "CREATE", "role": "顧客", "flowNode": "新規登録" }
            ]
          }
        ]
      }
    ]
  },
  "businessFlows": [
    { "name": "注文処理フロー", "mermaidDiagram": "flowchart TD..." }
  ]
}
```

## 13. エラーレスポンス

### 400 Bad Request
```json
{
  "statusCode": 400,
  "message": ["email must be an email"],
  "error": "Bad Request"
}
```

### 401 Unauthorized
```json
{
  "statusCode": 401,
  "message": "Unauthorized"
}
```

### 403 Forbidden
```json
{
  "statusCode": 403,
  "message": "Access denied"
}
```

### 404 Not Found
```json
{
  "statusCode": 404,
  "message": "Resource not found"
}
```

### 500 Internal Server Error
```json
{
  "statusCode": 500,
  "message": "Internal server error"
}
```

