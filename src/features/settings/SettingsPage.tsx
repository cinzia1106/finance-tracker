/* 設定 Settings — visual layer. Emergency-fund setting persists through the
   Phase G adapter methods; sign-out reuses the existing auth flow. */

import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { useAdapter } from '../../data/AdapterContext';

export default function SettingsPage() {
  const { signOut } = useAuth();
  const adapter = useAdapter();
  const [emergencyFundMonths, setEmergencyFundMonths] = useState('3');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

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
    setSaved(false);
    try {
      const months = Math.max(1, Math.min(Number(emergencyFundMonths) || 3, 24));
      const settings = await adapter.updateUserSettings({ emergencyFundMonths: months });
      setEmergencyFundMonths(String(settings.emergencyFundMonths));
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <header className="page-header">
        <div className="page-header__lead">
          <Link to="/" className="back-header__btn mobile-only" aria-label="返回總覽">
            ‹
          </Link>
          <h1 className="h1">設定</h1>
        </div>
      </header>

      <div className="grid-12">
        <section className="card span-6">
          <h2 className="h2">帳號</h2>
          <p className="caption" style={{ lineHeight: 1.7 }}>
            已透過 Google 登入。資料以列層級安全性（RLS）隔離，僅本帳號可讀寫。
          </p>
          <div>
            <button
              type="button"
              className="btn btn--secondary"
              onClick={() => {
                signOut().catch(() => undefined);
              }}
            >
              登出
            </button>
          </div>
        </section>

        <section className="card span-6">
          <div className="card__header">
            <h2 className="h2">緊急預備金</h2>
            {saved && <span className="micro" style={{ color: 'var(--color-mint-deep)', letterSpacing: 0 }}>已儲存</span>}
          </div>
          <p className="caption" style={{ lineHeight: 1.7 }}>
            以月必要支出計算兩段安全線：第一線＝必要支出 × 設定月數；
            安心線＝必要支出 ×（設定月數＋2，最少 5 個月）。
          </p>
          <form onSubmit={saveSettings} className="form-grid">
            <label className="form-field">
              <span className="micro">目標月數</span>
              <input
                className="text-input mono"
                type="number"
                min="1"
                max="24"
                value={emergencyFundMonths}
                onChange={(event) => setEmergencyFundMonths(event.target.value)}
              />
            </label>
            <div className="form-actions">
              <button type="submit" className="btn btn--primary" disabled={saving}>
                儲存設定
              </button>
            </div>
          </form>
        </section>

        <section className="card span-6">
          <h2 className="h2">資料備份</h2>
          <p className="caption" style={{ lineHeight: 1.7 }}>
            月結報表與完整備份請至「月報」頁使用 Export for Google Sheets 匯出；
            Google Sheets 自動同步刻意不做。
          </p>
          <div>
            <Link to="/monthly-review" className="btn btn--secondary">
              前往月報匯出
            </Link>
          </div>
        </section>

        <section className="card span-6">
          <h2 className="h2">關於</h2>
          <div className="caption" style={{ lineHeight: 1.7 }}>
            Finance Tracker — local-first 個人財務系統。所有數字由交易、快照與
            設定計算而得；未更新的餘額與市值以最後確認日期標示，不假裝即時。
          </div>
        </section>
      </div>
    </>
  );
}
