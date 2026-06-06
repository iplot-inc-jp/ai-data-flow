import { describe, it, expect } from 'vitest';
import {
  parseIssueMarkdown,
  serializeIssueTree,
  flattenIssueTree,
} from './issue-markdown';

describe('parseIssueMarkdown', () => {
  it('見出しを rootQuestion(title) として取り込む', () => {
    const { title, nodes } = parseIssueMarkdown('# なぜ緊急発注が増える？\n- 欠品が起きる');
    expect(title).toBe('なぜ緊急発注が増える？');
    expect(nodes).toHaveLength(1);
    expect(nodes[0].label).toBe('欠品が起きる');
  });

  it('インデント2スペースで階層を作る', () => {
    const md = ['- A', '  - A-1', '  - A-2', '    - A-2-1', '- B'].join('\n');
    const { nodes } = parseIssueMarkdown(md);
    expect(nodes.map((n) => n.label)).toEqual(['A', 'B']);
    expect(nodes[0].children.map((n) => n.label)).toEqual(['A-1', 'A-2']);
    expect(nodes[0].children[1].children[0].label).toBe('A-2-1');
  });

  it('検証マーク ○×△? を verification に変換する', () => {
    const md = ['- [○] 確定', '- [×] 否定', '- [△] 未確認', '- [?] 要確認'].join('\n');
    const { nodes } = parseIssueMarkdown(md);
    expect(nodes.map((n) => n.verification)).toEqual([
      'CONFIRMED', 'REJECTED', 'UNKNOWN', 'NEEDS_HEARING',
    ]);
  });

  it('【未確認/要ヒアリング】プレフィックスは NEEDS_HEARING かつラベルから除去', () => {
    const { nodes } = parseIssueMarkdown('- 【未確認/要ヒアリング】承認が遅れる');
    expect(nodes[0].verification).toBe('NEEDS_HEARING');
    expect(nodes[0].label).toBe('承認が遅れる');
  });

  it('打ち手型の採用/保留/不採用を recommendation に変換する', () => {
    const md = ['- [採用] EDI連携', '- [保留] 内製化', '- [不採用] 手動運用'].join('\n');
    const { nodes } = parseIssueMarkdown(md);
    expect(nodes.map((n) => n.recommendation)).toEqual(['ADOPT', 'HOLD', 'REJECT']);
  });

  it('@type:value リンクを抽出しラベルから除去する', () => {
    const { nodes } = parseIssueMarkdown('- [○] 入荷遅れ @table:suppliers @flow:f1');
    expect(nodes[0].label).toBe('入荷遅れ');
    expect(nodes[0].links).toEqual([
      { type: 'table', value: 'suppliers' },
      { type: 'flow', value: 'f1' },
    ]);
  });

  it('" :: " 以降を evidence として取り込む', () => {
    const { nodes } = parseIssueMarkdown('- [○] 入荷遅れ :: 実LT平均9日(公称5日)');
    expect(nodes[0].label).toBe('入荷遅れ');
    expect(nodes[0].evidence).toBe('実LT平均9日(公称5日)');
  });
});

describe('serializeIssueTree', () => {
  it('verification を記号に戻す', () => {
    const md = serializeIssueTree(
      [{ label: '確定', verification: 'CONFIRMED', recommendation: 'NA', links: [], children: [] }],
      'タイトル',
    );
    expect(md).toContain('# タイトル');
    expect(md).toContain('- [○] 確定');
  });

  it('入れ子を2スペースインデントで出力', () => {
    const md = serializeIssueTree([
      {
        label: 'A', verification: 'NA', recommendation: 'NA', links: [], children: [
          { label: 'A-1', verification: 'NA', recommendation: 'NA', links: [], children: [] },
        ],
      },
    ]);
    expect(md).toBe('- A\n  - A-1');
  });
});

describe('round-trip', () => {
  it('parse → serialize → parse が同型になる', () => {
    const original = [
      '# なぜ緊急発注が増える？',
      '',
      '- [○] 欠品が起きる @table:inventory',
      '  - [△] 入荷が遅れる :: 仕入先LT超過',
      '  - [×] 発注点が低い',
      '- [?] 承認が遅れる',
    ].join('\n');
    const first = parseIssueMarkdown(original);
    const round = parseIssueMarkdown(serializeIssueTree(first.nodes, first.title));
    expect(round).toEqual(first);
  });
});

describe('flattenIssueTree', () => {
  it('深さ優先で parentIndex 付きに平坦化する', () => {
    const { nodes } = parseIssueMarkdown(['- A', '  - A1', '  - A2', '- B'].join('\n'));
    const flat = flattenIssueTree(nodes);
    expect(flat.map((f) => f.node.label)).toEqual(['A', 'A1', 'A2', 'B']);
    expect(flat.map((f) => f.depth)).toEqual([0, 1, 1, 0]);
    expect(flat.map((f) => f.parentIndex)).toEqual([null, 0, 0, null]);
    expect(flat[1].order).toBe(0);
    expect(flat[2].order).toBe(1);
  });
});
