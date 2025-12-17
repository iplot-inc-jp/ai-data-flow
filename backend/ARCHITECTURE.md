# バックエンド クリーンアーキテクチャ設計

## 1. レイヤー構成

```
src/
├── domain/                      # ドメイン層（最も内側）
│   ├── entities/                # エンティティ（ビジネスルール）
│   ├── value-objects/           # 値オブジェクト
│   ├── repositories/            # リポジトリインターフェース
│   ├── services/                # ドメインサービス
│   └── errors/                  # ドメインエラー
│
├── application/                 # アプリケーション層
│   ├── use-cases/               # ユースケース（オーケストレーションのみ）
│   ├── ports/                   # ポート（外部サービスIF）
│   └── dto/                     # アプリケーションDTO
│
├── infrastructure/              # インフラストラクチャ層
│   ├── persistence/             # 永続化（リポジトリ実装）
│   │   ├── prisma/              # Prisma関連
│   │   └── repositories/        # リポジトリ実装
│   ├── services/                # 外部サービス実装
│   └── config/                  # 設定
│
├── presentation/                # プレゼンテーション層（最も外側）
│   ├── controllers/             # コントローラー
│   ├── dto/                     # リクエスト/レスポンスDTO
│   ├── guards/                  # 認証ガード
│   └── filters/                 # 例外フィルター
│
└── shared/                      # 共通ユーティリティ
    ├── decorators/
    └── utils/
```

## 2. 依存関係ルール

```
Presentation → Application → Domain
      ↓              ↓
Infrastructure (Domain のインターフェースを実装)
```

- **Domain層は何にも依存しない**（純粋なTypeScript）
- Application層はDomain層のみに依存
- Infrastructure層はDomain層のインターフェースを実装
- Presentation層はApplication層に依存

## 3. 各層の責務

### 3.1 Domain層（ビジネスロジックの中心）

**含めるもの:**
- エンティティ（ビジネスルール、バリデーション）
- 値オブジェクト（不変、等価性）
- ドメインサービス（エンティティに属さないロジック）
- リポジトリインターフェース（データアクセスの抽象）
- ドメインイベント
- ドメインエラー

**禁止事項:**
- フレームワーク依存（NestJS, Prisma）
- 外部ライブラリ依存
- インフラ層の知識

### 3.2 Application層（オーケストレーション）

**含めるもの:**
- ユースケース（1クラス1責務）
- 入出力DTO
- ポート（外部サービスの抽象）
- トランザクション境界

**禁止事項:**
- ビジネスロジック（Domain層に委譲）
- 永続化の詳細
- HTTPの知識

### 3.3 Infrastructure層（技術的詳細）

**含めるもの:**
- リポジトリ実装（Prisma）
- 外部サービス実装
- 設定、環境変数
- メール送信、ファイル保存など

### 3.4 Presentation層（外界とのインターフェース）

**含めるもの:**
- コントローラー（HTTPハンドリング）
- リクエスト/レスポンスDTO
- バリデーション（入力検証）
- 認証/認可ガード
- 例外フィルター

## 4. ファイル命名規則

| 種類 | 命名パターン | 例 |
|------|-------------|-----|
| エンティティ | `{name}.entity.ts` | `user.entity.ts` |
| 値オブジェクト | `{name}.vo.ts` | `email.vo.ts` |
| リポジトリIF | `{name}.repository.ts` | `user.repository.ts` |
| リポジトリ実装 | `{name}.repository.impl.ts` | `user.repository.impl.ts` |
| ユースケース | `{action}-{resource}.use-case.ts` | `create-user.use-case.ts` |
| コントローラー | `{name}.controller.ts` | `user.controller.ts` |
| DTO | `{action}-{resource}.dto.ts` | `create-user.dto.ts` |
| ドメインサービス | `{name}.service.ts` | `password-hash.service.ts` |

## 5. 実装パターン

### 5.1 エンティティ（ドメイン層）

```typescript
// domain/entities/user.entity.ts
export class User {
  private constructor(
    private readonly _id: string,
    private _email: Email,
    private _name: string | null,
    private readonly _createdAt: Date,
  ) {}

  // ファクトリメソッド
  static create(props: CreateUserProps): User {
    // ビジネスルールのバリデーション
    if (!props.email) {
      throw new DomainError('Email is required');
    }
    return new User(
      generateId(),
      Email.create(props.email),
      props.name ?? null,
      new Date(),
    );
  }

  // 再構築（DBからの復元）
  static reconstruct(props: UserProps): User {
    return new User(
      props.id,
      Email.create(props.email),
      props.name,
      props.createdAt,
    );
  }

  // ビジネスロジック
  changeName(name: string): void {
    if (name.length > 100) {
      throw new DomainError('Name is too long');
    }
    this._name = name;
  }

  // Getter（外部公開用）
  get id(): string { return this._id; }
  get email(): string { return this._email.value; }
  get name(): string | null { return this._name; }
}
```

### 5.2 ユースケース（アプリケーション層）

```typescript
// application/use-cases/create-user.use-case.ts
@Injectable()
export class CreateUserUseCase {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
    private readonly passwordHashService: PasswordHashService,
  ) {}

  async execute(input: CreateUserInput): Promise<CreateUserOutput> {
    // 1. ドメインエンティティを生成（ビジネスルールはエンティティ内）
    const user = User.create({
      email: input.email,
      name: input.name,
    });

    // 2. 重複チェック（ドメインサービスまたはリポジトリ）
    const exists = await this.userRepository.existsByEmail(user.email);
    if (exists) {
      throw new UserAlreadyExistsError(user.email);
    }

    // 3. 永続化
    await this.userRepository.save(user);

    // 4. 出力DTO返却
    return { id: user.id, email: user.email };
  }
}
```

### 5.3 コントローラー（プレゼンテーション層）

```typescript
// presentation/controllers/user.controller.ts
@Controller('users')
export class UserController {
  constructor(private readonly createUserUseCase: CreateUserUseCase) {}

  @Post()
  async create(@Body() dto: CreateUserRequestDto): Promise<CreateUserResponseDto> {
    // UseCaseに委譲するだけ
    const result = await this.createUserUseCase.execute({
      email: dto.email,
      name: dto.name,
    });
    return { id: result.id, email: result.email };
  }
}
```

