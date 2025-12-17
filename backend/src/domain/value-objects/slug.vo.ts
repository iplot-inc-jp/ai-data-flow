import { ValidationError } from '../errors';

/**
 * スラッグ値オブジェクト
 * URL用の識別子（英小文字、数字、ハイフン）
 */
export class Slug {
  private readonly _value: string;

  private constructor(value: string) {
    this._value = value.toLowerCase().trim();
  }

  /**
   * ファクトリメソッド - バリデーション付き
   */
  static create(value: string): Slug {
    if (!value || value.trim() === '') {
      throw new ValidationError('Slug is required');
    }

    const slugRegex = /^[a-z0-9-]+$/;
    if (!slugRegex.test(value.toLowerCase())) {
      throw new ValidationError('Slug must contain only lowercase letters, numbers, and hyphens');
    }

    if (value.length < 2) {
      throw new ValidationError('Slug must be at least 2 characters');
    }

    if (value.length > 100) {
      throw new ValidationError('Slug must be at most 100 characters');
    }

    return new Slug(value);
  }

  /**
   * 再構築 - DBからの復元時に使用
   */
  static reconstruct(value: string): Slug {
    return new Slug(value);
  }

  get value(): string {
    return this._value;
  }

  equals(other: Slug): boolean {
    return this._value === other._value;
  }

  toString(): string {
    return this._value;
  }
}

