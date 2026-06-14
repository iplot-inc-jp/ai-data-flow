/**
 * RBAC（プロジェクト単位メンバー権限）
 *
 * - project_member_*  … プロジェクトのメンバー権限（VIEW/EDIT）管理。管理者（super-admin or org OWNER/ADMIN）限定。
 * - project_my_access … 自分の実効アクセスレベル（権限不要）。
 *
 * 操作履歴（監査ログ）は pm.mjs の change_log_list を参照。
 */

import { z } from 'zod';
import { wrap } from '../lib/api.mjs';

export function registerTools(server, call) {
  server.tool(
    'project_member_list',
    'プロジェクトメンバー一覧を取得する（その組織の全ユーザー＋実効権限）。' +
      '各行に userId / email / name / orgRole / explicitLevel（明示権限）/ effectiveLevel（実効権限）を含む。' +
      'project_member_set / project_member_remove で使う userId はここから取得する。' +
      '管理者（全体管理者 or 会社 OWNER/ADMIN）のみ実行可能。',
    {
      projectId: z.string().describe('プロジェクトID'),
    },
    wrap(({ projectId }) => call('GET', `/projects/${projectId}/members`)),
  );

  server.tool(
    'project_member_set',
    'プロジェクトメンバーの明示アクセスレベルを設定する（upsert）。' +
      'userId は project_member_list の userId。対象は同一組織のメンバーである必要がある。' +
      '管理者（全体管理者 or 会社 OWNER/ADMIN）のみ実行可能。',
    {
      projectId: z.string().describe('プロジェクトID'),
      userId: z.string().describe('対象ユーザーID（project_member_list の userId）'),
      accessLevel: z
        .enum(['VIEW', 'EDIT'])
        .describe('アクセスレベル（VIEW=閲覧 / EDIT=編集）'),
    },
    wrap(({ projectId, userId, accessLevel }) =>
      call('PUT', `/projects/${projectId}/members/${userId}`, { body: { accessLevel } }),
    ),
  );

  server.tool(
    'project_member_remove',
    'プロジェクトメンバーの明示権限を削除して既定（組織ロール由来の権限）に戻す。' +
      '管理者（全体管理者 or 会社 OWNER/ADMIN）のみ実行可能。',
    {
      projectId: z.string().describe('プロジェクトID'),
      userId: z.string().describe('対象ユーザーID（project_member_list の userId）'),
    },
    wrap(({ projectId, userId }) =>
      call('DELETE', `/projects/${projectId}/members/${userId}`),
    ),
  );

  server.tool(
    'project_my_access',
    '呼出ユーザー自身の実効アクセスレベル（EDIT / VIEW / null）を取得する。権限不要のスモークテストにも使える。',
    {
      projectId: z.string().describe('プロジェクトID'),
    },
    wrap(({ projectId }) => call('GET', `/projects/${projectId}/my-access`)),
  );
}
