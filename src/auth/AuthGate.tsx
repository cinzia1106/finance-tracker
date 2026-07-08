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
          <h1 className="h1">Loading session</h1>
        </section>
      </main>
    );
  }

  if (!configured) {
    return (
      <main className="auth-screen">
        <section className="auth-panel">
          <div className="micro">Finance Tracker</div>
          <h1 className="h1">Supabase setup required</h1>
          <p className="caption">
            Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to the local
            environment before using account data.
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
          <h1 className="h1">Sign in</h1>
          <p className="caption">Google sign-in is required before any account data is loaded.</p>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => {
              setError(null);
              signInWithGoogle().catch((err: unknown) => {
                setError(err instanceof Error ? err.message : 'Unable to start sign-in.');
              });
            }}
          >
            Continue with Google
          </button>
          {error && <p className="caption auth-error">{error}</p>}
        </section>
      </main>
    );
  }

  return children;
}
