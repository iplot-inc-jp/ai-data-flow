import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Database, GitBranch, Layers, ArrowRight } from 'lucide-react'

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <header className="border-b border-slate-700/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="h-8 w-8 text-blue-500" />
            <span className="text-xl font-bold text-white">DataFlow</span>
          </div>
          <nav className="flex items-center gap-4">
            <Link href="/login">
              <Button variant="ghost" className="text-slate-300 hover:text-white">
                ログイン
              </Button>
            </Link>
            <Link href="/register">
              <Button className="bg-blue-600 hover:bg-blue-700">
                無料で始める
              </Button>
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <main className="container mx-auto px-4 py-20">
        <div className="text-center max-w-4xl mx-auto">
          <h1 className="text-5xl md:text-6xl font-bold text-white mb-6 leading-tight">
            データカタログと
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-400">
              業務フローを統合
            </span>
          </h1>
          <p className="text-xl text-slate-400 mb-10 max-w-2xl mx-auto">
            システムの全体像をAIと人間の両方が即座に理解できる。
            業務フローからデータ設計まで、すべてを一元管理。
          </p>
          <div className="flex justify-center gap-4">
            <Link href="/register">
              <Button size="lg" className="bg-blue-600 hover:bg-blue-700 text-lg px-8">
                無料で始める
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
            <Link href="/demo">
              <Button size="lg" variant="outline" className="text-lg px-8 border-slate-600 text-slate-300 hover:bg-slate-800">
                デモを見る
              </Button>
            </Link>
          </div>
        </div>

        {/* Features */}
        <div className="grid md:grid-cols-3 gap-8 mt-24">
          <div className="bg-slate-800/50 rounded-xl p-8 border border-slate-700/50">
            <div className="w-12 h-12 bg-blue-500/20 rounded-lg flex items-center justify-center mb-6">
              <Database className="h-6 w-6 text-blue-400" />
            </div>
            <h3 className="text-xl font-semibold text-white mb-3">
              データカタログ
            </h3>
            <p className="text-slate-400">
              テーブル・カラムのメタデータを一元管理。
              各カラムのCRUD操作とロールを紐づけて、
              データの流れを可視化。
            </p>
          </div>

          <div className="bg-slate-800/50 rounded-xl p-8 border border-slate-700/50">
            <div className="w-12 h-12 bg-cyan-500/20 rounded-lg flex items-center justify-center mb-6">
              <GitBranch className="h-6 w-6 text-cyan-400" />
            </div>
            <h3 className="text-xl font-semibold text-white mb-3">
              業務フローエディタ
            </h3>
            <p className="text-slate-400">
              直感的なUIで業務フローを作成。
              スイムレーンでロール別の処理を整理し、
              mermaid記法でエクスポート可能。
            </p>
          </div>

          <div className="bg-slate-800/50 rounded-xl p-8 border border-slate-700/50">
            <div className="w-12 h-12 bg-purple-500/20 rounded-lg flex items-center justify-center mb-6">
              <Layers className="h-6 w-6 text-purple-400" />
            </div>
            <h3 className="text-xl font-semibold text-white mb-3">
              AI連携
            </h3>
            <p className="text-slate-400">
              構造化されたコンテキストをAIエージェントに提供。
              正確なSQL生成、開発支援、
              テスト計画作成をサポート。
            </p>
          </div>
        </div>

        {/* Use Cases */}
        <div className="mt-24 text-center">
          <h2 className="text-3xl font-bold text-white mb-12">
            こんな課題を解決
          </h2>
          <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto text-left">
            <div className="flex gap-4 p-6 bg-slate-800/30 rounded-lg border border-slate-700/50">
              <div className="text-2xl">🧑‍💻</div>
              <div>
                <h4 className="font-semibold text-white mb-2">エンジニア</h4>
                <p className="text-slate-400 text-sm">
                  AIエージェントにシステム全体像を渡して、
                  的確な開発支援を受けられる
                </p>
              </div>
            </div>
            <div className="flex gap-4 p-6 bg-slate-800/30 rounded-lg border border-slate-700/50">
              <div className="text-2xl">📊</div>
              <div>
                <h4 className="font-semibold text-white mb-2">マーケター</h4>
                <p className="text-slate-400 text-sm">
                  自然言語でSQLを生成し、
                  目的のデータに素早くアクセス
                </p>
              </div>
            </div>
            <div className="flex gap-4 p-6 bg-slate-800/30 rounded-lg border border-slate-700/50">
              <div className="text-2xl">📋</div>
              <div>
                <h4 className="font-semibold text-white mb-2">PM / BA</h4>
                <p className="text-slate-400 text-sm">
                  業務フローの整理と顧客とのすり合わせを
                  効率化、抜け漏れを防止
                </p>
              </div>
            </div>
            <div className="flex gap-4 p-6 bg-slate-800/30 rounded-lg border border-slate-700/50">
              <div className="text-2xl">🤖</div>
              <div>
                <h4 className="font-semibold text-white mb-2">AIエージェント</h4>
                <p className="text-slate-400 text-sm">
                  構造化されたシステム情報で、
                  正確なコンテキストを取得
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-700/50 mt-24 py-8">
        <div className="container mx-auto px-4 text-center text-slate-500">
          <p>© 2024 DataFlow. All rights reserved.</p>
        </div>
      </footer>
    </div>
  )
}

