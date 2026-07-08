import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { isSupabaseConfigured, requireSupabase, supabase } from '../lib/supabaseClient';

interface AuthContextValue {
  configured: boolean;
  loading: boolean;
  session: Session | null;
  user: User | null;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function authRedirectUrl() {
  return `${window.location.origin}${import.meta.env.BASE_URL}`;
}

async function ensureProfile(userId: string) {
  const client = requireSupabase();
  const { error } = await client
    .from('profiles')
    .upsert({ id: userId }, { onConflict: 'id' });

  if (error) throw error;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return undefined;
    }

    let cancelled = false;

    supabase.auth.getSession().then(({ data, error }) => {
      if (cancelled) return;
      if (error) {
        setSession(null);
        setLoading(false);
        return;
      }
      setSession(data.session);
      if (data.session?.user.id) {
        ensureProfile(data.session.user.id)
          .catch(() => undefined)
          .finally(() => {
            if (!cancelled) setLoading(false);
          });
      } else {
        setLoading(false);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (nextSession?.user.id) {
        ensureProfile(nextSession.user.id).catch(() => undefined);
      }
    });

    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
    };
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const client = requireSupabase();
    const { error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: authRedirectUrl(),
      },
    });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    const client = requireSupabase();
    const { error } = await client.auth.signOut();
    if (error) throw error;
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      configured: isSupabaseConfigured,
      loading,
      session,
      user: session?.user ?? null,
      signInWithGoogle,
      signOut,
    }),
    [loading, session, signInWithGoogle, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error('useAuth must be used inside AuthProvider.');
  }
  return value;
}
