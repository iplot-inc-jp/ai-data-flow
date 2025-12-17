'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowLeft, FileCode, Loader2, Eye } from 'lucide-react';
import { BPMNFlowViewer, FlowData, Role } from '@/components/flow-editor/BPMNFlowViewer';
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

  // ノード位置更新
  const handleNodePositionUpdate = useCallback(
    async (nodeId: string, position: { x: number; y: number }) => {
      if (!flowData) return;
      try {
        const headers = getHeaders();
        await fetch(`${API_URL}/api/business-flows/${flowData.id}/nodes/${nodeId}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify({ positionX: position.x, positionY: position.y }),
        });
      } catch (err) {
        console.error('Failed to update node position:', err);
      }
    },
    [flowData, getHeaders]
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

  // ノード作成
  const handleNodeCreate = useCallback(
    async (type: string, x: number, y: number) => {
      if (!flowData) return;
      try {
        const headers = getHeaders();
        const res = await fetch(`${API_URL}/api/business-flows/${flowData.id}/nodes`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            type,
            label: type === 'DECISION' ? '条件分岐' : type === 'SYSTEM_INTEGRATION' ? 'システム連携' : '新規処理',
            positionX: x,
            positionY: y,
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

  // ロール並び替え
  const handleRoleReorder = useCallback(
    async (roleId: string, direction: 'up' | 'down') => {
      const currentIndex = roles.findIndex((r) => r.id === roleId);
      if (currentIndex === -1) return;
      
      const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
      if (newIndex < 0 || newIndex >= roles.length) return;

      // ローカルで先に並び替え
      const newRoles = [...roles];
      [newRoles[currentIndex], newRoles[newIndex]] = [newRoles[newIndex], newRoles[currentIndex]];
      setRoles(newRoles);

      // APIに並び順を保存
      try {
        const headers = getHeaders();
        await fetch(`${API_URL}/api/roles/project/${projectId}/order`, {
          method: 'PUT',
          headers,
          body: JSON.stringify({ roleIds: newRoles.map((r) => r.id) }),
        });
      } catch (err) {
        console.error('Failed to reorder roles:', err);
        // エラー時は元に戻す
        setRoles(roles);
      }
    },
    [roles, projectId, getHeaders]
  );

  // レーン高さ更新
  const handleLaneHeightUpdate = useCallback(
    async (roleId: string, height: number) => {
      try {
        const headers = getHeaders();
        const res = await fetch(`${API_URL}/api/roles/${roleId}/lane-height`, {
          method: 'PUT',
          headers,
          body: JSON.stringify({ laneHeight: height }),
        });

        if (res.ok) {
          setRoles((prev) =>
            prev.map((r) => (r.id === roleId ? { ...r, laneHeight: height } : r))
          );
        }
      } catch (err) {
        console.error('Failed to update lane height:', err);
      }
    },
    [getHeaders]
  );

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
        <Link href={`/dashboard/projects/${projectId}/flows`}>
          <Button variant="ghost" className="text-gray-600">
            <ArrowLeft className="w-4 h-4 mr-2" />
            フロー一覧
          </Button>
        </Link>
        <Button variant="outline" onClick={fetchMermaid} className="text-gray-600">
          <FileCode className="w-4 h-4 mr-2" />
          Mermaid出力
        </Button>
      </div>

      {/* フロービューアー */}
      <div className="h-[calc(100vh-200px)] border border-gray-200 rounded-lg overflow-hidden">
        <BPMNFlowViewer
          flowData={flowData}
          roles={roles}
          onNodeDoubleClick={handleNodeDoubleClick}
          onBack={flowHistory.length > 1 ? handleBack : undefined}
          onFlowUpdate={handleFlowUpdate}
          onEdgeLabelUpdate={handleEdgeLabelUpdate}
          onNodePositionUpdate={handleNodePositionUpdate}
          onNodeRoleUpdate={handleNodeRoleUpdate}
          onNodeCreate={handleNodeCreate}
          onNodeDelete={handleNodeDelete}
          onEdgeCreate={handleEdgeCreate}
          onEdgeDelete={handleEdgeDelete}
          onChildFlowCreate={handleChildFlowCreate}
          onRoleReorder={handleRoleReorder}
          onLaneHeightUpdate={handleLaneHeightUpdate}
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
    </div>
  );
}

