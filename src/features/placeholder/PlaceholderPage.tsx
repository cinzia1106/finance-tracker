/* Stub for pages scheduled for later rounds (明細/匯入/收件匣/固定支出/投資/月報/帳戶設定).
   Mobile management pages use the back-header per design. */

import { Link } from 'react-router-dom';

export default function PlaceholderPage({
  title,
  isManagement = false,
}: {
  title: string;
  isManagement?: boolean;
}) {
  return (
    <>
      <header className="page-header">
        <div className="page-header__lead">
          {isManagement && (
            <Link to="/" className="back-header__btn mobile-only" aria-label="返回總覽">
              ‹
            </Link>
          )}
          <h1 className="h1">{title}</h1>
        </div>
      </header>
      <section className="card" style={{ alignItems: 'center', padding: '48px 24px', gap: 12 }}>
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: 12,
            background: 'var(--color-panel)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 20,
            color: 'var(--color-ink-40)',
          }}
        >
          …
        </div>
        <h2 className="h2">{title}尚未實作</h2>
        <p className="caption" style={{ textAlign: 'center' }}>
          此頁面屬於後續輪次的實作範圍。
          <br />
          資料層接上後將依 spec-v2.1 規則呈現。
        </p>
      </section>
    </>
  );
}
