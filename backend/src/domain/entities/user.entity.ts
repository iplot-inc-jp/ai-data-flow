import { BaseEntity } from './base.entity';
import { Email } from '../value-objects';
import { ValidationError } from '../errors';

export interface CreateUserProps {
  email: string;
  password: string;
  name?: string | null;
}

export interface ReconstructUserProps {
  id: string;
  email: string;
  password: string;
  name: string | null;
  avatarUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * ユーザーエンティティ
 * ビジネスルールをカプセル化
 */
export class User extends BaseEntity {
  private _email: Email;
  private _password: string;
  private _name: string | null;
  private _avatarUrl: string | null;

  private constructor(
    id: string,
    email: Email,
    password: string,
    name: string | null,
    avatarUrl: string | null,
    createdAt: Date,
    updatedAt: Date,
  ) {
    super(id, createdAt, updatedAt);
    this._email = email;
    this._password = password;
    this._name = name;
    this._avatarUrl = avatarUrl;
  }

  /**
   * 新規ユーザー作成
   * @param props 作成に必要なプロパティ
   * @param hashedPassword ハッシュ化済みパスワード（ドメインサービスで処理）
   * @param id 生成済みID（インフラで生成）
   */
  static create(props: CreateUserProps, hashedPassword: string, id: string): User {
    const email = Email.create(props.email);
    
    if (!hashedPassword) {
      throw new ValidationError('Password is required');
    }

    const name = props.name?.trim() || null;
    if (name && name.length > 100) {
      throw new ValidationError('Name must be at most 100 characters');
    }

    const now = new Date();
    return new User(id, email, hashedPassword, name, null, now, now);
  }

  /**
   * DBからの再構築
   */
  static reconstruct(props: ReconstructUserProps): User {
    return new User(
      props.id,
      Email.reconstruct(props.email),
      props.password,
      props.name,
      props.avatarUrl,
      props.createdAt,
      props.updatedAt,
    );
  }

  // ========== ビジネスロジック ==========

  /**
   * 名前を変更
   */
  changeName(name: string | null): void {
    if (name && name.length > 100) {
      throw new ValidationError('Name must be at most 100 characters');
    }
    this._name = name?.trim() || null;
    this.touch();
  }

  /**
   * パスワードを変更
   */
  changePassword(hashedPassword: string): void {
    if (!hashedPassword) {
      throw new ValidationError('Password is required');
    }
    this._password = hashedPassword;
    this.touch();
  }

  /**
   * アバターURLを変更
   */
  changeAvatarUrl(url: string | null): void {
    if (url && url.length > 500) {
      throw new ValidationError('Avatar URL is too long');
    }
    this._avatarUrl = url;
    this.touch();
  }

  // ========== Getter ==========

  get email(): string {
    return this._email.value;
  }

  get emailVO(): Email {
    return this._email;
  }

  get password(): string {
    return this._password;
  }

  get name(): string | null {
    return this._name;
  }

  get avatarUrl(): string | null {
    return this._avatarUrl;
  }
}

