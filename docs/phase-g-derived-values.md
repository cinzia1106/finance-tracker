# Phase G — Derived Values + Snapshot Input（任務規格）

> 執行者：Codex（資料層）。本文件由 UI 側整理，對應 `spec-v2.1.md` 的
> 衍生值規則。視覺已完成並凍結：**UI 合約 = `src/data/adapter.ts` 的
> `MonthOverview` / `AssetOverview` 型別**，實作時填滿欄位即可，不要改
> 元件與樣式（見 `docs/design-ownership.md`）。

## 背景（現況問題）

`SupabaseDataAdapter.getMonthOverview` / `getAssetOverview`
（`src/data/supabaseAdapter.ts`）目前是 Phase B 的樁：

- `incomeBySource: []`、`expenseGroups: []`、`budgets: []`
- `creditCard` / `safeline` / `investment` 全為 0
- `getAssetOverview` 整包回傳 0，每個帳戶 `balance: 0`，`netWorthHistory: []`
- `phaseNote: 'Supabase Foundation'`（工程字樣，會顯示在 UI）
- `lastImportNote: null`

因此總覽的支出三組／變動預算／信用卡／安全線／投資卡，以及整個資產頁
（含 NaN%）都是空的，與交易資料是否存在無關。

## G-1 分類定義（groups 與 budgets 的資料來源）

spec §4.4 的 8 個支出分類（群組＋預算）與 5 個收入分類目前不存在於
DB。請建立單一來源（擇一，建議 A）：

- A. seed 進既有 `category_rules` 表（或新增 migration 建 `categories`
  表），欄位含 `name / kind / group / budget`，RLS 同其他表。
- B. 程式常數模組 `src/data/categoryDefinitions.ts`（過渡方案，標 TODO）。

內容照 spec：食 variable 8000、生活 variable 3500、交通 variable 1500、
健身 fixed 7000、訂閱 fixed 2500、工作 growth null、大額 growth null、
其他 other null；收入：學校薪資／研究計畫費／外包／被動收入／其他。

## G-2 getMonthOverview 實作

以當月 transactions（既有查詢）＋ G-1 分類定義計算：

| 欄位 | 規則 |
|---|---|
| `incomeBySource` | income 依 category 加總，金額降冪 |
| `expenseGroups` | expense 依分類的 group 加總成 fixed/variable/growth 三組；**`other` 群組併入 variable**（讓三組合計＝支出合計；若改為排除請在註解說明） |
| `budgets` | 有 budget 的分類（食/生活/交通）：spent＝當月該分類 expense 合計（負數沖回自然抵減），budget 取自 G-1 |
| `creditCard.charged` | 當月 `type=expense` 且帳戶為 `credit_card` 型的合計 |
| `creditCard.due` / `dueDate` | 最新一筆對應信用卡的 debt_snapshot（`remaining_balance` / `next_due_date`）；無快照則 0 / '--' |
| `safeline` | 見 G-4；主帳戶最新餘額快照＋設定的兩段線 |
| `investment` | 見 G-5 |
| `lastImportNote` | 最新 import_batches：`MM/DD · 檔名`；無批次為 null |
| `phaseNote` | 改為中性字串（如 `'月結進行中'`），不得出現工程用語 |
| `recentTransactions[].account` | 目前塞 `accountId ?? ''`，改為帳戶名稱（`tx.account`），transfer 顯示 `來源 → 目的` |

轉帳、退款規則沿用既有 spec：transfer 不入收支；負數 expense 抵減原分類。

## G-3 getAssetOverview 實作

- 每帳戶餘額 = 該帳戶**最新一筆** `asset_snapshots.balance`；快照日期
  即 `confirmedAt`（MM/DD），`sourceLabel` 依 `source` 映射
  （manual_check→手動、statement→對帳單、import_derived→推導）。
- **超過 90 天未更新 → `stale: true` 且 `balance: null`**（UI 已會顯示
  「待更新」與 `—`，並應排除於淨資產）。
- `cashAndBank` = cash+bank 型帳戶最新快照合計（排除 stale）。
- `investmentValue` / `investmentSnapshotDate` = 投資（virtual）帳戶最新
  快照的 `market_value` / 日期。
- `liabilities` = debt_snapshots 每個 name 取最新一筆；`liabilityTotal`
  為其合計＋信用卡待繳（不可重複計）。
- `netWorth = cashAndBank + investmentValue − liabilityTotal`。
- `disposableCash` = cashAndBank − 安全線第一線 −（30 天內到期應付款）
  ，低於 0 顯示 0。
- `netWorthHistory` = 近 6 個月，每月取該月最後快照組合計算；資料不足
  的月份省略。

## G-4 安全線設定

- 需要使用者設定：主帳戶（郵局角色）、第一線金額、安心線金額。
- 儲存位置擇一：`profiles` 加欄位（migration）或新 `user_settings` 表
  （RLS 同規範）。
- 設定 UI：設定頁加一張卡（表單三欄位），寫入即可，樣式用既有
  tokens／`.card`／`.text-input`，不要新視覺。
- `safeline.balance` = 主帳戶最新餘額快照。

## G-5 投資摘要

- `netInvested` = 轉入投資帳戶的 transfer 合計 − 轉出合計（全期間）。
- `monthlyBuy` = 當月轉入投資帳戶的 transfer 合計。
- `marketValue` / `snapshotDate` 同 G-3。
- `unrealizedGain = marketValue − costBasis`（最新快照的 cost_basis；
  無 cost_basis 時用 netInvested 並註明）。
- `dividendTotal` = category「被動收入」的 income 全期間合計。

## G-6 快照輸入 UI（功能件，最小樣式）

1. 資產頁「更新餘額快照」按鈕接表單：選帳戶＋金額＋日期（預設今日）
   ＋來源（預設 manual_check）→ 寫入 asset_snapshots。
2. 投資頁加「更新市值快照」：market_value＋cost_basis＋日期。
3. 負債：新增／更新 debt_snapshot（name、remaining_balance、
   monthly_payment、next_due_date）。
4. 全部走既有 adapter CRUD 模式（含 RLS user_id），表單用既有
   dialog 樣式（參考 `QuickNoteDialog` 的 `.qn-*` class 可直接複用）。

## 限制

- 不改 UI 元件與樣式；adapter 介面型別如需加欄位，先加在
  `src/data/adapter.ts` 並保持既有欄位相容。
- 不改 dedupe key、import validation、sync queue 行為。
- 新表／新欄位必須：RLS enable、`user_id = auth.uid()` policy、
  `id/user_id/created_at/updated_at`。
- 任何 UI 字串不得出現使用者姓名或工程術語（Supabase、Phase 等）。

## 驗收

```text
[ ] 總覽：支出三組、變動預算、收入來源、信用卡、上次匯入 有數字
[ ] 總覽 phaseNote 不再顯示工程字樣
[ ] 資產頁：輸入餘額快照後，帳戶表、淨資產、組成比例正確（無 NaN）
[ ] 90 天未更新的帳戶顯示待更新且不計入淨資產
[ ] 投資頁：買賣轉帳正確算入淨投入；股息=被動收入合計
[ ] 安全線：設定後總覽/資產水位條與差額正確
[ ] npm run build 通過；既有匯入驗證與月報數字不變
```
