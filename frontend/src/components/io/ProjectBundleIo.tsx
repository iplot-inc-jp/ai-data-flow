'use client';

/**
 * ProjectBundleIo — プロジェクト全体の export / import ボタン。
 *
 * - エクスポート: プロジェクト全体を 1 つのバンドル JSON でダウンロード。
 * - インポート: バンドル JSON を選び、置換（replace=全消し再構築）/ 追加（merge）を選んで
 *   このプロジェクトへ取り込む。
 *
 * 配置例: 背景・目的（/background）ページや設定ページのヘッダ。
 * 「新規プロジェクトとして取込」は organizationId が必要なため、ここでは扱わない
 * （projectBundleIo.importAsNew は lib/io.ts に用意済み）。
 */

import { ExportImportButton } from './ExportImportButton';
import { projectBundleIo, type ImportMode, type ProjectBundle } from '@/lib/io';

export interface ProjectBundleIoProps {
  projectId: string;
  /** ダウンロードファイル名に使うプロジェクト名（任意）。 */
  projectName?: string;
  canEdit?: boolean;
  /** 取り込み後の再読込（ページ全体の再取得など）。 */
  onDone?: () => void;
  size?: 'sm' | 'default';
}

export function ProjectBundleIo({
  projectId,
  projectName,
  canEdit = false,
  onDone,
  size = 'sm',
}: ProjectBundleIoProps) {
  return (
    <ExportImportButton
      label="プロジェクト全体"
      fileBaseName={`project-${projectName ?? projectId}`}
      size={size}
      canEdit={canEdit}
      onDone={onDone}
      importHint="バンドル JSON をこのプロジェクトに取り込みます。置換は既存データを全消ししてから再構築、追加は既存に足します。"
      getExport={() => projectBundleIo.export(projectId)}
      onImport={(parsed, mode: ImportMode) =>
        projectBundleIo.import(projectId, parsed as ProjectBundle, mode)
      }
    />
  );
}
