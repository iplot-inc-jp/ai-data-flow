/**
 * ドメイン層のベースエラー
 * ビジネスルール違反を表現
 */
export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DomainError';
  }
}

/**
 * エンティティが見つからない
 */
export class EntityNotFoundError extends DomainError {
  constructor(entityName: string, id: string) {
    super(`${entityName} with id '${id}' not found`);
    this.name = 'EntityNotFoundError';
  }
}

/**
 * エンティティが既に存在する
 */
export class EntityAlreadyExistsError extends DomainError {
  constructor(entityName: string, field: string, value: string) {
    super(`${entityName} with ${field} '${value}' already exists`);
    this.name = 'EntityAlreadyExistsError';
  }
}

/**
 * バリデーションエラー
 */
export class ValidationError extends DomainError {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * 権限エラー
 */
export class UnauthorizedError extends DomainError {
  constructor(message: string = 'Unauthorized') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

/**
 * アクセス禁止エラー
 */
export class ForbiddenError extends DomainError {
  constructor(message: string = 'Forbidden') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

