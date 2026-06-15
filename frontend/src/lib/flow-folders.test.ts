import { describe, it, expect } from 'vitest';
import {
  buildFolderTree,
  folderBreadcrumb,
  childFolders,
  flowsInFolder,
  collectDescendantIds,
  type FlowFolder,
  type FolderFlow,
} from './flow-folders';

function folder(
  id: string,
  parentId: string | null,
  name: string,
  order = 0,
): FlowFolder {
  return {
    id,
    projectId: 'p',
    parentId,
    name,
    order,
    createdAt: '2020-01-01T00:00:00.000Z',
    updatedAt: '2020-01-01T00:00:00.000Z',
  };
}

function flow(id: string, folderId: string | null, name: string): FolderFlow {
  return {
    id,
    name,
    folderId,
    parentId: null,
    updatedAt: '2020-01-01T00:00:00.000Z',
  };
}

describe('buildFolderTree', () => {
  it('parentId で入れ子ツリーにし、order→name で並べ depth を振る', () => {
    const folders = [
      folder('b', null, 'B', 2),
      folder('a', null, 'A', 1),
      folder('a1', 'a', 'A-1', 1),
      folder('a0', 'a', 'A-0', 0),
    ];
    const tree = buildFolderTree(folders);
    expect(tree.map((n) => n.folder.id)).toEqual(['a', 'b']); // order 1,2
    expect(tree[0].depth).toBe(0);
    expect(tree[0].children.map((n) => n.folder.id)).toEqual(['a0', 'a1']);
    expect(tree[0].children[0].depth).toBe(1);
  });

  it('親が見つからない孤児はルート扱いにする（UIから消さない）', () => {
    const folders = [folder('x', 'missing', 'X')];
    const tree = buildFolderTree(folders);
    expect(tree.map((n) => n.folder.id)).toEqual(['x']);
  });
});

describe('folderBreadcrumb', () => {
  it('ルート→自身までのパンくず（自身含む）を返す', () => {
    const folders = [
      folder('root', null, 'Root'),
      folder('mid', 'root', 'Mid'),
      folder('leaf', 'mid', 'Leaf'),
    ];
    expect(folderBreadcrumb(folders, 'leaf').map((f) => f.id)).toEqual([
      'root',
      'mid',
      'leaf',
    ]);
  });

  it('folderId が null なら空配列', () => {
    expect(folderBreadcrumb([], null)).toEqual([]);
  });

  it('循環があっても無限ループしない', () => {
    const folders = [folder('a', 'b', 'A'), folder('b', 'a', 'B')];
    const crumb = folderBreadcrumb(folders, 'a');
    expect(crumb.length).toBeLessThanOrEqual(2);
  });
});

describe('childFolders', () => {
  it('直下の子だけを order→name 順で返す', () => {
    const folders = [
      folder('a', null, 'A', 1),
      folder('b', null, 'B', 0),
      folder('a1', 'a', 'A1'),
    ];
    expect(childFolders(folders, null).map((f) => f.id)).toEqual(['b', 'a']);
    expect(childFolders(folders, 'a').map((f) => f.id)).toEqual(['a1']);
  });
});

describe('flowsInFolder', () => {
  it('folderId 一致のフローを name 順で返す（null は未整理）', () => {
    const flows = [
      flow('1', 'f', 'い'),
      flow('2', 'f', 'あ'),
      flow('3', null, 'う'),
    ];
    expect(flowsInFolder(flows, 'f').map((f) => f.id)).toEqual(['2', '1']);
    expect(flowsInFolder(flows, null).map((f) => f.id)).toEqual(['3']);
  });
});

describe('collectDescendantIds', () => {
  it('自身と全子孫の id を返す（移動の循環防止用）', () => {
    const folders = [
      folder('a', null, 'A'),
      folder('a1', 'a', 'A1'),
      folder('a2', 'a', 'A2'),
      folder('a11', 'a1', 'A11'),
      folder('b', null, 'B'),
    ];
    const ids = collectDescendantIds(folders, 'a');
    expect(Array.from(ids).sort()).toEqual(['a', 'a1', 'a11', 'a2']);
    expect(ids.has('b')).toBe(false);
  });
});
