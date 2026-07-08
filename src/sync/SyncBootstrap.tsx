import { useEffect } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useAdapter } from '../data/AdapterContext';

export default function SyncBootstrap() {
  const adapter = useAdapter();
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    adapter.flushPendingMutations?.().catch(() => undefined);
  }, [adapter, user]);

  return null;
}
