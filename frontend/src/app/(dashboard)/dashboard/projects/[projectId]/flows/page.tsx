'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { GitBranch, Plus, Search, Clock, Play, Loader2, ChevronLeft } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5021';

type FlowData = {
  id: string;
  name: string;
  description?: string;
  version: number;
  nodesCount?: number;
  updatedAt: string;
};

export default function ProjectFlowsPage() {
  const params = useParams();
  const projectId = params.projectId as string;

  const [flows, setFlows] = useState<FlowData[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [newFlow, setNewFlow] = useState({ name: '', description: '' });

  const getHeaders = useCallback(() => {
    const token = localStorage.getItem('accessToken');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
  }, []);

  const fetchFlows = useCallback(async () => {
    setLoading(true);
    try {
      const headers = getHeaders();
      const res = await fetch(`${API_URL}/api/business-flows/project/${projectId}`, { headers });
      if (res.ok) {
        const data = await res.json();
        setFlows(data);
      }
    } catch (err) {
      console.error('Failed to fetch flows:', err);
    } finally {
      setLoading(false);
    }
  }, [projectId, getHeaders]);

  useEffect(() => {
    fetchFlows();
  }, [fetchFlows]);

  const handleCreateFlow = async () => {
    if (!newFlow.name) return;

    try {
      const headers = getHeaders();
      const res = await fetch(`${API_URL}/api/business-flows`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          projectId,
          name: newFlow.name,
          description: newFlow.description || null,
        }),
      });
      if (res.ok) {
        await fetchFlows();
        setIsCreateDialogOpen(false);
        setNewFlow({ name: '', description: '' });
      }
    } catch (err) {
      console.error('Failed to create flow:', err);
    }
  };

  const filteredFlows = flows.filter(
    (flow) =>
      flow.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      flow.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href={`/dashboard/projects/${projectId}`}>
            <Button variant="ghost" size="sm" className="text-gray-600">
              <ChevronLeft className="w-4 h-4 mr-1" />
              戻る
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">業務フロー</h1>
            <p className="text-gray-500 mt-1">業務プロセスを可視化して管理</p>
          </div>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-blue-600 hover:bg-blue-700">
              <Plus className="h-4 w-4 mr-2" />
              フロー作成
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-white border-gray-200">
            <DialogHeader>
              <DialogTitle className="text-gray-900">新規フロー作成</DialogTitle>
              <DialogDescription className="text-gray-500">
                新しい業務フローを作成します
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name" className="text-gray-700">フロー名</Label>
                <Input
                  id="name"
                  placeholder="注文処理フロー"
                  value={newFlow.name}
                  onChange={(e) => setNewFlow({ ...newFlow, name: e.target.value })}
                  className="bg-white border-gray-300 text-gray-900"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description" className="text-gray-700">説明</Label>
                <Input
                  id="description"
                  placeholder="フローの説明を入力"
                  value={newFlow.description}
                  onChange={(e) => setNewFlow({ ...newFlow, description: e.target.value })}
                  className="bg-white border-gray-300 text-gray-900"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)} className="border-gray-300 text-gray-700">
                キャンセル
              </Button>
              <Button className="bg-blue-600 hover:bg-blue-700" onClick={handleCreateFlow}>
                作成
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          placeholder="フローを検索..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10 bg-white border-gray-300 text-gray-900 placeholder:text-gray-400"
        />
      </div>

      {/* Flows Grid */}
      {filteredFlows.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredFlows.map((flow) => (
            <Link key={flow.id} href={`/dashboard/projects/${projectId}/flows/${flow.id}`}>
              <Card className="bg-white border-gray-200 hover:border-gray-300 hover:shadow-md transition-all cursor-pointer h-full">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-cyan-100 flex items-center justify-center">
                        <GitBranch className="h-5 w-5 text-cyan-600" />
                      </div>
                      <div>
                        <CardTitle className="text-gray-900 text-lg">{flow.name}</CardTitle>
                        <span className="text-xs text-gray-500">v{flow.version}</span>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-500 line-clamp-2 mb-4">
                    {flow.description || '説明なし'}
                  </p>
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    {flow.nodesCount !== undefined && (
                      <div className="flex items-center gap-1">
                        <Play className="h-3 w-3" />
                        {flow.nodesCount} ノード
                      </div>
                    )}
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDate(flow.updatedAt)}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <Card className="bg-white border-gray-200">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
              <GitBranch className="h-8 w-8 text-gray-400" />
            </div>
            <p className="text-gray-500 mb-2">フローが見つかりません</p>
            <p className="text-sm text-gray-400 mb-4">
              {searchQuery ? '検索条件を変更してください' : '最初のフローを作成しましょう'}
            </p>
            {!searchQuery && (
              <Button
                className="bg-blue-600 hover:bg-blue-700"
                onClick={() => setIsCreateDialogOpen(true)}
              >
                <Plus className="h-4 w-4 mr-2" />
                フロー作成
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

