'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Layers, Search, X } from 'lucide-react';
import type { SubProjectMaster } from '@/lib/masters';

/**
 * 領域（SubProject）の共通ピッカー。
 * - 検索可能（マッチした領域とその祖先だけをツリー表示）
 * - 親子関係をインデント＋開閉つきツリーで表示
 * - ボタンクリックで開くインラインモーダル（ポップオーバー）
 *
 * value:
 *   ''        … 未選択（フィルタ用途では「すべて」）
 *   noneValue … 「（未設定）」を選択（noneValue prop を渡した場合のみ表示）
 *   その他    … SubProject の id
 */
interface SubProjectPickerProps {
  subProjects: SubProjectMaster[];
  value: string;
  onChange: (value: string) => void;
  /** フィルタ用「（未設定）」の内部値（例: '__NONE__'）。未指定なら項目を出さない */
  noneValue?: string;
  /** 未選択時にボタンへ出す文言 */
  placeholder?: string;
  /** 「すべて」（=未選択 ''）の選択肢を出すか（フィルタ用途） */
  allowAll?: boolean;
  className?: string;
  disabled?: boolean;
}

interface TreeNode extends SubProjectMaster {
  children: TreeNode[];
}

function buildTree(items: SubProjectMaster[]): TreeNode[] {
  const byId = new Map<string, TreeNode>();
  items.forEach((s) => byId.set(s.id, { ...s, children: [] }));
  const roots: TreeNode[] = [];
  for (const node of Array.from(byId.values())) {
    const parent = node.parentId ? byId.get(node.parentId) : undefined;
    if (parent && parent.id !== node.id) parent.children.push(node);
    else roots.push(node);
  }
  const sortRec = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, 'ja'));
    nodes.forEach((n) => sortRec(n.children));
  };
  sortRec(roots);
  return roots;
}

/** 選択中領域の「親 / 子」パス表示を作る */
export function subProjectPath(
  id: string | null | undefined,
  subProjects: SubProjectMaster[]
): string {
  if (!id) return '';
  const byId = new Map(subProjects.map((s) => [s.id, s]));
  const parts: string[] = [];
  let cur = byId.get(id);
  const seen = new Set<string>();
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    parts.unshift(cur.name);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return parts.join(' / ');
}

/** 指定領域の子孫 id 集合（自身を含む）。親で絞ると配下も含めたい場面で使う */
export function collectSubProjectDescendants(
  id: string,
  subProjects: SubProjectMaster[]
): Set<string> {
  const childrenByParent = new Map<string, string[]>();
  subProjects.forEach((s) => {
    if (!s.parentId) return;
    const arr = childrenByParent.get(s.parentId) ?? [];
    arr.push(s.id);
    childrenByParent.set(s.parentId, arr);
  });
  const out = new Set<string>([id]);
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const c of childrenByParent.get(cur) ?? []) {
      if (!out.has(c)) {
        out.add(c);
        stack.push(c);
      }
    }
  }
  return out;
}

