'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  ArrowLeft,
  FileCode,
  Loader2,
  Eye,
  Users,
  Wand2,
  AlertCircle,
} from 'lucide-react';
import { SwimlaneCanvas } from '@/components/flow-editor/SwimlaneCanvas';
import type { FlowData, Role } from '@/components/flow-editor/flow-types';
import { HelpTooltip } from '@/components/ui/help-tooltip';
import { HowToPanel } from '@/components/ui/how-to-panel';
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts';
import mermaid from 'mermaid';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5021';

// Mermaid初期化
if (typeof window !== 'undefined') {
  mermaid.initialize({
    startOnLoad: false,
    theme: 'default',
    securityLevel: 'loose',
  });
}

export default function ProjectFlowDetailPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as string;
  const flowId = params.flowId as string;

  const [flowData, setFlowData] = useState<FlowData | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [flowHistory, setFlowHistory] = useState<string[]>([]);
  const [mermaidCode, setMermaidCode] = useState<string | null>(null);
  const [showMermaid, setShowMermaid] = useState(false);

  // 表示ロール選択（フローごとに localStorage 永続化）
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[] | null>(null);
  const [showRolePanel, setShowRolePanel] = useState(false);
  const rolePanelRef = useRef<HTMLDivElement | null>(null);

  // ロールのチェックを外したとき、そのロールに属するノードを再割当するダイアログ
  const [reassign, setReassign] = useState<{
    roleId: string;
    nodes: { id: string; label: string; targetRoleId: string }[];
  } | null>(null);
  const [reassignBusy, setReassignBusy] = useState(false);

  // Mermaid から生成ダイアログ
  const [showMermaidImport, setShowMermaidImport] = useState(false);
  const [mermaidImportText, setMermaidImportText] = useState('');
  const [mermaidImporting, setMermaidImporting] = useState(false);
  const [mermaidImportError, setMermaidImportError] = useState<string | null>(null);

  const howToRef = useRef<HTMLDivElement | null>(null);

  const getHeaders = useCallback(() => {
    const token = localStorage.getItem('accessToken');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
  }, []);

  // フローデータを取得
  const fetchFlowData = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);

    try {
      const headers = getHeaders();

      // フローデータ取得
      const flowRes = await fetch(`${API_URL}/api/business-flows/${id}`, { headers });
      if (!flowRes.ok) throw new Error('Failed to fetch flow data');
      const flow = await flowRes.json();

      // ロール取得
      const rolesRes = await fetch(`${API_URL}/api/roles/project/${projectId}`, { headers });
      if (rolesRes.ok) {
        const rolesData = await rolesRes.json();
        setRoles(rolesData);
      }

      setFlowData(flow);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [projectId, getHeaders]);

  // Mermaid出力取得
  const fetchMermaid = useCallback(async () => {
    if (!flowData) return;

    try {
      const headers = getHeaders();
      const res = await fetch(`${API_URL}/api/business-flows/${flowData.id}/mermaid`, { headers });
      if (res.ok) {
        const data = await res.json();
        setMermaidCode(data.mermaid);
        setShowMermaid(true);
      }
    } catch (err) {
      console.error('Failed to fetch mermaid:', err);
    }
  }, [flowData, getHeaders]);

  // 初期読み込み
  useEffect(() => {
    if (flowId) {
      fetchFlowData(flowId);
      setFlowHistory([flowId]);
    }
  }, [flowId, fetchFlowData]);

  // 子フローへナビゲート
  const handleNodeDoubleClick = useCallback(
    (nodeId: string, childFlowId?: string) => {
      if (childFlowId) {
        setFlowHistory((prev) => [...prev, childFlowId]);
        fetchFlowData(childFlowId);
      }
    },
    [fetchFlowData]
  );

  // 親フローへ戻る
  const handleBack = useCallback(() => {
    if (flowHistory.length > 1) {
      const newHistory = [...flowHistory];
      newHistory.pop();
      const parentId = newHistory[newHistory.length - 1];
      setFlowHistory(newHistory);
      fetchFlowData(parentId);
    }
  }, [flowHistory, fetchFlowData]);

  // フロー情報の更新
  const handleFlowUpdate = useCallback(
    async (id: string, name: string, description?: string) => {
      try {
        const headers = getHeaders();
        const res = await fetch(`${API_URL}/api/business-flows/${id}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify({ name, description }),
        });

        if (!res.ok) throw new Error('Failed to update flow');
        fetchFlowData(id);
      } catch (err) {
        console.error('Failed to update flow:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
      }
    },
    [fetchFlowData, getHeaders]
  );

  // エッジラベル更新
  const handleEdgeLabelUpdate = useCallback(
    async (edgeId: string, label: string) => {
      if (!flowData) return;
      try {
        const headers = getHeaders();
        const res = await fetch(`${API_URL}/api/business-flows/${flowData.id}/edges/${edgeId}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify({ label }),
        });

        if (!res.ok) throw new Error('Failed to update edge label');
        fetchFlowData(flowData.id);
      } catch (err) {
        console.error('Failed to update edge label:', err);
      }
    },
    [flowData, fetchFlowData, getHeaders]
  );

  // ノードロール更新
  const handleNodeRoleUpdate = useCallback(
    async (nodeId: string, roleId: string) => {
      if (!flowData) return;
      try {
        const headers = getHeaders();
        const res = await fetch(`${API_URL}/api/business-flows/${flowData.id}/nodes/${nodeId}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify({ roleId }),
        });

        if (!res.ok) throw new Error('Failed to update node role');
        fetchFlowData(flowData.id);
      } catch (err) {
        console.error('Failed to update node role:', err);
      }
    },
    [flowData, fetchFlowData, getHeaders]
  );

  // ノード更新（ラベル/種別/ロール/並び順/メタデータ）
  // SwimlaneCanvas が右サイドバー保存・ドラッグ完了（order/roleId 変更）で呼ぶ
  const handleNodeUpdate = useCallback(
    async (
      nodeId: string,
      patch: {
        label?: string;
        type?: string;
        roleId?: string;
        order?: number;
        metadata?: Record<string, unknown>;
      }
    ) => {
      if (!flowData) return;
      try {
        const headers = getHeaders();
        const res = await fetch(`${API_URL}/api/business-flows/${flowData.id}/nodes/${nodeId}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify(patch),
        });

        if (!res.ok) throw new Error('Failed to update node');
        fetchFlowData(flowData.id);
      } catch (err) {
        console.error('Failed to update node:', err);
      }
    },
    [flowData, fetchFlowData, getHeaders]
  );

  // ノード作成（構造ベース：位置はサーバ側0固定、描画は自動レイアウト）
  const handleNodeCreate = useCallback(
    async (input: { type: string; roleId?: string; afterNodeId?: string }) => {
      if (!flowData) return;
      const { type, roleId } = input;
      try {
        const headers = getHeaders();
        const res = await fetch(`${API_URL}/api/business-flows/${flowData.id}/nodes`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            type,
            label: type === 'DECISION' ? '条件分岐' : type === 'SYSTEM_INTEGRATION' ? 'システム連携' : '新規処理',
            positionX: 0,
            positionY: 0,
            ...(roleId ? { roleId } : {}),
          }),
        });

        if (!res.ok) throw new Error('Failed to create node');
        fetchFlowData(flowData.id);
      } catch (err) {
        console.error('Failed to create node:', err);
      }
    },
    [flowData, fetchFlowData, getHeaders]
  );

  // ノード削除
  const handleNodeDelete = useCallback(
    async (nodeId: string) => {
      if (!flowData) return;
      try {
        const headers = getHeaders();
        const res = await fetch(`${API_URL}/api/business-flows/${flowData.id}/nodes/${nodeId}`, {
          method: 'DELETE',
          headers,
        });

        if (!res.ok) throw new Error('Failed to delete node');
        fetchFlowData(flowData.id);
      } catch (err) {
        console.error('Failed to delete node:', err);
      }
    },
    [flowData, fetchFlowData, getHeaders]
  );

  // エッジ作成
  const handleEdgeCreate = useCallback(
    async (sourceNodeId: string, targetNodeId: string) => {
      if (!flowData) return;
      try {
        const headers = getHeaders();
        const res = await fetch(`${API_URL}/api/business-flows/${flowData.id}/edges`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ sourceNodeId, targetNodeId }),
        });

        if (!res.ok) throw new Error('Failed to create edge');
        fetchFlowData(flowData.id);
      } catch (err) {
        console.error('Failed to create edge:', err);
      }
    },
    [flowData, fetchFlowData, getHeaders]
  );

  // エッジ削除（ノード位置を維持するためローカルで更新）
  const handleEdgeDelete = useCallback(
    async (edgeId: string) => {
      if (!flowData) return;
      try {
        const headers = getHeaders();
        const res = await fetch(`${API_URL}/api/business-flows/${flowData.id}/edges/${edgeId}`, {
          method: 'DELETE',
          headers,
        });

        if (!res.ok) throw new Error('Failed to delete edge');
        
        // ノード位置を維持するためローカルでエッジを削除
        setFlowData((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            edges: prev.edges.filter((e) => e.id !== edgeId),
          };
        });
      } catch (err) {
        console.error('Failed to delete edge:', err);
      }
    },
    [flowData, getHeaders]
  );

  // 子フロー作成
  const handleChildFlowCreate = useCallback(
    async (nodeId: string, name?: string) => {
      if (!flowData) return;
      try {
        const headers = getHeaders();
        const res = await fetch(`${API_URL}/api/business-flows/${flowData.id}/nodes/${nodeId}/child-flow`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ name: name || '詳細フロー' }),
        });

        if (!res.ok) throw new Error('Failed to create child flow');
        const data = await res.json();
        
        // 子フローに移動
        if (data.childFlow?.id) {
          setFlowHistory((prev) => [...prev, data.childFlow.id]);
          fetchFlowData(data.childFlow.id);
        }
      } catch (err) {
        console.error('Failed to create child flow:', err);
      }
    },
    [flowData, fetchFlowData, getHeaders]
  );

  // ===========================================
  // 表示ロール選択（フローごと localStorage 永続化）
  // ===========================================
  const rolesStorageKey = useMemo(() => `flow-roles-${flowId}`, [flowId]);

  // roles 取得・flow 切替時に選択状態を初期化（保存値があれば復元、無ければ全選択）
  useEffect(() => {
    if (roles.length === 0) {
      setSelectedRoleIds(null);
      return;
    }
    const allIds = roles.map((r) => r.id);
    let next = allIds;
    try {
      const raw = localStorage.getItem(rolesStorageKey);
      if (raw) {
        const saved = JSON.parse(raw) as string[];
        if (Array.isArray(saved)) {
          // 既に存在するロールのみに絞り込む
          const filtered = saved.filter((id) => allIds.includes(id));
          next = filtered.length > 0 ? filtered : allIds;
        }
      }
    } catch {
      next = allIds;
    }
    setSelectedRoleIds(next);
  }, [roles, rolesStorageKey]);

  // 表示対象のロール（選択中のみ）
  const visibleRoles = useMemo(() => {
    if (selectedRoleIds === null) return roles;
    const set = new Set(selectedRoleIds);
    return roles.filter((r) => set.has(r.id));
  }, [roles, selectedRoleIds]);

  // 選択状態を保存しつつ更新
  const persistSelectedRoles = useCallback(
    (ids: string[]) => {
      setSelectedRoleIds(ids);
      try {
        localStorage.setItem(rolesStorageKey, JSON.stringify(ids));
      } catch {
        /* noop */
      }
    },
    [rolesStorageKey]
  );

  // ロールのチェック切替
  const toggleRole = useCallback(
    (roleId: string, checked: boolean) => {
      const current = selectedRoleIds ?? roles.map((r) => r.id);

      if (checked) {
        persistSelectedRoles(Array.from(new Set([...current, roleId])));
        return;
      }

      // 外す場合：このフロー内で当該ロールに割り当てられたノードがあるか確認
      const affected = (flowData?.nodes ?? []).filter((n) => n.roleId === roleId);
      if (affected.length === 0) {
        persistSelectedRoles(current.filter((id) => id !== roleId));
        return;
      }

      // 再割当先候補（外そうとしているロール以外）
      const otherRoles = roles.filter((r) => r.id !== roleId);
      const defaultTarget = otherRoles[0]?.id ?? '';
      setReassign({
        roleId,
        nodes: affected.map((n) => ({
          id: n.id,
          label: n.label,
          targetRoleId: defaultTarget,
        })),
      });
    },
    [selectedRoleIds, roles, flowData, persistSelectedRoles]
  );

  // 再割当ダイアログの確定：各ノードの roleId を更新 → 再取得 → チェックを外す
  const handleReassignConfirm = useCallback(async () => {
    if (!reassign || !flowData) return;
    setReassignBusy(true);
    try {
      const headers = getHeaders();
      for (const node of reassign.nodes) {
        if (!node.targetRoleId || node.targetRoleId === reassign.roleId) continue;
        const res = await fetch(`${API_URL}/api/business-flows/${flowData.id}/nodes/${node.id}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify({ roleId: node.targetRoleId }),
        });
        if (!res.ok) throw new Error('Failed to reassign node role');
      }

      const removedRoleId = reassign.roleId;
      setReassign(null);
      // 当該ロールのチェックを外す
      const current = selectedRoleIds ?? roles.map((r) => r.id);
      persistSelectedRoles(current.filter((id) => id !== removedRoleId));
      // 再取得（再割当の反映）
      fetchFlowData(flowData.id);
    } catch (err) {
      console.error('Failed to reassign nodes:', err);
    } finally {
      setReassignBusy(false);
    }
  }, [reassign, flowData, getHeaders, selectedRoleIds, roles, persistSelectedRoles, fetchFlowData]);

  // ===========================================
  // Mermaid から生成（import）
  // ===========================================
  const handleMermaidImport = useCallback(async () => {
    if (!flowData || !mermaidImportText.trim()) return;
    setMermaidImporting(true);
    setMermaidImportError(null);
    try {
      const headers = getHeaders();
      const res = await fetch(`${API_URL}/api/business-flows/${flowData.id}/import-mermaid`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ mermaid: mermaidImportText }),
      });
      if (!res.ok) {
        let msg = 'Mermaidの取り込みに失敗しました';
        try {
          const body = await res.json();
          if (body?.message) msg = Array.isArray(body.message) ? body.message.join(', ') : body.message;
        } catch {
          /* noop */
        }
        throw new Error(msg);
      }
      setShowMermaidImport(false);
      setMermaidImportText('');
      fetchFlowData(flowData.id);
    } catch (err) {
      setMermaidImportError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setMermaidImporting(false);
    }
  }, [flowData, mermaidImportText, getHeaders, fetchFlowData]);

  // キーボードショートカット
  // ⌘/Ctrl+S … ブラウザ保存を抑止しつつ Mermaid出力（フローはノード編集時に自動保存される）
  // ⌘/Ctrl+I … mermaidから生成、Shift+/（?） … 操作方法
  useKeyboardShortcuts([
    {
      combo: 'shift+/',
      handler: () => howToRef.current?.querySelector('button')?.click(),
    },
    {
      combo: 'mod+s',
      whenTyping: true,
      handler: () => {
        if (flowData) fetchMermaid();
      },
    },
    {
      combo: 'mod+i',
      whenTyping: true,
      handler: () => {
        setMermaidImportError(null);
        setShowMermaidImport(true);
      },
    },
  ]);

  // ロールパネル外クリックで閉じる
  useEffect(() => {
    if (!showRolePanel) return;
    const onDown = (e: MouseEvent) => {
      if (rolePanelRef.current && !rolePanelRef.current.contains(e.target as Node)) {
        setShowRolePanel(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [showRolePanel]);

  // Mermaidプレビュー用のレンダリング
  const [mermaidSvg, setMermaidSvg] = useState<string | null>(null);

  const renderMermaid = useCallback(async () => {
    if (!mermaidCode) return;
    try {
      const { svg } = await mermaid.render('mermaid-preview', mermaidCode);
      setMermaidSvg(svg);
    } catch (err) {
      console.error('Failed to render mermaid:', err);
      setMermaidSvg(null);
    }
  }, [mermaidCode]);

  useEffect(() => {
    if (showMermaid && mermaidCode) {
      renderMermaid();
    }
  }, [showMermaid, mermaidCode, renderMermaid]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[600px]">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <Link href={`/dashboard/projects/${projectId}/flows`}>
          <Button variant="ghost" className="text-gray-600">
            <ArrowLeft className="w-4 h-4 mr-2" />
            フロー一覧に戻る
          </Button>
        </Link>
        <Card className="bg-white border-red-200">
          <CardContent className="py-8 text-center">
            <p className="text-red-600">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!flowData) {
    return (
      <div className="space-y-4">
        <Link href={`/dashboard/projects/${projectId}/flows`}>
          <Button variant="ghost" className="text-gray-600">
            <ArrowLeft className="w-4 h-4 mr-2" />
            フロー一覧に戻る
          </Button>
        </Link>
        <Card className="bg-white border-gray-200">
          <CardContent className="py-8 text-center">
            <p className="text-gray-500">フローが見つかりません</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 h-full">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link href={`/dashboard/projects/${projectId}/flows`}>
            <Button variant="ghost" className="text-gray-600">
              <ArrowLeft className="w-4 h-4 mr-2" />
              フロー一覧
            </Button>
          </Link>
          <span className="hidden items-center gap-1.5 text-sm font-medium text-gray-700 sm:inline-flex">
            業務フロー編集
            <HelpTooltip text="役割（ロール）ごとのスイムレーン上で処理を並べ、矢印でつなぐ図です。ノードのドラッグでロール移動・並び替えができ、ダブルクリックで子フローに潜れます。" />
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* 操作ガイド */}
          <div ref={howToRef}>
            <HowToPanel
              title="業務フロー編集の使い方"
              steps={[
                'ノードをドラッグすると、別のロール（スイムレーン）への移動や並び替えができます。',
                'ノードのハンドルから別のノードへドラッグすると矢印（接続）を引けます。ノードを選ぶと右パネルでラベル・種別を編集できます。',
                '右上のツールバーで縦／横の向きを切り替え、PNG出力で図を画像として保存できます。',
                '「mermaidから生成」で Mermaid 記法を貼り付けて一括作成、「Mermaid出力」で図を Mermaid コードとして書き出せます。',
                '「ロール」で表示するスイムレーンを絞り込み。ノードをダブルクリックすると子フローへ移動します。',
              ]}
              shortcuts={[
                { keys: '⌘/Ctrl+S', desc: 'Mermaid出力を開く（自動保存のため上書き保存は不要）' },
                { keys: '⌘/Ctrl+I', desc: 'mermaidから生成ダイアログを開く' },
                { keys: 'Shift+/（?）', desc: 'この操作方法を開く' },
              ]}
            />
          </div>
          {/* ロール表示選択 */}
          <div className="relative" ref={rolePanelRef}>
            <Button
              variant="outline"
              onClick={() => setShowRolePanel((v) => !v)}
              className="text-gray-600"
            >
              <Users className="w-4 h-4 mr-2" />
              ロール
              {selectedRoleIds && roles.length > 0 && (
                <span className="ml-2 text-xs text-gray-500">
                  {selectedRoleIds.length}/{roles.length}
                </span>
              )}
            </Button>
            {showRolePanel && (
              <div className="absolute right-0 top-full mt-2 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-50 p-3">
                <div className="mb-2 flex items-center gap-1.5 text-sm font-medium text-gray-700">
                  表示するロール
                  <HelpTooltip text="ロールはスイムレーン（担当者・部署）です。チェックを外すと、そのレーンを図から非表示にできます（割り当て済みノードは再割当を求められます）。" />
                </div>
                {roles.length === 0 ? (
                  <p className="text-xs text-gray-400 py-2">ロールがありません</p>
                ) : (
                  <div className="space-y-1 max-h-72 overflow-auto">
                    {roles.map((r) => {
                      const checked = selectedRoleIds
                        ? selectedRoleIds.includes(r.id)
                        : true;
                      return (
                        <label
                          key={r.id}
                          className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => toggleRole(r.id, e.target.checked)}
                            className="rounded border-gray-300"
                          />
                          <span
                            className="inline-block w-3 h-3 rounded-sm shrink-0"
                            style={{ backgroundColor: r.color }}
                          />
                          <span className="text-sm text-gray-800 truncate">{r.name}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
                <div className="mt-3 pt-2 border-t border-gray-100 flex justify-end">
                  <button
                    type="button"
                    className="text-xs text-blue-600 hover:underline"
                    onClick={() => persistSelectedRoles(roles.map((rr) => rr.id))}
                  >
                    すべて表示
                  </button>
                </div>
              </div>
            )}
          </div>
          <Button
            variant="outline"
            onClick={() => {
              setMermaidImportError(null);
              setShowMermaidImport(true);
            }}
            className="text-gray-600"
          >
            <Wand2 className="w-4 h-4 mr-2" />
            mermaidから生成
          </Button>
          <Button variant="outline" onClick={fetchMermaid} className="text-gray-600">
            <FileCode className="w-4 h-4 mr-2" />
            Mermaid出力
          </Button>
        </div>
      </div>

      {/* フロービューアー */}
      <div className="h-[calc(100vh-200px)] border border-gray-200 rounded-lg overflow-hidden">
        <SwimlaneCanvas
          flowData={flowData}
          roles={visibleRoles}
          onBack={flowHistory.length > 1 ? handleBack : undefined}
          onUpdateFlow={handleFlowUpdate}
          onCreateNode={handleNodeCreate}
          onConnectNodes={handleEdgeCreate}
          onDeleteNode={handleNodeDelete}
          onDeleteEdge={handleEdgeDelete}
          onUpdateEdgeLabel={handleEdgeLabelUpdate}
          onChangeNodeRole={handleNodeRoleUpdate}
          onUpdateNode={handleNodeUpdate}
          onCreateChildFlow={handleChildFlowCreate}
          onOpenChildFlow={handleNodeDoubleClick}
          onAddRole={() => router.push(`/dashboard/projects/${projectId}/roles`)}
        />
      </div>

      {/* Mermaidモーダル（プレビュー機能付き） */}
      {showMermaid && mermaidCode && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[85vh] overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h3 className="font-bold text-gray-900">Mermaid出力</h3>
              <Button variant="ghost" size="sm" onClick={() => setShowMermaid(false)}>
                ✕
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-4 p-4 overflow-auto max-h-[65vh]">
              {/* コード */}
              <div>
                <div className="text-sm font-medium text-gray-700 mb-2">コード</div>
                <pre className="bg-gray-50 p-4 rounded-lg text-xs overflow-auto max-h-[50vh] border border-gray-200">
                  <code>{mermaidCode}</code>
                </pre>
              </div>
              {/* プレビュー */}
              <div>
                <div className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                  <Eye className="w-4 h-4" />
                  プレビュー
                </div>
                <div className="bg-white p-4 rounded-lg border border-gray-200 overflow-auto max-h-[50vh]">
                  {mermaidSvg ? (
                    <div dangerouslySetInnerHTML={{ __html: mermaidSvg }} />
                  ) : (
                    <div className="text-gray-400 text-sm text-center py-8">
                      プレビュー読み込み中...
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 p-4 border-t border-gray-200">
              <Button
                variant="outline"
                onClick={() => {
                  navigator.clipboard.writeText(mermaidCode);
                }}
              >
                コードをコピー
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  // マークダウン形式でコピー
                  const markdown = '```mermaid\n' + mermaidCode + '\n```';
                  navigator.clipboard.writeText(markdown);
                }}
              >
                Markdown形式でコピー
              </Button>
              <Button onClick={() => setShowMermaid(false)}>閉じる</Button>
            </div>
          </div>
        </div>
      )}

      {/* 再割当ダイアログ（ロールを非表示にする際、所属ノードを別ロールへ） */}
      <Dialog
        open={!!reassign}
        onOpenChange={(open) => {
          if (!open && !reassignBusy) setReassign(null);
        }}
      >
        <DialogContent className="bg-white max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-gray-900">ノードの再割当</DialogTitle>
            <DialogDescription className="text-gray-500">
              「{roles.find((r) => r.id === reassign?.roleId)?.name ?? 'このロール'}
              」を非表示にする前に、所属するノードの割当先ロールを選んでください。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-[50vh] overflow-auto">
            {reassign?.nodes.map((node, idx) => (
              <div key={node.id} className="flex items-center gap-3">
                <span className="flex-1 text-sm text-gray-800 truncate">{node.label}</span>
                <select
                  className="text-sm border border-gray-300 rounded-md px-2 py-1.5 bg-white text-gray-800 min-w-[140px]"
                  value={node.targetRoleId}
                  onChange={(e) => {
                    const val = e.target.value;
                    setReassign((prev) =>
                      prev
                        ? {
                            ...prev,
                            nodes: prev.nodes.map((n, i) =>
                              i === idx ? { ...n, targetRoleId: val } : n
                            ),
                          }
                        : prev
                    );
                  }}
                >
                  {roles
                    .filter((r) => r.id !== reassign?.roleId)
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                </select>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setReassign(null)}
              disabled={reassignBusy}
            >
              キャンセル
            </Button>
            <Button
              onClick={handleReassignConfirm}
              disabled={
                reassignBusy ||
                roles.filter((r) => r.id !== reassign?.roleId).length === 0
              }
            >
              {reassignBusy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              確定
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mermaidから生成ダイアログ */}
      <Dialog
        open={showMermaidImport}
        onOpenChange={(open) => {
          if (!open && !mermaidImporting) setShowMermaidImport(false);
        }}
      >
        <DialogContent className="bg-white max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-1.5 text-gray-900">
              mermaidから生成
              <HelpTooltip text="Mermaid はテキストで図を書く記法です。flowchart の定義を貼り付けると、ロール・ノード・接続を解析してこのフローへ一括で追加します。" />
            </DialogTitle>
            <DialogDescription className="text-gray-500">
              Mermaid記法のテキストを貼り付けると、ロール・ノード・接続をこのフローに追加します。
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={mermaidImportText}
            onChange={(e) => setMermaidImportText(e.target.value)}
            placeholder={'flowchart TD\n  A[受注] --> B[出荷]'}
            rows={12}
            className="font-mono text-xs text-gray-800 min-h-[240px]"
            disabled={mermaidImporting}
          />
          {mermaidImportError && (
            <div className="flex items-start gap-2 text-sm text-red-600">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{mermaidImportError}</span>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowMermaidImport(false)}
              disabled={mermaidImporting}
            >
              キャンセル
            </Button>
            <Button
              onClick={handleMermaidImport}
              disabled={mermaidImporting || !mermaidImportText.trim()}
            >
              {mermaidImporting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              生成
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

