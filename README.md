# Finance Tracker

Local-first personal finance tracker.
月結 CSV 匯入為主、手記為例外；資料規則的單一事實來源是 `spec-v2.1.md`。

## Tech stack

- Vite + React + TypeScript（無 UI library；design tokens 於 `src/styles/tokens.css`）
- PWA：vite-plugin-pwa（installable、offline app shell、更新提示）
- Hosting：GitHub Pages（GitHub Actions 自動部署）
- 認證與雲端資料庫（Phase B 起）：Supabase Auth + Postgres，RLS 以 `auth.uid()` 隔離
- 離線快取（Phase C 起）：IndexedDB + sync queue
- 備份（Phase D 起）：Google Sheets 相容 CSV 匯出

## Local development

```bash
npm install
npm run dev        # http://localhost:5173，base = /
```

```bash
npm run build      # tsc + vite build，輸出 dist/
npm run preview    # 本機預覽 production build（含 service worker）
```

## Environment variables

複製 `.env.example` 為 `.env.local` 後填入：

```text
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
```

這兩個是唯一允許出現在前端與 CI 的變數。
**禁止**在 repo、前端程式或 CI 中出現 `SUPABASE_SERVICE_ROLE_KEY`、
`SUPABASE_SECRET_KEY`（會繞過 RLS）。

## Deployment (GitHub Pages)

部署由 `.github/workflows/deploy.yml` 自動執行：push 到 `main` 即 build 並發佈。

一次性設定：

1. GitHub repository → **Settings → Pages → Source** 選 **GitHub Actions**。
2. （Phase B 之後）Settings → Secrets and variables → Actions → **Variables**
   加入 `VITE_SUPABASE_URL`、`VITE_SUPABASE_PUBLISHABLE_KEY`。

行為說明：

- Workflow 以 `VITE_BASE_PATH=/<repo-name>/` build，Vite `base` 與
  React Router `basename` 都跟著這個值，本機開發仍是 `/`。
- SPA fallback：build 後複製 `index.html` 為 `404.html`，深層路由
  重新整理不會 404。

手動等價指令：`npm run build`（CI 內即此指令）＋ Actions 部署；不需要
本機 `npm run deploy`。

## PWA

- Manifest 名稱：`Finance Tracker`（name / short_name 一致）
- 安裝測試：手機 Chrome 開啟部署網址 → 選單「加入主畫面 / 安裝應用程式」；
  桌面 Chrome 網址列右側會出現安裝圖示
- 離線：安裝或造訪過一次後，斷網仍可開啟 app shell；有新版本時
  App 內會出現「有新版本可以使用」提示

## Privacy

- 對外名稱一律 **Finance Tracker**，UI 與匯出檔名不得含任何個人姓名。
- 真實 CSV、`seed-data.private.json`、帳戶末碼等一律不得提交
  （見 `.gitignore`）。
