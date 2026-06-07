import { ReportType } from '../entities/report-type.entity';

export const REPORT_TYPE_REPOSITORY = Symbol('REPORT_TYPE_REPOSITORY');

export interface IReportTypeRepository {
  findById(id: string): Promise<ReportType | null>;
  findByProjectId(projectId: string): Promise<ReportType[]>;
  /** 帳票種別ごとの添付ファイル件数を projectId 単位で取得 */
  countAttachmentsByProjectId(projectId: string): Promise<Map<string, number>>;
  save(reportType: ReportType): Promise<void>;
  delete(id: string): Promise<void>;
  generateId(): string;
}
