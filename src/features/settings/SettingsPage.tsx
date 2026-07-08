/* 設定 Settings — visual layer. Sign-out reuses the existing auth flow;
   export is a Phase D placeholder (no Google Sheets API in this round). */

import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';

export default function SettingsPage() {
  const { signOut } = useAuth();

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
          <h2 className="h2">資料備份</h2>
          <p className="caption" style={{ lineHeight: 1.7 }}>
            月結備份以 Google Sheets 相容 CSV 匯出；不做即時同步寫入。
          </p>
          {/* TODO(Phase D): full backup + monthly review CSV export
              (finance-tracker-backup-YYYY-MM-DD.zip). Google Sheets OAuth
              integration is intentionally deferred — see architecture note. */}
          <div>
            <button type="button" className="btn btn--secondary" disabled>
              Export for Google Sheets（Phase D 提供）
            </button>
          </div>
        </section>

        <section className="card span-12">
          <h2 className="h2">關於</h2>
          <div className="caption" style={{ lineHeight: 1.7 }}>
            Finance Tracker — local-first 個人財務系統。
            資料主來源為雲端資料庫，離線時使用本機快取並於恢復連線後同步。
          </div>
        </section>
      </div>
    </>
  );
}
