import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import AuthGate from './auth/AuthGate';
import { AdapterProvider } from './data/AdapterContext';
import { SyncedDataAdapter } from './data/syncedAdapter';
import AppLayout from './layout/AppLayout';
import DashboardPage from './features/dashboard/DashboardPage';
import AssetsPage from './features/assets/AssetsPage';
import ImportPage from './features/import/ImportPage';
import PlaceholderPage from './features/placeholder/PlaceholderPage';
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
                <Route path="transactions" element={<PlaceholderPage title="Transactions" />} />
                <Route path="import" element={<ImportPage />} />
                <Route path="inbox" element={<PlaceholderPage title="Inbox" isManagement />} />
                <Route path="recurring" element={<PlaceholderPage title="Recurring" isManagement />} />
                <Route path="investments" element={<PlaceholderPage title="Investments" isManagement />} />
                <Route
                  path="monthly-review"
                  element={<PlaceholderPage title="Monthly Review" isManagement />}
                />
                <Route path="settings" element={<PlaceholderPage title="Settings" isManagement />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </AdapterProvider>
      </AuthGate>
      <UpdatePrompt />
    </AuthProvider>
  );
}
