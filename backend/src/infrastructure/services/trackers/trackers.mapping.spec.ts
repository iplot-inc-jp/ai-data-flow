/**
 * 外部トラッカー（Backlog / Jira）→ Task マッピングの単体検証。
 *
 * - enum 写像（状態/優先度）: Backlog（日本語）/ Jira（英語）双方の代表値。
 * - 親子の循環ガード（wouldFormCycle）。
 * - クライアントの「正規化」: 代表的な実APIレスポンス形（サンプルJSON）を fetch モックで返し、
 *   NormalizedIssue[]（状態/優先度/親子/コメント/工数）が期待通り畳まれることを確認する。
 *
 * 外部APIは呼ばず、global.fetch をモックする（実認証は不要）。
 */
import { mapStatus, mapPriority, wouldFormCycle } from './tracker-import.service';
import { adfToText, jiraListIssues } from './jira-api';
import { backlogListIssues } from './backlog-api';

describe('enum 写像: mapStatus', () => {
  it('Backlog 日本語の状態を TaskStatus に写す', () => {
    expect(mapStatus('未対応', 'BACKLOG')).toBe('OPEN');
    expect(mapStatus('処理中', 'BACKLOG')).toBe('IN_PROGRESS');
    expect(mapStatus('処理済み', 'BACKLOG')).toBe('RESOLVED');
    expect(mapStatus('完了', 'BACKLOG')).toBe('CLOSED');
  });

  it('Jira 英語の状態を TaskStatus に写す', () => {
    expect(mapStatus('To Do', 'JIRA')).toBe('OPEN');
    expect(mapStatus('In Progress', 'JIRA')).toBe('IN_PROGRESS');
    expect(mapStatus('Done', 'JIRA')).toBe('CLOSED');
    expect(mapStatus('Resolved', 'JIRA')).toBe('RESOLVED');
    expect(mapStatus('Backlog', 'JIRA')).toBe('OPEN');
  });

  it('未知値/空は安全な既定 OPEN にフォールバック', () => {
    expect(mapStatus('なにか未知の状態', 'JIRA')).toBe('OPEN');
    expect(mapStatus('', 'BACKLOG')).toBe('OPEN');
    expect(mapStatus(null, 'JIRA')).toBe('OPEN');
  });
});

describe('enum 写像: mapPriority', () => {
  it('Backlog 日本語の優先度を写す', () => {
    expect(mapPriority('高', 'BACKLOG')).toBe('HIGH');
    expect(mapPriority('中', 'BACKLOG')).toBe('MEDIUM');
    expect(mapPriority('低', 'BACKLOG')).toBe('LOW');
  });

  it('Jira 英語の優先度を写す', () => {
    expect(mapPriority('Highest', 'JIRA')).toBe('HIGH');
    expect(mapPriority('High', 'JIRA')).toBe('HIGH');
    expect(mapPriority('Medium', 'JIRA')).toBe('MEDIUM');
    expect(mapPriority('Low', 'JIRA')).toBe('LOW');
    expect(mapPriority('Lowest', 'JIRA')).toBe('LOW');
  });

  it('未知値/空は MEDIUM にフォールバック', () => {
    expect(mapPriority('???', 'JIRA')).toBe('MEDIUM');
    expect(mapPriority(null, 'BACKLOG')).toBe('MEDIUM');
  });
});

describe('親子の循環ガード: wouldFormCycle', () => {
  it('直接の自己参照/相互参照を検知する', () => {
    const applied = new Map<string, string>();
    // A の親に B を設定。
    applied.set('A', 'B');
    // ここで B の親に A を設定すると A->B->A の循環。
    expect(wouldFormCycle(applied, 'B', 'A')).toBe(true);
    // 関係ない C を A の子にするのは循環でない。
    expect(wouldFormCycle(applied, 'C', 'A')).toBe(false);
  });

  it('多段の祖先到達を循環として検知する', () => {
    const applied = new Map<string, string>([
      ['A', 'B'],
      ['B', 'C'],
    ]);
    // C の親に A を設定すると A->B->C->A の循環。
    expect(wouldFormCycle(applied, 'C', 'A')).toBe(true);
    // D を C の子にするのは循環でない。
    expect(wouldFormCycle(applied, 'D', 'C')).toBe(false);
  });
});

