# DataFlow

データカタログと業務フローを紐づける統合プラットフォーム

## 概要

DataFlowは、システムの全体像をAIと人間の両方が即座に理解できるようにするためのツールです。

### 主な機能

- **データカタログ**: テーブル・カラムのメタデータを一元管理
- **業務フローエディタ**: 直感的なUIで業務プロセスを可視化
- **CRUDマッピング**: 各カラムに対するCRUD操作とロールを紐づけ
- **mermaidエクスポート**: AIエージェント向けに構造化されたコンテキストを出力

### ユースケース

- **エンジニア**: AIエージェントにシステム全体像を渡して開発支援
- **マーケター**: 自然言語でSQLクエリを生成
- **PM/BA**: 業務フローの整理と顧客とのすり合わせ
- **AIエージェント**: 構造化されたシステム情報へのアクセス

## 技術スタック

- **フロントエンド**: Next.js 14, React Flow, Tailwind CSS, shadcn/ui
- **バックエンド**: NestJS, Prisma, PostgreSQL
- **インフラ**: Docker, Docker Compose

## 開発環境のセットアップ

### 前提条件

- Node.js 18以上
- pnpm 8以上
- Docker & Docker Compose

### 1. リポジトリのクローン

```bash
git clone <repository-url>
cd ai_data_flow
```

### 2. 依存関係のインストール

```bash
pnpm install
```

### 3. 環境変数の設定

```bash
# バックエンド
cp backend/.env.example backend/.env
```

### 4. データベースの起動

```bash
# PostgreSQLをDockerで起動
pnpm docker:up
```

### 5. データベースのマイグレーション

```bash
# Prismaマイグレーション実行
pnpm db:migrate
```

### 6. 開発サーバーの起動

```bash
# フロントエンドとバックエンドを同時起動
pnpm dev
```

- フロントエンド: http://localhost:3003
- バックエンド: http://localhost:5021
- API ドキュメント: http://localhost:5021/api/docs

### 7. シードデータの投入（任意）

```bash
pnpm db:seed
```

## 🔐 ログイン情報（開発用）

シードデータを投入すると、以下のアカウントでログインできます。

| ロール | メールアドレス | パスワード |
|--------|---------------|-----------|
| **管理者** | `admin@example.com` | `password123` |
| 開発者 | `dev@example.com` | `password123` |

> ⚠️ 本番環境では必ず別のアカウントを作成してください。

### シードデータに含まれるもの

| カテゴリ | 内容 |
|---------|------|
| 組織 | デモ株式会社 (`demo-company`) |
| プロジェクト | ECサイト (`ec-site`) |
| ロール | 顧客、管理者、決済システム、在庫管理システム |
| テーブル | users, orders, products（カラム定義付き） |
| 業務フロー | 注文処理フロー（9ノード、8エッジ） |

## プロジェクト構成

```
ai_data_flow/
├── docs/                    # 設計書
│   ├── 01-requirements.md   # 要件定義書
│   ├── 02-architecture.md   # アーキテクチャ設計書
│   ├── 03-data-model.md     # データモデル設計書
│   ├── 04-api-spec.md       # API設計書
│   ├── 05-screen-design.md  # 画面設計書
│   └── 06-business-flow.md  # 業務フロー図
│
├── frontend/                # Next.js フロントエンド
├── backend/                 # NestJS バックエンド
├── shared/                  # 共有型定義
│
├── package.json             # ルートpackage.json
└── pnpm-workspace.yaml      # pnpmワークスペース設定
```

## 主要なスクリプト

```bash
# 開発サーバー起動
pnpm dev              # 全て起動
pnpm dev:frontend     # フロントエンドのみ
pnpm dev:backend      # バックエンドのみ

# ビルド
pnpm build            # 全てビルド
pnpm build:frontend   # フロントエンドのみ
pnpm build:backend    # バックエンドのみ

# Docker
pnpm docker:up        # PostgreSQL起動
pnpm docker:down      # PostgreSQL停止
pnpm docker:logs      # ログ表示

# データベース
pnpm db:migrate       # マイグレーション実行
pnpm db:generate      # Prisma Client生成
pnpm db:studio        # Prisma Studio起動
pnpm db:seed          # シードデータ投入
pnpm db:reset         # DBリセット＋シード
```

## API エンドポイント

主要なエンドポイント:

| メソッド | パス | 説明 |
|---------|------|------|
| POST | /api/auth/register | ユーザー登録 |
| POST | /api/auth/login | ログイン |
| GET | /api/organizations | 組織一覧 |
| GET | /api/projects | プロジェクト一覧 |
| GET | /api/tables | テーブル一覧 |
| GET | /api/flows | 業務フロー一覧 |
| GET | /api/roles | ロール一覧 |
| GET | /api/export/project/:id/ai | AI向けエクスポート |

詳細は [API設計書](./docs/04-api-spec.md) を参照してください。

## ドキュメント

- [要件定義書](./docs/01-requirements.md)
- [アーキテクチャ設計書](./docs/02-architecture.md)
- [データモデル設計書](./docs/03-data-model.md)
- [API設計書](./docs/04-api-spec.md)
- [画面設計書](./docs/05-screen-design.md)
- [業務フロー図](./docs/06-business-flow.md)

## ライセンス

MIT

