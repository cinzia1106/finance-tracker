import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { useAdapter } from '../../data/AdapterContext';

export default function SettingsPage() {
  const { signOut } = useAuth();
  const adapter = useAdapter();
  const [emergencyFundMonths, setEmergencyFundMonths] = useState('3');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    adapter.getUserSettings?.().then((settings) => {
      if (!cancelled) setEmergencyFundMonths(String(settings.emergencyFundMonths));
    });
    return () => {
      cancelled = true;
    };
  }, [adapter]);

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!adapter.updateUserSettings) return;
    setSaving(true);
    try {
      const months = Math.max(1, Math.min(Number(emergencyFundMonths) || 3, 24));
      const settings = await adapter.updateUserSettings({ emergencyFundMonths: months });
      setEmergencyFundMonths(String(settings.emergencyFundMonths));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <header className="page-header">
        <div className="page-header__lead">
          <Link to="/" className="back-header__btn mobile-only" aria-label="Back">
            {'<'}
          </Link>
          <h1 className="h1">Settings</h1>
        </div>
      </header>

      <div className="grid-12">
        <section className="card span-6">
          <h2 className="h2">Account</h2>
          <p className="caption" style={{ lineHeight: 1.7 }}>
            Finance Tracker uses the current signed-in session and Supabase RLS.
          </p>
          <div>
            <button
              type="button"
              className="btn btn--secondary"
              onClick={() => {
                signOut().catch(() => undefined);
              }}
            >
              Sign out
            </button>
          </div>
        </section>

        <section className="card span-6">
          <h2 className="h2">Emergency fund</h2>
          <form onSubmit={saveSettings} className="row-list">
            <label className="list-row">
              <span>Target months</span>
              <input
                className="text-input"
                type="number"
                min="1"
                max="24"
                value={emergencyFundMonths}
                onChange={(event) => setEmergencyFundMonths(event.target.value)}
              />
            </label>
            <button type="submit" className="btn btn--secondary" disabled={saving}>
              Save settings
            </button>
          </form>
        </section>

        <section className="card span-6">
          <h2 className="h2">Export</h2>
          <p className="caption" style={{ lineHeight: 1.7 }}>
            Google Sheets API integration is intentionally deferred. Use Monthly Review CSV export.
          </p>
          <div>
            <button type="button" className="btn btn--secondary" disabled>
              Export for Google Sheets
            </button>
          </div>
        </section>

        <section className="card span-12">
          <h2 className="h2">Data</h2>
          <div className="caption" style={{ lineHeight: 1.7 }}>
            Derived values are calculated from transactions, snapshots, and user settings.
          </div>
        </section>
      </div>
    </>
  );
}