describe('Jira ADF → プレーンテキスト: adfToText', () => {
  it('段落をまたいだ text ノードを連結し、ブロック境界で改行する', () => {
    const adf = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: '一行目です。' },
            { type: 'text', text: '続き。' },
          ],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: '二段落目。' }],
        },
      ],
    };
    const out = adfToText(adf).trim();
    expect(out).toContain('一行目です。続き。');
    expect(out).toContain('二段落目。');
    // 段落境界で改行が入っている。
    expect(out.split('\n').length).toBeGreaterThanOrEqual(2);
  });
});

/** fetch を JSON レスポンス列でモックするヘルパ。呼ばれた URL/body を記録する。 */
function mockFetchSequence(
  responses: Array<{ ok?: boolean; status?: number; json: unknown }>,
) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  let i = 0;
  const fn = jest.fn(async (url: unknown, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const r = responses[Math.min(i, responses.length - 1)];
    i++;
    return {
      ok: r.ok ?? true,
      status: r.status ?? 200,
      json: async () => r.json,
      text: async () => JSON.stringify(r.json),
    } as unknown as Response;
  });
  global.fetch = fn as unknown as typeof fetch;
  return { calls, fn };
}

describe('Backlog 正規化: backlogListIssues', () => {
  afterEach(() => jest.restoreAllMocks());

  it('課題を NormalizedIssue へ畳み、parentIssueId を親課題キーに解決し、コメントを取り込む', async () => {
    // 1) resolveProjectId: GET /projects/{key}
    // 2) GET /issues（1ページ、最終ページ）
    // 3) 各課題の GET /issues/{key}/comments（includeComments:true）
    const { calls } = mockFetchSequence([
      { json: { id: 100, projectKey: 'IPLOT', name: 'IPLoT' } }, // project 解決
      {
        json: [
          {
            id: 2,
            issueKey: 'IPLOT-2',
            summary: '子課題',
            description: '本文2',
            status: { name: '処理中' },
            priority: { name: '高' },
            assignee: { id: 9, name: '担当者A' },
            startDate: '2026-01-01',
            dueDate: '2026-02-01',
            estimatedHours: 5,
            actualHours: 3,
            parentIssueId: 1,
          },
          {
            id: 1,
            issueKey: 'IPLOT-1',
            summary: '親課題',
            description: null,
            status: { name: '未対応' },
            priority: { name: '中' },
            assignee: null,
            parentIssueId: null,
          },
        ],
      },
      // comments for IPLOT-2
      {
        json: [
          { id: 11, content: 'コメント1', createdUser: { id: 9, name: '担当者A' }, created: '2026-01-02T00:00:00Z' },
          { id: 12, content: '   ', createdUser: { id: 9, name: '担当者A' }, created: '2026-01-03T00:00:00Z' }, // 空白のみ→除外
        ],
      },
      // comments for IPLOT-1
      { json: [] },
    ]);

    const issues = await backlogListIssues('iplot.backlog.com', 'KEY', 'IPLOT', {
      includeComments: true,
    });

    // 認証は ?apiKey= クエリで付く（Backlog 方式）。
    expect(calls[0].url).toContain('apiKey=KEY');

    expect(issues).toHaveLength(2);
    const child = issues.find((i) => i.externalKey === 'IPLOT-2')!;
    expect(child.title).toBe('子課題');
    expect(child.status).toBe('処理中'); // 原文（写像は import 側）
    expect(child.priority).toBe('高');
    expect(child.assigneeName).toBe('担当者A');
    expect(child.estimatedHours).toBe(5);
    expect(child.actualHours).toBe(3);
    // parentIssueId=1 → IPLOT-1 に解決
    expect(child.parentExternalKey).toBe('IPLOT-1');
    // 空白のみのコメントは除外され 1 件
    expect(child.comments).toHaveLength(1);
    expect(child.comments![0].body).toBe('コメント1');
    expect(child.comments![0].authorName).toBe('担当者A');

    const parent = issues.find((i) => i.externalKey === 'IPLOT-1')!;
    expect(parent.parentExternalKey).toBeNull();
  });
});

