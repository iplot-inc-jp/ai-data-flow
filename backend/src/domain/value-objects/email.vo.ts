import { ValidationError } from '../errors';

/**
 * メールアドレス値オブジェクト
 * 不変で、常に有効な状態を保証
 */
export class Email {
  private readonly _value: string;

  private constructor(value: string) {
    this._value = value.toLowerCase().trim();
  }

  /**
   * ファクトリメソッド - バリデーション付き
   */
  static create(value: string): Email {
    if (!value || value.trim() === '') {
      throw new ValidationError('Email is required');
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(value)) {
      throw new ValidationError('Invalid email format');
    }

    return new Email(value);
  }

  /**
   * 再構築 - DBからの復元時に使用（バリデーション済み前提）
   */
  static reconstruct(value: string): Email {
    return new Email(value);
  }

  get value(): string {
    return this._value;
  }

  equals(other: Email): boolean {
    return this._value === other._value;
  }

  toString(): string {
    return this._value;
  }
}

