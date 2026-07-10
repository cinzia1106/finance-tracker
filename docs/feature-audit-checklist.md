# Finance Tracker 使用說明與功能取捨清單

這份文件用來幫你判斷哪些功能要保留、隱藏、刪除，哪些可以交給系統自動化。目標不是把 Finance Tracker 變得更大，而是讓它更貼近你的日常使用：看花費、理解現金流、追蹤匯入資料品質。

## 目前主要使用流程

### 1. 匯入資料

頁面：`匯入`

用途：
- 上傳 cleaned CSV
- 預覽資料
- 檢查 duplicate / needs_review / error
- 確認後寫入 Supabase
- 必要時 rollback 某一批 import batch

建議保留。這是目前資料進來的核心入口。

人工檢查重點：
- CSV 是否是固定格式：`date,type,amount,category,account,to_account,note`
- duplicate 是否合理
- needs_review 是否需要手動整理
- transfer 是否沒有被算成收入或支出

可以自動化：
- 匯入後自動產生月報摘要
- 自動列出 needs_review 清單
- 自動標出退款、提款、信用卡繳款、股票交割等特殊交易

## 2. 花費記錄

頁面：`明細 / Transactions`

用途：
- 查看所有交易
- 看日期、分類、金額、帳戶、備註
- 手動新增、修改、刪除交易

建議保留，而且應該成為最常用頁面。

可以簡化：
- 預設只看本月
- 預設隱藏 transfer，改用切換顯示
- needs_review 交易用清楚標記
- 把複雜財務指標移到月報，不塞在交易頁

可以自動化：
- 自動依月份分組
- 自動計算本月支出、收入、淨現金流
- 自動標出異常大額或未分類交易

## 3. 月報

頁面：`月報 / Monthly Review`

用途：
- 本月收入
- 本月支出
- 淨現金流
- 支出分類摘要
- 收入分類摘要
- transfer 統計
- refund 抵減
- needs_review 統計
- CSV / ZIP 匯出

建議保留。這是理解理財狀況的核心頁面。

可以簡化：
- 第一層只顯示：
  - 收入
  - 支出
  - 淨現金流
  - 最大支出分類
  - needs_review
- 進階明細摺疊或放下方

可以自動化：
- 每月自動生成 summary
- 自動產生「本月最大支出」
- 自動產生「比上月增加最多的分類」
- 自動產生「建議檢查項目」

## 4. 待確認 Inbox

頁面：`待確認 / Inbox`

用途：
- 收納 needs_review 交易
- 讓你逐筆確認

建議保留，但可以變得更輕。

可以簡化：
- 只顯示 needs_review
- 一鍵確認
- 一鍵改分類
- 不要放太多其他管理功能

可以自動化：
- 依 note / account / amount 推薦可能分類
- 但不要自動硬改分類
- 高風險交易仍由你確認

## 5. 資產頁 Assets

頁面：`資產 / Assets`

用途：
- asset snapshots
- debt snapshots
- net worth estimate
- emergency fund
- investment snapshot

目前複雜度偏高。

建議：
- 如果你現階段主要想看花費，先「隱藏入口」或降級成進階頁
- 不一定刪除資料層，因為未來還會用到

可選處理：
- [ ] 保留完整 Assets
- [ ] 只保留 net worth + 現金餘額
- [ ] 暫時從主 navigation 隱藏
- [ ] 刪除 snapshot input，只保留讀取摘要
- [ ] 完全暫停資產模組

可以自動化：
- 用每月手動輸入一次 snapshot
- 自動估算 net worth
- 自動標記超過 90 天未更新的資產

## 6. 固定支出 Recurring

頁面：`固定支出 / Recurring`

用途：
- 訂閱
- 固定付款
- 週期性支出

目前如果沒有穩定維護，容易變成額外負擔。

建議：
- 現階段可先隱藏
- 等交易資料穩定後，再從歷史支出自動推測固定支出

可選處理：
- [ ] 保留
- [ ] 隱藏入口
- [ ] 改成只讀摘要
- [ ] 未來自動從交易偵測

可以自動化：
- 每月相同金額 / 相似 note 自動偵測
- 自動列出疑似訂閱
- 讓你確認後才加入 recurring