export function SubProjectPicker({
  subProjects,
  value,
  onChange,
  noneValue,
  placeholder = '領域を選択',
  allowAll = false,
  className = '',
  disabled = false,
}: SubProjectPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const tree = useMemo(() => buildTree(subProjects), [subProjects]);

  // 検索: マッチした領域とその祖先を残す（階層が崩れないように）
  const visibleIds = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null; // null = 全件
    const byId = new Map(subProjects.map((s) => [s.id, s]));
    const keep = new Set<string>();
    for (const s of subProjects) {
      if (s.name.toLowerCase().includes(q)) {
        keep.add(s.id);
        let p = s.parentId;
        while (p && byId.has(p) && !keep.has(p)) {
          keep.add(p);
          p = byId.get(p)!.parentId;
        }
      }
    }
    return keep;
  }, [query, subProjects]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    // 開いたら検索へフォーカス
    setTimeout(() => searchRef.current?.focus(), 0);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const selectedLabel =
    value === '' ? '' : noneValue && value === noneValue ? '（未設定）' : subProjectPath(value, subProjects);

  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
    setQuery('');
  };

  const toggleCollapse = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const renderNode = (node: TreeNode, depth: number): React.ReactNode => {
    if (visibleIds && !visibleIds.has(node.id)) return null;
    const hasChildren = node.children.length > 0;
    const isCollapsed = collapsed.has(node.id) && !query.trim();
    const isSelected = value === node.id;
    return (
      <div key={node.id}>
        <div
          className={`flex items-center gap-1 rounded px-1.5 py-1 text-sm cursor-pointer hover:bg-blue-50 ${
            isSelected ? 'bg-blue-100 text-blue-800 font-medium' : 'text-gray-700'
          }`}
          style={{ paddingLeft: depth * 16 + 6 }}
          onClick={() => pick(node.id)}
        >
          {hasChildren ? (
            <button
              type="button"
              className="shrink-0 text-gray-400 hover:text-gray-600"
              onClick={(e) => {
                e.stopPropagation();
                toggleCollapse(node.id);
              }}
              aria-label={isCollapsed ? '展開' : '折りたたみ'}
            >
              {isCollapsed ? (
                <ChevronRight className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </button>
          ) : (
            <span className="w-3.5 shrink-0" />
          )}
          <Layers className="h-3.5 w-3.5 shrink-0 text-gray-400" />
          <span className="truncate">{node.name}</span>
        </div>
        {!isCollapsed && node.children.map((c) => renderNode(c, depth + 1))}
      </div>
    );
  };

  return (
    <div ref={rootRef} className={`relative inline-block ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex h-9 min-w-[140px] max-w-[240px] items-center justify-between gap-1 rounded-md border border-gray-300 bg-white px-2.5 text-sm hover:border-gray-400 disabled:opacity-50 ${
          selectedLabel ? 'text-gray-900' : 'text-gray-400'
        }`}
      >
        <span className="truncate">{selectedLabel || placeholder}</span>
        <span className="flex items-center gap-0.5 shrink-0">
          {value !== '' && !disabled && (
            <X
              className="h-3.5 w-3.5 text-gray-400 hover:text-gray-600"
              onClick={(e) => {
                e.stopPropagation();
                pick('');
              }}
              aria-label="クリア"
            />
          )}
          <ChevronDown className="h-4 w-4 text-gray-400" />
        </span>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-[280px] rounded-md border border-gray-200 bg-white shadow-lg">
          <div className="flex items-center gap-1.5 border-b border-gray-100 px-2.5 py-2">
            <Search className="h-3.5 w-3.5 shrink-0 text-gray-400" />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="領域名で検索"
              className="w-full bg-transparent text-sm outline-none placeholder:text-gray-400"
            />
            {query && (
              <button type="button" onClick={() => setQuery('')} aria-label="検索をクリア">
                <X className="h-3.5 w-3.5 text-gray-400 hover:text-gray-600" />
              </button>
            )}
          </div>
          <div className="max-h-[280px] overflow-y-auto p-1.5">
            {allowAll && (
              <div
                className={`rounded px-1.5 py-1 pl-[26px] text-sm cursor-pointer hover:bg-blue-50 ${
                  value === '' ? 'bg-blue-100 text-blue-800 font-medium' : 'text-gray-500'
                }`}
                onClick={() => pick('')}
              >
                すべて
              </div>
            )}
            {noneValue && (
              <div
                className={`rounded px-1.5 py-1 pl-[26px] text-sm cursor-pointer hover:bg-blue-50 ${
                  value === noneValue ? 'bg-blue-100 text-blue-800 font-medium' : 'text-gray-500'
                }`}
                onClick={() => pick(noneValue)}
              >
                （未設定）
              </div>
            )}
            {tree.length === 0 ? (
              <p className="px-2 py-3 text-center text-xs text-gray-400">領域がありません</p>
            ) : (
              tree.map((n) => renderNode(n, 0))
            )}
            {visibleIds && visibleIds.size === 0 && (
              <p className="px-2 py-3 text-center text-xs text-gray-400">
                「{query}」に一致する領域がありません
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
