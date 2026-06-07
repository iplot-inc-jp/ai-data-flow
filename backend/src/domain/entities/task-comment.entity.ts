import { BaseEntity } from './base.entity';
import { ValidationError } from '../errors';

export interface CreateTaskCommentProps {
  taskId: string;
  authorUserId?: string | null;
  authorName?: string | null;
  body: string;
}

export interface ReconstructTaskCommentProps {
  id: string;
  taskId: string;
  authorUserId: string | null;
  authorName: string | null;
  body: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * タスクコメントエンティティ
 * タスクに紐づくコメント（投稿者・本文）を表現する。
 */
export class TaskComment extends BaseEntity {
  private readonly _taskId: string;
  private readonly _authorUserId: string | null;
  private _authorName: string | null;
  private _body: string;

  private constructor(
    id: string,
    taskId: string,
    authorUserId: string | null,
    authorName: string | null,
    body: string,
    createdAt: Date,
    updatedAt: Date,
  ) {
    super(id, createdAt, updatedAt);
    this._taskId = taskId;
    this._authorUserId = authorUserId;
    this._authorName = authorName;
    this._body = body;
  }

  // ========== バリデーションヘルパー ==========

  private static normalizeBody(body: string | undefined): string {
    const trimmed = body?.trim();
    if (!trimmed || trimmed.length < 1) {
      throw new ValidationError('Comment body is required');
    }
    if (trimmed.length > 10000) {
      throw new ValidationError(
        'Comment body must be at most 10000 characters',
      );
    }
    return trimmed;
  }

  /**
   * 新規コメント作成
   */
  static create(props: CreateTaskCommentProps, id: string): TaskComment {
    if (!props.taskId) {
      throw new ValidationError('Task ID is required');
    }

    const body = TaskComment.normalizeBody(props.body);

    const now = new Date();
    return new TaskComment(
      id,
      props.taskId,
      props.authorUserId ?? null,
      props.authorName?.trim() || null,
      body,
      now,
      now,
    );
  }

  /**
   * DBからの再構築
   */
  static reconstruct(props: ReconstructTaskCommentProps): TaskComment {
    return new TaskComment(
      props.id,
      props.taskId,
      props.authorUserId,
      props.authorName,
      props.body,
      props.createdAt,
      props.updatedAt,
    );
  }

  // ========== ビジネスロジック ==========

  /** 本文を編集する */
  editBody(body: string): void {
    this._body = TaskComment.normalizeBody(body);
    this.touch();
  }

  /** 投稿者がこのコメントの作者かどうか */
  isAuthor(userId: string): boolean {
    return this._authorUserId !== null && this._authorUserId === userId;
  }

  // ========== Getter ==========

  get taskId(): string {
    return this._taskId;
  }

  get authorUserId(): string | null {
    return this._authorUserId;
  }

  get authorName(): string | null {
    return this._authorName;
  }

  get body(): string {
    return this._body;
  }
}
