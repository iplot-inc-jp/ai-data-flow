'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { User, Key, Loader2 } from 'lucide-react'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5021';

export default function AccountSettingsPage() {
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<{ name: string; email: string } | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [apiKey] = useState('df_api_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const getHeaders = useCallback(() => {
    const token = localStorage.getItem('accessToken');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
  }, []);

  useEffect(() => {
    // 仮のユーザー情報セット
    setUser({ name: '田中 太郎', email: 'tanaka@example.com' });
    setName('田中 太郎');
    setEmail('tanaka@example.com');
  }, []);

  const handleProfileSave = async () => {
    setLoading(true);
    setMessage(null);
    try {
      // TODO: プロフィール更新API
      await new Promise(resolve => setTimeout(resolve, 500));
      setMessage({ type: 'success', text: 'プロフィールを更新しました' });
    } catch (err) {
      setMessage({ type: 'error', text: '更新に失敗しました' });
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordChange = async () => {
    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: 'パスワードが一致しません' });
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      // TODO: パスワード変更API
      await new Promise(resolve => setTimeout(resolve, 500));
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setMessage({ type: 'success', text: 'パスワードを変更しました' });
    } catch (err) {
      setMessage({ type: 'error', text: '変更に失敗しました' });
    } finally {
      setLoading(false);
    }
  };

  const copyApiKey = () => {
    navigator.clipboard.writeText(apiKey);
    setMessage({ type: 'success', text: 'APIキーをコピーしました' });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">アカウント設定</h1>
        <p className="text-gray-500 mt-1">アカウントの設定を管理</p>
      </div>

      {/* メッセージ表示 */}
      {message && (
        <div
          className={`p-4 rounded-lg ${
            message.type === 'success'
              ? 'bg-green-50 border border-green-200 text-green-800'
              : 'bg-red-50 border border-red-200 text-red-800'
          }`}
        >
          {message.text}
        </div>
      )}

      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList className="bg-gray-100 border border-gray-200">
          <TabsTrigger value="profile" className="data-[state=active]:bg-white data-[state=active]:text-gray-900">
            <User className="h-4 w-4 mr-2" />
            プロフィール
          </TabsTrigger>
          <TabsTrigger value="api" className="data-[state=active]:bg-white data-[state=active]:text-gray-900">
            <Key className="h-4 w-4 mr-2" />
            API
          </TabsTrigger>
        </TabsList>

        {/* Profile Tab */}
        <TabsContent value="profile">
          <Card className="bg-white border-gray-200">
            <CardHeader>
              <CardTitle className="text-gray-900">プロフィール設定</CardTitle>
              <CardDescription className="text-gray-500">
                アカウントの基本情報を更新します
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-gray-700">名前</Label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="bg-white border-gray-300 text-gray-900"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-gray-700">メールアドレス</Label>
                  <Input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    type="email"
                    className="bg-white border-gray-300 text-gray-900"
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <Button
                  onClick={handleProfileSave}
                  disabled={loading}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  保存
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white border-gray-200 mt-6">
            <CardHeader>
              <CardTitle className="text-gray-900">パスワード変更</CardTitle>
              <CardDescription className="text-gray-500">
                セキュリティのためパスワードを定期的に更新してください
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="text-gray-700">現在のパスワード</Label>
                <Input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="bg-white border-gray-300 text-gray-900"
                />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-gray-700">新しいパスワード</Label>
                  <Input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="bg-white border-gray-300 text-gray-900"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-gray-700">確認用</Label>
                  <Input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="bg-white border-gray-300 text-gray-900"
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <Button
                  onClick={handlePasswordChange}
                  disabled={loading}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  パスワード変更
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* API Tab */}
        <TabsContent value="api">
          <Card className="bg-white border-gray-200">
            <CardHeader>
              <CardTitle className="text-gray-900">APIアクセス</CardTitle>
              <CardDescription className="text-gray-500">
                外部からのAPI連携やAIエージェント向けのアクセスキーを管理します
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                <p className="text-sm text-gray-600 mb-4">
                  APIキーを使用して、外部ツールやAIエージェントからDataFlowのデータにアクセスできます。
                </p>
                <div className="flex gap-2">
                  <Input
                    value={apiKey}
                    readOnly
                    className="bg-white border-gray-300 text-gray-700 font-mono"
                  />
                  <Button variant="outline" onClick={copyApiKey} className="border-gray-300 text-gray-700">
                    コピー
                  </Button>
                </div>
              </div>
              <div className="flex justify-between items-center">
                <p className="text-sm text-gray-500">
                  このキーを再生成すると、既存の連携が無効になります
                </p>
                <Button variant="outline" className="border-gray-300 text-gray-700">
                  キーを再生成
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white border-gray-200 mt-6">
            <CardHeader>
              <CardTitle className="text-gray-900">AIエージェント向けエクスポート</CardTitle>
              <CardDescription className="text-gray-500">
                AIエージェントがプロジェクトを理解するためのエンドポイント
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <code className="text-sm text-gray-700">
                    GET /api/export/project/:projectId/ai
                  </code>
                  <p className="text-xs text-gray-500 mt-2">
                    プロジェクト全体の構造化データをJSON形式で取得
                  </p>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <code className="text-sm text-gray-700">
                    GET /api/export/project/:projectId/mermaid
                  </code>
                  <p className="text-xs text-gray-500 mt-2">
                    ER図と業務フローをmermaid形式で取得
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
