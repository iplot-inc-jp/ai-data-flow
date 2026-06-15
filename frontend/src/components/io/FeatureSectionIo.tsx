'use client';

/**
 * FeatureSectionIo — feature-io の section 1 つ分の export/import ボタン。
 *
 * 各機能の一覧ページが <FeatureSectionIo projectId sectionKey label canEdit onDone />
 * を PageHeader の actions に置くだけで、その機能の JSON 入出力が付く。
 * 中身は ExportImportButton に lib/io.ts の featureIo ラッパを束ねただけ。
 */

import { ExportImportButton } from './ExportImportButton';
import { featureIo, type ImportMode, type SectionExport } from '@/lib/io';

export interface FeatureSectionIoProps {
  projectId: string;
  /** project-bundle の section キー（例: 'risks' / 'tasks' / 'domains'）。 */
  sectionKey: string;
  /** 表示名（例: "リスク"）。ファイル名は `${fileBaseName ?? label}` を使用。 */
  label: string;
  fileBaseName?: string;
  canEdit?: boolean;
  onDone?: () => void;
  size?: 'sm' | 'default';
}

export function FeatureSectionIo({
  projectId,
  sectionKey,
  label,
  fileBaseName,
  canEdit = false,
  onDone,
  size = 'sm',
}: FeatureSectionIoProps) {
  return (
    <ExportImportButton
      label={label}
      fileBaseName={fileBaseName ?? `${label}-${sectionKey}`}
      size={size}
      canEdit={canEdit}
      onDone={onDone}
      getExport={() => featureIo.exportSection(projectId, sectionKey)}
      onImport={(parsed, mode: ImportMode) =>
        featureIo.importSection(
          projectId,
          sectionKey,
          parsed as SectionExport,
          mode,
        )
      }
    />
  );
}
