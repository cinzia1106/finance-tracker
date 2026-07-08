import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AdapterProvider } from './data/AdapterContext';
import AppLayout from './layout/AppLayout';
import DashboardPage from './features/dashboard/DashboardPage';
import AssetsPage from './features/assets/AssetsPage';
import PlaceholderPage from './features/placeholder/PlaceholderPage';
import UpdatePrompt from './components/UpdatePrompt';

// GitHub Pages serves the app under /<repo>/; BASE_URL follows vite `base`.
const routerBasename = import.meta.env.BASE_URL.replace(/\/$/, '');

export default function App() {
  return (
    <AdapterProvider>
      <BrowserRouter basename={routerBasename}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route index element={<DashboardPage />} />
            <Route path="assets" element={<AssetsPage />} />
            <Route path="transactions" element={<PlaceholderPage title="明細" />} />
            <Route path="import" element={<PlaceholderPage title="匯入" />} />
            <Route path="inbox" element={<PlaceholderPage title="待確認" isManagement />} />
            <Route path="recurring" element={<PlaceholderPage title="固定支出" isManagement />} />
            <Route path="investments" element={<PlaceholderPage title="投資" isManagement />} />
            <Route path="monthly-review" element={<PlaceholderPage title="月報" isManagement />} />
            <Route path="settings" element={<PlaceholderPage title="設定" isManagement />} />
          </Route>
        </Routes>
      </BrowserRouter>
      <UpdatePrompt />
    </AdapterProvider>
  );
}
