import { Meeting } from '../entities';

/**
 * Meeting リポジトリインターフェース
 */
export interface IMeetingRepository {
  /**
   * IDで検索（対象ステークホルダーID含む）
   */
  findById(id: string): Promise<Meeting | null>;

  /**
   * プロジェクト内の会議体一覧（order昇順、対象ステークホルダーID含む）
   */
  findByProjectId(projectId: string): Promise<Meeting[]>;

  /**
   * 保存（基本属性のみ。対象ステークホルダーの紐付けは setStakeholders を使う）
   */
  save(meeting: Meeting): Promise<void>;

  /**
   * 対象ステークホルダーの紐付けを置き換える（join行を入れ替え）
   */
  setStakeholders(meetingId: string, stakeholderIds: string[]): Promise<void>;

  /**
   * 削除
   */
  delete(id: string): Promise<void>;

  /**
   * IDの生成
   */
  generateId(): string;
}

export const MEETING_REPOSITORY = Symbol('MEETING_REPOSITORY');
