'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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
import { Database, Plus, Search, Table as TableIcon, Loader2, ChevronLeft, Upload, Download, FileText, Check, AlertCircle } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5021';

type TableData = {
  id: string;
  name: string;
  displayName?: string;
  description?: string;
  tags: string[];
  columnsCount?: number;
};

export default function ProjectCatalogPage() {
  const params = useParams();
  const projectId = params.projectId as string;

  const [tables, setTables] = useState<TableData[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [newTable, setNewTable] = useState({ name: '', displayName: '', description: '' });
  const [csvContent, setCsvContent] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    success: boolean;
    tablesCreated: number;
    columnsCreated: number;
    errors: string[];
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const getHeaders = useCallback(() => {
    const token = localStorage.getItem('accessToken');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
  }, []);

  const fetchTables = useCallback(async () => {
    setLoading(true);
    try {
      const headers = getHeaders();
      const res = await fetch(`${API_URL}/api/tables/project/${projectId}`, { headers });
      if (res.ok) {
        const data = await res.json();
        setTables(data);
      }
    } catch (err) {
      console.error('Failed to fetch tables:', err);
    } finally {
      setLoading(false);
    }
  }, [projectId, getHeaders]);

  useEffect(() => {
    fetchTables();
  }, [fetchTables]);

  const handleCreateTable = async () => {
    if (!newTable.name) return;

    try {
      const headers = getHeaders();
      const res = await fetch(`${API_URL}/api/tables`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          projectId,
          name: newTable.name,
          displayName: newTable.displayName || null,
          description: newTable.description || null,
          tags: [],
        }),
      });
      if (res.ok) {
        await fetchTables();
        setIsCreateDialogOpen(false);
        setNewTable({ name: '', displayName: '', description: '' });
      }
    } catch (err) {
      console.error('Failed to create table:', err);
    }
  };

  // CSVテンプレートをダウンロード
  const handleDownloadTemplate = async () => {
    try {
      const headers = getHeaders();
      const res = await fetch(`${API_URL}/api/tables/import/csv/template`, { headers });
      if (res.ok) {
        const data = await res.json();
        const blob = new Blob([data.template], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'data_catalog_template.csv';
        link.click();
      }
    } catch (err) {
      console.error('Failed to download template:', err);
    }
  };

  // ファイル選択ハンドラー
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        setCsvContent(content);
      };
      reader.readAsText(file);
    }
  };

  // CSVインポート実行
  const handleImportCsv = async () => {
    if (!csvContent.trim()) return;

    setImporting(true);
    setImportResult(null);

    try {
      const headers = getHeaders();
      const res = await fetch(`${API_URL}/api/tables/import/csv`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          projectId,
          csv: csvContent,
        }),
      });

      if (res.ok) {
        const result = await res.json();
        setImportResult(result);
        if (result.success || result.tablesCreated > 0 || result.columnsCreated > 0) {
          await fetchTables();
        }
      }
    } catch (err) {
      setImportResult({
        success: false,
        tablesCreated: 0,
        columnsCreated: 0,
        errors: ['インポートに失敗しました'],
      });
    } finally {
      setImporting(false);
    }
  };

  // インポートダイアログを閉じる
  const closeImportDialog = () => {
    setIsImportDialogOpen(false);
    setCsvContent('');
    setImportResult(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const filteredTables = tables.filter(
    (table) =>
      table.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      table.displayName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      table.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

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
            <h1 className="text-3xl font-bold text-gray-900">データカタログ</h1>
            <p className="text-gray-500 mt-1">テーブルとカラムのメタデータを管理</p>
          </div>
        </div>
        <div className="flex gap-2">
          {/* CSVインポートボタン */}
          <Dialog open={isImportDialogOpen} onOpenChange={(open) => {
            if (!open) closeImportDialog();
            else setIsImportDialogOpen(true);
          }}>
            <DialogTrigger asChild>
              <Button variant="outline" className="border-gray-300">
                <Upload className="h-4 w-4 mr-2" />
                CSVインポート
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-white border-gray-200 max-w-2xl">
              <DialogHeader>
                <DialogTitle className="text-gray-900">CSVからインポート</DialogTitle>
                <DialogDescription className="text-gray-500">
                  CSVファイルからテーブルとカラムを一括インポートします
                </DialogDescription>
              </DialogHeader>
              
              {!importResult ? (
                <div className="space-y-4 py-4">
                  {/* テンプレートダウンロード */}
                  <div className="flex items-center justify-between p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="flex items-center gap-2">
                      <FileText className="h-5 w-5 text-blue-600" />
                      <span className="text-sm text-blue-700">CSVテンプレート</span>
                    </div>
                    <Button variant="outline" size="sm" onClick={handleDownloadTemplate}>
                      <Download className="h-4 w-4 mr-1" />
                      ダウンロード
                    </Button>
                  </div>

                  {/* ファイル選択 */}
                  <div className="space-y-2">
                    <Label className="text-gray-700">CSVファイルを選択</Label>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv"
                      onChange={handleFileSelect}
                      className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                    />
                  </div>

                  {/* CSVプレビュー/編集 */}
                  <div className="space-y-2">
                    <Label className="text-gray-700">CSVデータ（直接編集も可能）</Label>
                    <Textarea
                      value={csvContent}
                      onChange={(e) => setCsvContent(e.target.value)}
                      placeholder={`table_name,column_name,display_name,data_type,description,is_primary_key,is_foreign_key,is_nullable,is_unique,default_value,foreign_key_table,foreign_key_column
users,id,ユーザーID,UUID,ユーザーの識別子,true,false,false,true,,,
users,email,メールアドレス,STRING,メールアドレス,false,false,false,true,,,`}
                      className="bg-white border-gray-300 text-gray-900 font-mono text-xs h-48"
                    />
                  </div>
                </div>
              ) : (
                <div className="py-6">
                  {/* インポート結果 */}
                  <div className={`p-4 rounded-lg ${importResult.success ? 'bg-green-50 border border-green-200' : 'bg-amber-50 border border-amber-200'}`}>
                    <div className="flex items-center gap-2 mb-3">
                      {importResult.success ? (
                        <Check className="h-5 w-5 text-green-600" />
                      ) : (
                        <AlertCircle className="h-5 w-5 text-amber-600" />
                      )}
                      <span className={`font-medium ${importResult.success ? 'text-green-700' : 'text-amber-700'}`}>
                        {importResult.success ? 'インポート完了' : '一部エラーあり'}
                      </span>
                    </div>
                    <div className="space-y-1 text-sm">
                      <p className="text-gray-700">
                        作成されたテーブル: <strong>{importResult.tablesCreated}</strong>
                      </p>
                      <p className="text-gray-700">
                        作成されたカラム: <strong>{importResult.columnsCreated}</strong>
                      </p>
                    </div>
                    {importResult.errors.length > 0 && (
                      <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded text-sm">
                        <p className="font-medium text-red-700 mb-1">エラー:</p>
                        <ul className="list-disc list-inside text-red-600 text-xs space-y-1">
                          {importResult.errors.slice(0, 5).map((err, i) => (
                            <li key={i}>{err}</li>
                          ))}
                          {importResult.errors.length > 5 && (
                            <li>...他 {importResult.errors.length - 5} 件のエラー</li>
                          )}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <DialogFooter>
                {!importResult ? (
                  <>
                    <Button variant="outline" onClick={closeImportDialog} className="border-gray-300 text-gray-700">
                      キャンセル
                    </Button>
                    <Button
                      className="bg-blue-600 hover:bg-blue-700"
                      onClick={handleImportCsv}
                      disabled={!csvContent.trim() || importing}
                    >
                      {importing ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          インポート中...
                        </>
                      ) : (
                        <>
                          <Upload className="h-4 w-4 mr-2" />
                          インポート実行
                        </>
                      )}
                    </Button>
                  </>
                ) : (
                  <Button onClick={closeImportDialog}>
                    閉じる
                  </Button>
                )}
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* テーブル追加ボタン */}
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-blue-600 hover:bg-blue-700">
                <Plus className="h-4 w-4 mr-2" />
                テーブル追加
              </Button>
            </DialogTrigger>
          <DialogContent className="bg-white border-gray-200">
            <DialogHeader>
              <DialogTitle className="text-gray-900">新規テーブル作成</DialogTitle>
              <DialogDescription className="text-gray-500">
                データカタログに新しいテーブルを追加します
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name" className="text-gray-700">テーブル名 (英字)</Label>
                <Input
                  id="name"
                  placeholder="users"
                  value={newTable.name}
                  onChange={(e) => setNewTable({ ...newTable, name: e.target.value })}
                  className="bg-white border-gray-300 text-gray-900"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="displayName" className="text-gray-700">表示名</Label>
                <Input
                  id="displayName"
                  placeholder="ユーザー"
                  value={newTable.displayName}
                  onChange={(e) => setNewTable({ ...newTable, displayName: e.target.value })}
                  className="bg-white border-gray-300 text-gray-900"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description" className="text-gray-700">説明</Label>
                <Input
                  id="description"
                  placeholder="テーブルの説明を入力"
                  value={newTable.description}
                  onChange={(e) => setNewTable({ ...newTable, description: e.target.value })}
                  className="bg-white border-gray-300 text-gray-900"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)} className="border-gray-300 text-gray-700">
                キャンセル
              </Button>
              <Button className="bg-blue-600 hover:bg-blue-700" onClick={handleCreateTable}>
                作成
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          placeholder="テーブルを検索..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10 bg-white border-gray-300 text-gray-900 placeholder:text-gray-400"
        />
      </div>

      {/* Tables Grid */}
      {filteredTables.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredTables.map((table) => (
            <Link key={table.id} href={`/dashboard/projects/${projectId}/catalog/${table.id}`}>
              <Card className="bg-white border-gray-200 hover:border-gray-300 hover:shadow-md transition-all cursor-pointer h-full">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                        <TableIcon className="h-5 w-5 text-blue-600" />
                      </div>
                      <div>
                        <CardTitle className="text-gray-900 text-lg">{table.displayName || table.name}</CardTitle>
                        <code className="text-xs text-gray-500">{table.name}</code>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-500 line-clamp-2 mb-4">
                    {table.description || '説明なし'}
                  </p>
                  <div className="flex items-center justify-between">
                    <div className="flex gap-2">
                      {table.tags?.map((tag) => (
                        <span
                          key={tag}
                          className="px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-600"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                    {table.columnsCount !== undefined && (
                      <span className="text-xs text-gray-500">{table.columnsCount} カラム</span>
                    )}
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
              <Database className="h-8 w-8 text-gray-400" />
            </div>
            <p className="text-gray-500 mb-2">テーブルが見つかりません</p>
            <p className="text-sm text-gray-400 mb-4">
              {searchQuery ? '検索条件を変更してください' : '最初のテーブルを追加しましょう'}
            </p>
            {!searchQuery && (
              <Button
                className="bg-blue-600 hover:bg-blue-700"
                onClick={() => setIsCreateDialogOpen(true)}
              >
                <Plus className="h-4 w-4 mr-2" />
                テーブル追加
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