describe('Jira 正規化: jiraListIssues（新 /search/jql エンドポイント）', () => {
  afterEach(() => jest.restoreAllMocks());

  it('POST /rest/api/3/search/jql を使い、ADF/工数/親キーを正規化し、nextPageToken でページングする', async () => {
    const adfDesc = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Jira 本文' }] }],
    };
    const { calls } = mockFetchSequence([
      // page 1（nextPageToken あり）
      {
        json: {
          nextPageToken: 'TOKEN_2',
          isLast: false,
          issues: [
            {
              key: 'ABC-1',
              fields: {
                summary: '親',
                description: adfDesc,
                status: { name: 'In Progress' },
                priority: { name: 'High' },
                assignee: { displayName: 'Taro' },
                duedate: '2026-03-01',
                parent: null,
                timetracking: { originalEstimateSeconds: 7200, timeSpentSeconds: 3600 },
              },
            },
          ],
        },
      },
      // page 2（isLast:true で終端）
      {
        json: {
          isLast: true,
          issues: [
            {
              key: 'ABC-2',
              fields: {
                summary: '子',
                description: null,
                status: { name: 'Done' },
                priority: { name: 'Low' },
                assignee: null,
                parent: { key: 'ABC-1' },
              },
            },
          ],
        },
      },
      // comments for ABC-1
      {
        json: {
          comments: [
            {
              author: { displayName: 'Hanako' },
              body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'コメント本文' }] }] },
              created: '2026-03-02T00:00:00.000+0000',
            },
          ],
        },
      },
      // comments for ABC-2
      { json: { comments: [] } },
    ]);

    const issues = await jiraListIssues('https://x.atlassian.net', 'a@b.com', 'TOK', 'ABC', {
      includeComments: true,
    });

    // 旧 GET /search ではなく 新 /search/jql を POST で叩く
    const searchCall = calls.find((c) => c.url.includes('/rest/api/3/search/jql'));
    expect(searchCall).toBeDefined();
    expect(searchCall!.init?.method).toBe('POST');
    // Basic 認証ヘッダ（email:token の base64）
    const headers = (searchCall!.init?.headers ?? {}) as Record<string, string>;
    expect(headers.authorization).toMatch(/^Basic /);
    // 2 ページ取得している（nextPageToken が機能している）
    const searchCalls = calls.filter((c) => c.url.includes('/search/jql'));
    expect(searchCalls).toHaveLength(2);
    // 2 ページ目の body に nextPageToken が乗っている
    const page2Body = JSON.parse(String(searchCalls[1].init?.body));
    expect(page2Body.nextPageToken).toBe('TOKEN_2');

    expect(issues).toHaveLength(2);
    const parent = issues.find((i) => i.externalKey === 'ABC-1')!;
    expect(parent.description).toBe('Jira 本文'); // ADF が畳まれている
    expect(parent.status).toBe('In Progress');
    expect(parent.priority).toBe('High');
    expect(parent.assigneeName).toBe('Taro');
    expect(parent.dueDate).toBe('2026-03-01');
    expect(parent.estimatedHours).toBe(2); // 7200s / 3600
    expect(parent.actualHours).toBe(1); // 3600s / 3600
    expect(parent.parentExternalKey).toBeNull();
    expect(parent.comments).toHaveLength(1);
    expect(parent.comments![0].body).toBe('コメント本文');
    expect(parent.comments![0].authorName).toBe('Hanako');

    const child = issues.find((i) => i.externalKey === 'ABC-2')!;
    expect(child.parentExternalKey).toBe('ABC-1'); // subtask の親
    expect(child.startDate).toBeNull(); // Jira 標準に開始日は無い
  });
});
