# 業務フロー図

## 1. ユーザー登録フロー

```mermaid
flowchart TD
    subgraph User [ユーザー]
        A((開始))
        B[ランディングページ訪問]
        C[新規登録ボタンクリック]
        D[メール/パスワード入力]
    end

    subgraph System [システム]
        E{入力値検証}
        F[ユーザー作成]
        G[JWT発行]
        H[(users)]
    end

    subgraph User2 [ユーザー]
        I[ダッシュボードへ]
        J((終了))
    end

    A --> B
    B --> C
    C --> D
    D --> E
    E -->|NG| D
    E -->|OK| F
    F --> H
    F --> G
    G --> I
    I --> J
```

## 2. データカタログ作成フロー

```mermaid
flowchart TD
    subgraph User [ユーザー]
        A((開始))
        B[カタログ画面を開く]
        C[テーブル追加ボタン]
        D[テーブル情報入力]
        E[カラム追加]
        F[CRUDマッピング設定]
    end

    subgraph System [システム]
        G[テーブル作成API]
        H[(tables)]
        I[カラム作成API]
        J[(columns)]
        K[マッピング作成API]
        L[(crud_mappings)]
    end

    subgraph User2 [ユーザー]
        M[完了確認]
        N((終了))
    end

    A --> B
    B --> C
    C --> D
    D --> G
    G --> H
    H --> E
    E --> I
    I --> J
    J --> F
    F --> K
    K --> L
    L --> M
    M --> N
```

## 3. 業務フロー作成フロー

```mermaid
flowchart TD
    subgraph User [ユーザー]
        A((開始))
        B[フロー画面を開く]
        C[新規フロー作成]
        D[ノードをドラッグ&ドロップ]
        E[ノード間を接続]
        F[ロールを割り当て]
        G[CRUDマッピング設定]
        H[保存ボタン]
    end

    subgraph System [システム]
        I[フロー作成API]
        J[(business_flows)]
        K[ノード作成API]
        L[(flow_nodes)]
        M[エッジ作成API]
        N[(flow_edges)]
        O[バリデーション]
    end

    subgraph User2 [ユーザー]
        P[mermaid出力]
        Q((終了))
    end

    A --> B
    B --> C
    C --> I
    I --> J
    J --> D
    D --> K
    K --> L
    L --> E
    E --> M
    M --> N
    N --> F
    F --> G
    G --> H
    H --> O
    O -->|NG| D
    O -->|OK| P
    P --> Q
```

## 4. AIエージェント連携フロー

```mermaid
flowchart TD
    subgraph AI [AIエージェント]
        A((リクエスト開始))
        B[APIキー取得]
        C[プロジェクト情報要求]
    end

    subgraph System [DataFlow API]
        D{認証チェック}
        E[データ取得]
        F[mermaid生成]
        G[構造化データ生成]
        H[(PostgreSQL)]
    end

    subgraph AI2 [AIエージェント]
        I[レスポンス解析]
        J[コンテキスト理解]
        K[タスク実行]
        L((終了))
    end

    A --> B
    B --> C
    C --> D
    D -->|NG| A
    D -->|OK| E
    E --> H
    H --> F
    H --> G
    F --> I
    G --> I
    I --> J
    J --> K
    K --> L
```

## 5. 注文処理フロー（サンプル）

DataFlowで作成する業務フローの例として、ECサイトの注文処理フローを示します。

```mermaid
flowchart TD
    subgraph Customer [顧客]
        A((開始))
        B[商品検索]
        C[商品詳細確認]
        D[カートに追加]
        E[注文確定]
        F[支払い情報入力]
    end

    subgraph System [システム]
        G{在庫確認}
        H[在庫引当]
        I[(products)]
        J[決済処理]
        K{決済成功?}
        L[注文作成]
        M[(orders)]
        N[在庫戻し]
    end

    subgraph Warehouse [倉庫システム]
        O[出荷指示受信]
        P[ピッキング]
        Q[梱包]
        R[発送]
    end

    subgraph Customer2 [顧客]
        S[発送通知受信]
        T[商品受取]
        U((終了))
    end

    A --> B
    B --> C
    C --> D
    D --> G
    G -->|在庫なし| B
    G -->|在庫あり| E
    E --> F
    F --> J
    J --> K
    K -->|NG| N
    N --> F
    K -->|OK| H
    H --> I
    H --> L
    L --> M
    L --> O
    O --> P
    P --> Q
    Q --> R
    R --> S
    S --> T
    T --> U
```

## 6. CRUDマッピング例

上記の注文処理フローにおける、ordersテーブルのCRUDマッピング：

| カラム | 操作 | ロール | フローノード | 条件 |
|-------|------|-------|------------|------|
| id | CREATE | システム | 注文作成 | 決済成功時 |
| customer_id | CREATE | システム | 注文作成 | ログインユーザーから |
| total_amount | CREATE | システム | 注文作成 | カート合計から |
| status | CREATE | システム | 注文作成 | 'pending'で初期化 |
| status | UPDATE | 倉庫システム | 発送 | 'shipped'に更新 |
| status | READ | 顧客 | 発送通知受信 | ステータス確認 |
| shipped_at | UPDATE | 倉庫システム | 発送 | 発送時刻記録 |

## 7. mermaidエクスポート形式

DataFlowから出力されるmermaid形式の例：

```mermaid
flowchart TD
    subgraph Customer [顧客]
        node_1((開始))
        node_2[商品検索]
        node_3[カート追加]
    end
    
    subgraph System [システム]
        node_4{在庫確認}
        node_5[注文作成]
        node_6[(orders)]
    end
    
    node_1 --> node_2
    node_2 --> node_3
    node_3 --> node_4
    node_4 -->|Yes| node_5
    node_4 -->|No| node_2
    node_5 --> node_6
```

このmermaid形式は以下の用途で活用できます：

1. **AIエージェントへのコンテキスト提供**
   - システム全体像の理解
   - 適切なコード生成の支援
   
2. **ドキュメント生成**
   - 設計書への埋め込み
   - Wiki/Notionへの共有
   
3. **顧客との認識合わせ**
   - 業務フローの可視化
   - 要件確認

