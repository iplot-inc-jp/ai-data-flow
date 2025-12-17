# コーディングルール

このドキュメントはバックエンドのクリーンアーキテクチャに基づくコーディングルールを定義します。

---

## 1. レイヤー構成と依存関係

### 1.1 レイヤー構成

```
src/
├── domain/           # ドメイン層（ビジネスロジック）
├── application/      # アプリケーション層（ユースケース）
├── infrastructure/   # インフラ層（技術的詳細）
├── presentation/     # プレゼンテーション層（API）
└── shared/           # 共通ユーティリティ
```

### 1.2 依存関係ルール（厳守）

```
Presentation → Application → Domain
      ↓              ↓
Infrastructure（Domainのインターフェースを実装）
```

| ルール | 説明 |
|--------|------|
| ✅ Domain層は何にも依存しない | 純粋なTypeScriptのみ |
| ✅ Application層はDomain層のみに依存 | UseCaseはDomainエンティティとリポジトリIFのみ使用 |
| ✅ Infrastructure層はDomain層のインターフェースを実装 | DI経由で注入 |
| ✅ Presentation層はApplication層に依存 | コントローラーはUseCaseを呼び出すのみ |
| ❌ Domain層でNestJS/Prismaを使用 | フレームワーク依存禁止 |
| ❌ Application層にビジネスロジックを記述 | Domain層に委譲 |

---

## 2. Domain層のルール

### 2.1 エンティティ

```typescript
// ✅ 良い例：ビジネスロジックをエンティティに集約
export class User extends BaseEntity {
  private constructor(...) { ... }

  // ファクトリメソッド（新規作成）
  static create(props: CreateUserProps, hashedPassword: string, id: string): User {
    // バリデーションはここで
    if (!props.email) {
      throw new ValidationError('Email is required');
    }
    return new User(...);
  }

  // 再構築メソッド（DBから復元）
  static reconstruct(props: UserProps): User {
    return new User(...);
  }

  // ビジネスロジック
  changeName(name: string): void {
    if (name.length > 100) {
      throw new ValidationError('Name is too long');
    }
    this._name = name;
    this.touch();
  }
}

// ❌ 悪い例：ビジネスロジックがない貧血エンティティ
export class User {
  id: string;
  name: string;
  email: string;
  // ただのデータ構造になっている
}
```

### 2.2 値オブジェクト

```typescript
// ✅ 良い例：不変で、バリデーション済み
export class Email {
  private readonly _value: string;

  private constructor(value: string) {
    this._value = value.toLowerCase();
  }

  static create(value: string): Email {
    if (!emailRegex.test(value)) {
      throw new ValidationError('Invalid email');
    }
    return new Email(value);
  }

  equals(other: Email): boolean {
    return this._value === other._value;
  }
}

// ❌ 悪い例：ただのプリミティブ型
type Email = string;
```

### 2.3 リポジトリインターフェース

```typescript
// ✅ Domain層ではインターフェースのみ定義
export interface UserRepository {
  findById(id: string): Promise<User | null>;
  save(user: User): Promise<void>;
  generateId(): string;
}

export const USER_REPOSITORY = Symbol('USER_REPOSITORY');
```

### 2.4 ドメインエラー

```typescript
// ✅ 具体的なビジネスエラー
export class EntityNotFoundError extends DomainError {
  constructor(entityName: string, id: string) {
    super(`${entityName} with id '${id}' not found`);
  }
}

// ❌ 汎用的すぎるエラー
throw new Error('Not found');
```

---

## 3. Application層のルール

### 3.1 ユースケース（最重要）

```typescript
// ✅ 良い例：オーケストレーションのみ
@Injectable()
export class CreateUserUseCase {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
  ) {}

  async execute(input: CreateUserInput): Promise<CreateUserOutput> {
    // 1. 事前条件チェック（リポジトリ経由）
    const exists = await this.userRepository.existsByEmail(input.email);
    if (exists) {
      throw new EntityAlreadyExistsError('User', 'email', input.email);
    }

    // 2. エンティティ生成（ビジネスロジックはエンティティ内）
    const user = User.create(input, hashedPassword, id);

    // 3. 永続化
    await this.userRepository.save(user);

    // 4. 出力返却
    return { id: user.id };
  }
}

// ❌ 悪い例：ビジネスロジックがUseCaseに漏れている
@Injectable()
export class CreateUserUseCase {
  async execute(input: CreateUserInput): Promise<CreateUserOutput> {
    // ビジネスロジックがUseCaseに直接書かれている
    if (input.name.length > 100) {
      throw new Error('Name too long');
    }
    // ...
  }
}
```

### 3.2 入出力DTO

```typescript
// ✅ ユースケース専用のDTO（プレゼンテーション層のDTOとは別）
export interface CreateUserInput {
  email: string;
  password: string;
  name?: string;
}

export interface CreateUserOutput {
  id: string;
  email: string;
}
```

---

## 4. Infrastructure層のルール

### 4.1 リポジトリ実装

