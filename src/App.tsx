import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import AuthGate from './auth/AuthGate';
import { AdapterProvider } from './data/AdapterContext';
import { SyncedDataAdapter } from './data/syncedAdapter';
import AppLayout from './layout/AppLayout';
import DashboardPage from './features/dashboard/DashboardPage';
import AssetsPage from './features/assets/AssetsPage';
import TransactionsPage from './features/transactions/TransactionsPage';
import ImportPage from './features/import/ImportPage';
import InboxPage from './features/inbox/InboxPage';
import InvestmentsPage from './features/investments/InvestmentsPage';
import MonthlyReviewPage from './features/review/MonthlyReviewPage';
import SettingsPage from './features/settings/SettingsPage';
import SyncBootstrap from './sync/SyncBootstrap';
import UpdatePrompt from './components/UpdatePrompt';

// GitHub Pages serves the app under /<repo>/; BASE_URL follows vite `base`.
const routerBasename = import.meta.env.BASE_URL.replace(/\/$/, '');
const adapter = new SyncedDataAdapter();

export default function App() {
  return (
    <AuthProvider>
      <AuthGate>
        <AdapterProvider adapter={adapter}>
          <SyncBootstrap />
          <BrowserRouter basename={routerBasename}>
            <Routes>
              <Route element={<AppLayout />}>
                <Route index element={<DashboardPage />} />
                <Route path="assets" element={<AssetsPage />} />
                <Route path="transactions" element={<TransactionsPage />} />
                <Route path="import" element={<ImportPage />} />
                <Route path="inbox" element={<InboxPage />} />
                {/* 固定支出頁已併入總覽的本月支出三組 */}
                <Route path="recurring" element={<Navigate to="/" replace />} />
                <Route path="investments" element={<InvestmentsPage />} />
                <Route path="monthly-review" element={<MonthlyReviewPage />} />
                <Route path="settings" element={<SettingsPage />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </AdapterProvider>
      </AuthGate>
      <UpdatePrompt />
    </AuthProvider>
  );
}
