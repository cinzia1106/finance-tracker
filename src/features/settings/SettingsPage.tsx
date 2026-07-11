/* 設定 Settings — visual layer. Emergency-fund setting persists through the
   Phase G adapter methods; sign-out reuses the existing auth flow. */

import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { useAdapter } from '../../data/AdapterContext';
import { CATEGORY_DEFINITIONS, DEFAULT_DASHBOARD_BUDGETS } from '../../data/categoryDefinitions';

const BUDGET_CATEGORIES = CATEGORY_DEFINITIONS.filter((category) => category.kind === 'expense').map(
  (category) => category.name,
);

export default function SettingsPage() {
  const { signOut } = useAuth();
  const adapter = useAdapter();
  const [emergencyFundMonths, setEmergencyFundMonths] = useState('3');
  const [dashboardBudgets, setDashboardBudgets] = useState<Record<string, string>>(
    Object.fromEntries(
      BUDGET_CATEGORIES.map((category) => [
        category,
        String(DEFAULT_DASHBOARD_BUDGETS[category] ?? 0),
      ]),
    ),
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    adapter.getUserSettings?.().then((settings) => {
      if (cancelled) return;
      setEmergencyFundMonths(String(settings.emergencyFundMonths));
      const budgets = settings.dashboardBudgets ?? DEFAULT_DASHBOARD_BUDGETS;
      setDashboardBudgets(
        Object.fromEntries(
          BUDGET_CATEGORIES.map((category) => [
            category,
            String(budgets[category] ?? DEFAULT_DASHBOARD_BUDGETS[category] ?? 0),
          ]),
        ),
      );
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
      const budgets = Object.fromEntries(
        BUDGET_CATEGORIES.map((category) => [
          category,
          Math.max(0, Math.round(Number(dashboardBudgets[category]) || 0)),
        ]),
      );
      const settings = await adapter.updateUserSettings({
        emergencyFundMonths: months,
        dashboardBudgets: budgets,
      });
      setEmergencyFundMonths(String(settings.emergencyFundMonths));
      const savedBudgets = settings.dashboardBudgets ?? budgets;
      setDashboardBudgets(
        Object.fromEntries(
          BUDGET_CATEGORIES.map((category) => [category, String(savedBudgets[category] ?? budgets[category])]),
        ),
      );
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
          <div className="card__header">
            <h2 className="h2">總覽預算</h2>
            {saved && <span className="micro" style={{ color: 'var(--color-mint-deep)', letterSpacing: 0 }}>已儲存</span>}
          </div>
          <p className="caption" style={{ lineHeight: 1.7 }}>
            這些數字會用在總覽的變動預算卡；支出仍由交易分類與標籤自動計算。
          </p>
          <form onSubmit={saveSettings} className="form-grid">
            {BUDGET_CATEGORIES.map((category) => (
              <label key={category} className="form-field">
                <span className="micro">{category}</span>
                <input
                  className="text-input mono"
                  type="number"
                  min="0"
                  step="1"
                  value={dashboardBudgets[category] ?? ''}
                  onChange={(event) =>
                    setDashboardBudgets((current) => ({
                      ...current,
                      [category]: event.target.value,
                    }))
                  }
                />
              </label>
            ))}
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
