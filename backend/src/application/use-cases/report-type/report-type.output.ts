import { ReportType } from '../../../domain';

export interface ReportTypeOutput {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  order: number;
  attachmentCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export function toReportTypeOutput(
  reportType: ReportType,
  attachmentCount = 0,
): ReportTypeOutput {
  return {
    id: reportType.id,
    projectId: reportType.projectId,
    name: reportType.name,
    description: reportType.description,
    order: reportType.order,
    attachmentCount,
    createdAt: reportType.createdAt,
    updatedAt: reportType.updatedAt,
  };
}