```typescript
// ✅ Domainのインターフェースを実装
@Injectable()
export class UserRepositoryImpl implements UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<User | null> {
    const data = await this.prisma.user.findUnique({ where: { id } });
    if (!data) return null;
    
    // Prismaモデル → ドメインエンティティに変換
    return User.reconstruct({
      id: data.id,
      email: data.email,
      ...
    });
  }

  async save(user: User): Promise<void> {
    // ドメインエンティティ → Prismaモデルに変換
    await this.prisma.user.upsert({
      where: { id: user.id },
      create: { ... },
      update: { ... },
    });
  }
}
```

### 4.2 外部サービス実装

```typescript
// ✅ Domainのインターフェースを実装
@Injectable()
export class BcryptPasswordHashService implements PasswordHashService {
  async hash(password: string): Promise<string> {
    return bcrypt.hash(password, 10);
  }
}
```

---

## 5. Presentation層のルール

### 5.1 コントローラー

```typescript
// ✅ 良い例：UseCaseに委譲するのみ
@Controller('users')
export class UserController {
  constructor(private readonly createUserUseCase: CreateUserUseCase) {}

  @Post()
  async create(@Body() dto: CreateUserRequestDto): Promise<CreateUserResponseDto> {
    // UseCaseを呼び出すだけ
    const result = await this.createUserUseCase.execute({
      email: dto.email,
      password: dto.password,
    });
    return result;
  }
}

// ❌ 悪い例：コントローラーにロジックがある
@Controller('users')
export class UserController {
  @Post()
  async create(@Body() dto: CreateUserRequestDto) {
    // コントローラーでバリデーションやロジックを実行
    if (dto.email.includes('@')) { ... }
    const user = await this.userService.create(dto);
    return user;
  }
}
```

### 5.2 リクエスト/レスポンスDTO

```typescript
// ✅ class-validatorでバリデーション
export class CreateUserRequestDto {
  @IsEmail()
  email: string;

  @MinLength(8)
  password: string;
}

// ✅ Swagger用のデコレータ
@ApiProperty({ example: 'user@example.com' })
email: string;
```

---

## 6. ファイル命名規則

| 種類 | パターン | 例 |
|------|----------|-----|
| エンティティ | `{name}.entity.ts` | `user.entity.ts` |
| 値オブジェクト | `{name}.vo.ts` | `email.vo.ts` |
| リポジトリIF | `{name}.repository.ts` | `user.repository.ts` |
| リポジトリ実装 | `{name}.repository.impl.ts` | `user.repository.impl.ts` |
| ユースケース | `{action}-{resource}.use-case.ts` | `create-user.use-case.ts` |
| コントローラー | `{name}.controller.ts` | `user.controller.ts` |
| DTO（リクエスト） | `{action}-{resource}.dto.ts` | `create-user.dto.ts` |
| ドメインサービス | `{name}.service.ts` | `password-hash.service.ts` |
| インフラサービス | `{impl-name}.service.ts` | `bcrypt-password-hash.service.ts` |

---

## 7. DI（依存性注入）ルール

### 7.1 Symbolによるトークン定義

```typescript
// ✅ Domain層でSymbolを定義
export const USER_REPOSITORY = Symbol('USER_REPOSITORY');

// ✅ モジュールでバインド
{
  provide: USER_REPOSITORY,
  useClass: UserRepositoryImpl,
}

// ✅ UseCaseで@Injectを使用
constructor(
  @Inject(USER_REPOSITORY)
  private readonly userRepository: UserRepository,
) {}
```

---

## 8. エラーハンドリング

### 8.1 ドメインエラー → HTTPレスポンス変換

```typescript
// DomainExceptionFilterで自動変換
EntityNotFoundError  → 404 Not Found
EntityAlreadyExistsError → 409 Conflict
ValidationError → 400 Bad Request
UnauthorizedError → 401 Unauthorized
ForbiddenError → 403 Forbidden
```

---

## 9. テスト方針

| レイヤー | テスト方法 |
|---------|-----------|
| Domain層 | 純粋な単体テスト（モック不要） |
| Application層 | リポジトリをモックしてユースケースをテスト |
| Infrastructure層 | 統合テスト（テストDB使用） |
| Presentation層 | E2Eテスト |

---

## 10. チェックリスト

新機能追加時のチェックリスト：

- [ ] Domain層
  - [ ] エンティティにビジネスロジックを実装したか
  - [ ] 値オブジェクトでバリデーションを行ったか
  - [ ] リポジトリインターフェースを定義したか
  - [ ] ドメインエラーを定義したか
  - [ ] フレームワーク依存がないか

- [ ] Application層
  - [ ] ユースケースはオーケストレーションのみか
  - [ ] ビジネスロジックがUseCaseに漏れていないか
  - [ ] 入出力DTOを定義したか

- [ ] Infrastructure層
  - [ ] リポジトリを実装したか
  - [ ] エンティティ ↔ DBモデルの変換を正しく行ったか

- [ ] Presentation層
  - [ ] コントローラーはUseCaseを呼び出すのみか
  - [ ] リクエストDTOにバリデーションを設定したか
  - [ ] Swaggerドキュメントを追加したか

- [ ] DI設定
  - [ ] app.module.tsにプロバイダーを追加したか

