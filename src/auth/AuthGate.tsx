import { useState, type ReactNode } from 'react';
import { useAuth } from './AuthContext';

export default function AuthGate({ children }: { children: ReactNode }) {
  const { configured, loading, user, signInWithGoogle } = useAuth();
  const [error, setError] = useState<string | null>(null);

  if (loading) {
    return (
      <main className="auth-screen">
        <section className="auth-panel">
          <div className="micro">Finance Tracker</div>
          <h1 className="h1">載入登入狀態…</h1>
        </section>
      </main>
    );
  }

  if (!configured) {
    return (
      <main className="auth-screen">
        <section className="auth-panel">
          <div className="micro">Finance Tracker</div>
          <h1 className="h1">尚未設定資料庫連線</h1>
          <p className="caption auth-note">
            請先在環境變數設定 VITE_SUPABASE_URL 與
            VITE_SUPABASE_PUBLISHABLE_KEY，再重新載入。
          </p>
        </section>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="auth-screen">
        <section className="auth-panel">
          <div className="micro">Finance Tracker</div>
          <h1 className="h1">登入</h1>
          <p className="caption auth-note">登入後才能讀取帳務資料；資料僅屬於你的帳號。</p>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => {
              setError(null);
              signInWithGoogle().catch((err: unknown) => {
                setError(err instanceof Error ? err.message : '無法啟動登入流程。');
              });
            }}
          >
            使用 Google 登入
          </button>
          {error && <p className="caption auth-error">{error}</p>}
        </section>
      </main>
    );
  }

  return children;
}
