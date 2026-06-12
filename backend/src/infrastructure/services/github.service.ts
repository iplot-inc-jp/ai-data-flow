import { Injectable, Logger } from '@nestjs/common';

/**
 * GitHub REST API クライアント（raw fetch + Bearer、依存ゼロ）。
 * PAT(Personal Access Token)を Bearer に載せてアクセスする（OAuthではない）。
 */

const GH_API = 'https://api.github.com';

// 抽出対象とするソースファイルの拡張子。
const SOURCE_EXTENSIONS = [
  '.ts',
  '.js',
  '.py',
  '.rb',
  '.go',
  '.java',
  '.prisma',
  '.sql',
  '.yaml',
  '.yml',
];

// 走査対象から除外するディレクトリ（パスのセグメントに含まれていたらスキップ）。
const SKIP_DIRS = ['node_modules', 'dist', 'vendor'];

// 1ファイルあたりの最大サイズ（100KB）。
const MAX_FILE_BYTES = 100 * 1024;
// 取得するファイル数の上限。
const MAX_FILES = 40;
// 取得する総バイト数の上限（約300KB）。
const MAX_TOTAL_BYTES = 300 * 1024;

interface GitTreeEntry {
  path?: string;
  type?: string; // 'blob' | 'tree' | 'commit'
  size?: number;
  sha?: string;
}

@Injectable()
export class GithubService {
  private readonly logger = new Logger(GithubService.name);

  private headers(token: string): Record<string, string> {
    return {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'ai-data-flow',
    };
  }

  /** 指定ブランチの最新コミットSHAを取得する。 */
  async getLatestCommitSha(
    repoFullName: string,
    branch: string,
    token: string,
  ): Promise<string> {
    const res = await fetch(
      `${GH_API}/repos/${repoFullName}/commits/${encodeURIComponent(branch)}`,
      { headers: this.headers(token) },
    );
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(
        `GitHub: failed to get latest commit for ${repoFullName}@${branch} (${res.status}) ${body.slice(0, 200)}`,
      );
    }
    const j = (await res.json()) as { sha?: string };
    if (!j.sha) {
      throw new Error(`GitHub: commit response missing sha for ${repoFullName}@${branch}`);
    }
    return j.sha;
  }

  /**
   * リポジトリの再帰ツリーを取得し、ソースファイルだけを絞り込んで内容を取得する。
   * - 拡張子フィルタ + node_modules/dist/vendor 除外 + 100KB超は除外
   * - 合計で約40ファイル / 約300KB を上限にキャップ
   * - 各ファイルは contents API から base64 をデコードして取得
   */
  async fetchRelevantFiles(
    repoFullName: string,
    branch: string,
    token: string,
  ): Promise<{ path: string; content: string }[]> {
    const treeRes = await fetch(
      `${GH_API}/repos/${repoFullName}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
      { headers: this.headers(token) },
    );
    if (!treeRes.ok) {
      const body = await treeRes.text().catch(() => '');
      throw new Error(
        `GitHub: failed to get tree for ${repoFullName}@${branch} (${treeRes.status}) ${body.slice(0, 200)}`,
      );
    }
    const tree = (await treeRes.json()) as {
      tree?: GitTreeEntry[];
      truncated?: boolean;
    };

    const candidates = (tree.tree ?? [])
      .filter((e) => e.type === 'blob' && !!e.path)
      .filter((e) => this.isSourceFile(e.path as string))
      .filter((e) => !this.isSkipped(e.path as string))
      .filter((e) => (e.size ?? 0) <= MAX_FILE_BYTES)
      // スキーマ・型定義系を優先して拾えるよう軽くソート（短いパス＝上位を優先）。
      .sort((a, b) => (a.path as string).length - (b.path as string).length);

    const out: { path: string; content: string }[] = [];
    let totalBytes = 0;

    for (const entry of candidates) {
      if (out.length >= MAX_FILES) break;
      if (totalBytes >= MAX_TOTAL_BYTES) break;

      const path = entry.path as string;
      try {
        const content = await this.fetchFileContent(repoFullName, branch, path, token);
        if (content === null) continue;
        const bytes = Buffer.byteLength(content, 'utf8');
        if (bytes > MAX_FILE_BYTES) continue;
        if (totalBytes + bytes > MAX_TOTAL_BYTES) continue;
        out.push({ path, content });
        totalBytes += bytes;
      } catch (err) {
        this.logger.warn(`GitHub: skipping ${path}: ${(err as Error).message}`);
      }
    }

    this.logger.log(
      `GitHub: fetched ${out.length} files (~${Math.round(totalBytes / 1024)}KB) from ${repoFullName}@${branch}`,
    );
    return out;
  }

  /** contents API でファイル内容（base64）を取得しデコードする。 */
  private async fetchFileContent(
    repoFullName: string,
    branch: string,
    path: string,
    token: string,
  ): Promise<string | null> {
    const encodedPath = path
      .split('/')
      .map((seg) => encodeURIComponent(seg))
      .join('/');
    const res = await fetch(
      `${GH_API}/repos/${repoFullName}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`,
      { headers: this.headers(token) },
    );
    if (!res.ok) {
      throw new Error(`contents ${path} (${res.status})`);
    }
    const j = (await res.json()) as {
      content?: string;
      encoding?: string;
      type?: string;
    };
    if (j.type !== 'file' || typeof j.content !== 'string') return null;
    if (j.encoding === 'base64') {
      return Buffer.from(j.content, 'base64').toString('utf8');
    }
    return j.content;
  }

  private isSourceFile(path: string): boolean {
    const lower = path.toLowerCase();
    return SOURCE_EXTENSIONS.some((ext) => lower.endsWith(ext));
  }

  private isSkipped(path: string): boolean {
    const segments = path.split('/');
    return segments.some((seg) => SKIP_DIRS.includes(seg));
  }
}
