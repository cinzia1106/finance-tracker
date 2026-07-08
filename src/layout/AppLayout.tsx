/* Responsive shell: ≥960px shows the 216px sidebar; below that the four
   primary pages get a bottom nav + FAB, management pages a back header. */

import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useAdapter } from '../data/AdapterContext';
import { CountBadge } from '../components/ui';

const PRIMARY_NAV = [
  { to: '/', label: '總覽' },
  { to: '/assets', label: '資產' },
  { to: '/transactions', label: '明細' },
  { to: '/import', label: '匯入' },
];

const MANAGEMENT_NAV = [
  { to: '/inbox', label: '待確認', withBadge: true },
  { to: '/recurring', label: '固定支出' },
  { to: '/investments', label: '投資' },
  { to: '/monthly-review', label: '月報' },
  { to: '/settings', label: '設定' },
];

/** Mobile FAB appears on 總覽/資產/明細 only (design: not on 匯入). */
const FAB_PATHS = new Set(['/', '/assets', '/transactions']);

export default function AppLayout() {
  const adapter = useAdapter();
  const { signOut } = useAuth();
  const location = useLocation();
  const [reviewCount, setReviewCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    adapter.getNeedsReviewCount().then((n) => {
      if (!cancelled) setReviewCount(n);
    });
    return () => {
      cancelled = true;
    };
  }, [adapter]);

  const isPrimaryPage = PRIMARY_NAV.some((n) => n.to === location.pathname);
  const showFab = FAB_PATHS.has(location.pathname);

  return (
    <div className="app-shell">
      <nav className="sidebar">
        <div className="sidebar__logo">
          <div className="sidebar__logo-title">Finance Tracker</div>
        </div>
        {PRIMARY_NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `sidebar__item${isActive ? ' sidebar__item--active' : ''}`
            }
          >
            <span>{item.label}</span>
          </NavLink>
        ))}
        <div className="sidebar__group-label">管理</div>
        {MANAGEMENT_NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `sidebar__item${isActive ? ' sidebar__item--active' : ''}`
            }
          >
            <span>{item.label}</span>
            {item.withBadge && <CountBadge count={reviewCount} />}
          </NavLink>
        ))}
        <button
          type="button"
          className="sidebar__item sidebar__button"
          onClick={() => {
            signOut().catch(() => undefined);
          }}
        >
          <span>登出</span>
        </button>
      </nav>

      <main className="app-main">
        <Outlet />
      </main>

      {showFab && (
        <button type="button" className="fab" aria-label="快速手記">
          ＋
        </button>
      )}

      {isPrimaryPage && (
        <nav className="bottom-nav">
          {PRIMARY_NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `bottom-nav__item${isActive ? ' bottom-nav__item--active' : ''}`
              }
            >
              <span>{item.label}</span>
              <span className="bottom-nav__indicator" />
            </NavLink>
          ))}
        </nav>
      )}
    </div>
  );
}
