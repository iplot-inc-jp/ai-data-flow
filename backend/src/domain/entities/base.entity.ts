/**
 * エンティティの基底クラス
 * IDによる同一性を持つ
 */
export abstract class BaseEntity<T extends string = string> {
  protected readonly _id: T;
  protected readonly _createdAt: Date;
  protected _updatedAt: Date;

  protected constructor(id: T, createdAt: Date, updatedAt: Date) {
    this._id = id;
    this._createdAt = createdAt;
    this._updatedAt = updatedAt;
  }

  get id(): T {
    return this._id;
  }

  get createdAt(): Date {
    return this._createdAt;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }

  protected touch(): void {
    this._updatedAt = new Date();
  }

  equals(other: BaseEntity<T>): boolean {
    if (other === null || other === undefined) {
      return false;
    }
    return this._id === other._id;
  }
}