## 7. 投資 Investments

頁面：`投資 / Investments`

用途：
- 投資淨投入
- market value
- dividend
- unrealized gain

目前若沒有穩定 snapshot，容易不準。

建議：
- 如果目標是先看花費，投資頁可以先降級或隱藏
- 保留資料結構，不急著做 UI

可選處理：
- [ ] 保留
- [ ] 隱藏入口
- [ ] 只在 Assets 顯示一行投資市值
- [ ] 暫停投資細節

可以自動化：
- 從 transfer 到投資帳戶估算 net invested
- 從 asset snapshot 讀 market value
- dividend income 自動歸類

## 8. Settings

頁面：`設定`

用途：
- 登出
- emergency fund months
- 匯出提示

建議保留，但保持簡單。

可以保留：
- 登出
- Emergency fund target months
- 資料狀態 / migration 狀態

可以移除或隱藏：
- 太早出現的 Google Sheets API 說明
- 不會立即使用的設定項

## 主 Navigation 建議

目前功能偏多。建議改成兩層：

### 常用

- 總覽
- 明細
- 月報
- 匯入

### 進階

- 待確認
- 資產
- 固定支出
- 投資
- 設定

可選方案：

- [ ] 維持目前 navigation
- [ ] 主 navigation 只留 4 個常用頁
- [ ] 進階功能放到 Settings
- [ ] 進階功能保留 URL，但不放主選單

## 建議保留的核心資料能力

這些不要刪，因為是資料正確性的基礎：

- Supabase auth
- RLS
- transactions
- import_batches
- CSV parser / validation
- dedupe key
- rollback import batch
- IndexedDB cache
- sync queue
- needs_review status

## 可以考慮刪除或暫停的功能

優先考慮隱藏，不一定真的刪資料表。

- [ ] Assets snapshot input
- [ ] Debt snapshot input
- [ ] Recurring page
- [ ] Investments page
- [ ] Emergency fund 設定
- [ ] 複雜 dashboard 卡片
- [ ] credit card due summary
- [ ] net worth trend
- [ ] investment gain calculation

## 可以自動化的功能

- [ ] 匯入後自動產生月報摘要
- [ ] 匯入後自動列 needs_review
- [ ] 自動偵測 refund
- [ ] 自動偵測 transfer
- [ ] 自動偵測信用卡繳款
- [ ] 自動偵測股票交割
- [ ] 自動偵測疑似固定支出
- [ ] 自動產生月支出排行
- [ ] 自動產生與上月比較
- [ ] 自動輸出 Google Sheet 相容 CSV

## 建議下一輪人工決策

## 已確認方向

- 保留完整 Assets。
- 保留 Investments。
- 維持目前 navigation，不隱藏主要入口。
- 能自動化的先自動化。
- 固定支出先從交易自動偵測，避免人工維護 recurring 清單變成負擔。
- 自動偵測結果要能被人工調整或隱藏，不直接改原始交易。
- 不做 Google Sheets API。
- 不把分類硬猜後直接寫回，仍保留人工確認。

請先勾選以下項目：

### 我每天或每週會用

- [ ] 明細
- [ ] 月報
- [ ] 匯入
- [ ] 待確認
- [ ] 資產
- [ ] 固定支出
- [ ] 投資

### 我想先隱藏

- [ ] 資產
- [ ] 固定支出
- [ ] 投資
- [ ] Settings 裡的進階項目
- [ ] Dashboard 複雜卡片

### 我想交給系統自動做

- [ ] 匯入後月報
- [ ] needs_review 清單
- [ ] 固定支出偵測
- [ ] refund 偵測
- [ ] transfer 偵測
- [ ] 月支出排行
- [ ] 匯出備份

## 最小重構建議

如果要減少複雜度，但不過度砍功能，建議下一輪做：

1. 主頁只顯示「本月摘要 + 最近交易 + needs_review」
2. 明細頁變成主要工作頁
3. 月報頁保留完整分析
4. 匯入頁保留完整流程
5. Assets / Recurring / Investments 先移到進階區
6. 不刪資料層，只先降低入口與認知負擔
