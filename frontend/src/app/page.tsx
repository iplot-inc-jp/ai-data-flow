import { redirect } from 'next/navigation';

// 認証はクライアント側（localStorage の accessToken）で管理しており、
// dashboard 側にマウント時の認証ガードが無いため、入口は /login へ集約する。
// ログイン済みユーザーはログイン後に /dashboard へ遷移する。
export default function HomePage() {
  redirect('/login');
}
