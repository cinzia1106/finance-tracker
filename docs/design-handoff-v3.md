# Finance Tracker — Design Handoff v3（2026-07 現況版）

> 用途：提供給 Claude Design 重新設計頁面的基準。本文件反映**目前已上線程式碼的實際狀態**
> （分支 claude-ui-refactor-round-3），取代第一輪的「心嘉記帳 視覺方向」handoff。
> 產出請維持 HTML 高保真設計參考（.dc.html 形式），tokens 精確重現。

## 0. 命名與隱私（硬規則）

- 產品名稱固定 **Finance Tracker**（英文，不翻譯）。
- 任何位置不得出現使用者姓名、暱稱或「心嘉記帳」字樣（畫面、示意資料、檔名皆同）。
- 示意資料用中性帳戶名（郵局薪轉戶、中信日常戶、錢包、國泰信用卡…）與虛構金額。
- UI 文案繁體中文；金額、日期、代碼用等寬字。

## 1. 產品一句話

Local-first 個人財務系統：月結 CSV 匯入為主、手記為例外；雲端同步（登入後多裝置）、
可安裝 PWA。所有資產數字以「最後確認快照」呈現，**絕不假裝即時餘額**。

三頁核心分工：**總覽＝這個月還能不能花、資產＝我現在有多少錢、月報＝這個月結論與下月調整**。

## 2. Design Tokens（與程式碼 tokens.css 一致）

### 色彩
| Token | Hex | 用途 |
|---|---|---|
| bg | `#F9F5F0` | 頁面背景（cream） |
| card | `#FFFFFF` | 卡片背景 |
| ink | `#373737` | 主文字 |
| ink-70 | `#6F6A63` | 次要內文 |
| ink-60 | `#8A8177` | 次文字、欄位標籤 |
| ink-40 | `#B9AE9F` | 第三層文字、佔位 |
| ink-muted-row | `#A79C8E` | 轉帳列整列降階 |
| hairline | `#E7DFD4` | 卡片邊框、表頭分隔線 |
| hairline-soft | `#F1EAE0` | 表格列分隔線 |
| bar-track | `#EFE8DE` | 條形軌道 |
| mocha | `#B5A38F` | 支出條、圖表輔助 |
| mint | `#B6D2C1` | 正向／收入條、主按鈕、FAB |
| mint-bar | `#9DBFAC` | 較深的 mint 條填色 |
| mint-deep | `#5F8471` | 文字級綠、線圖、active 指示 |
| mint-deeper | `#2F4A3D` | mint 底上的文字 |
| income-text | `#47695A` | 收入金額文字 |
| mint-tint | `#E9F1EC` | 已確認 badge、active nav、批次工具列 |
| mint-border | `#C9DED2` | 選中列框、active 篩選 |
| mint-row | `#F3F8F4` | **收入列整列淡底**（新增） |
| apricot | `#F3B38C` | 固定承諾條、警示填色 |
| apricot-strong | `#E89B63` | 預算超標條 |
| apricot-deep | `#B06A38` | 警示文字（待確認、負債、負現金流） |
| apricot-deepest | `#6B3F1D` | apricot 底上的內文 |
| apricot-tint | `#FAEEE3` | 待確認 badge、錯誤計數 |
| apricot-row | `#FDF7F0` | 待確認列整列淡底 |
| apricot-border | `#EBC9AC` | 警示卡邊框 |
| dot-orange | `#D98D55` | 警示圓點 |
| panel | `#F5F0E8` | 頁內說明塊、展開面板底 |
| row-hover | `#FBF8F3` | 表格列 hover |

規則：不用高飽和金融紅綠。收入 `#47695A` 帶「＋」且**整列 mint-row 淡底＋金額 600 字重**；
支出墨色帶「−」不上色；轉帳無符號、整列降階＋「不列入」；負現金流大數轉 apricot-deep。
狀態一律「顏色＋文字」雙編碼。

### 字體與字級
- UI：`Noto Sans TC` 400/500/700；金額日期代碼：`IBM Plex Mono` 400/500/600，千分位必加。
- Amount-XL 32/600 · Amount-L 20–22/600 · Amount-S 14/500 · H1 22/700 · H2 15/700 ·
  Body 13/400 · Caption 12/400 · Micro 11/500 tracking 0.06–0.1em。

### 間距、圓角、線、條形
- 間距 4/8/12/16/24/32；桌面頁 padding 28×32 gap16；手機 24×20 gap12。
- 圓角：6 小章 · 8 badge/輸入 · 10 按鈕 · 12 卡片；卡片 1px hairline **無陰影**。
- 條形：6px（分類支出/收入條）、10px（安全線水位）、12px（堆疊條）；
  **預算截止刻度＝2px 墨色豎線**（浮在 6px 條上，高 12px）。
- 圖表：線 1.5px、填色 ≤16% 透明；環圖（donut）帶寬 30–48、環上直接標分類名（占比≥7%）
  與金額（≥11%），hover 該段加粗＋其餘段 45% 透明＋游標旁白卡 tooltip（名/占比/金額）。

## 3. 佈局骨架

- **Desktop 1440**：左 216px 白色 sidebar（Finance Tracker 標題；主導航 總覽/資產/明細/匯入；
  「管理」群組 待確認(apricot 計數 badge)/固定支出/投資/月報/設定；底部「登出」）。
  內容 12-col grid gap16；頁首＝H1＋月份切換 `‹ ›`(28px 方框)＋caption＋右側主按鈕。
- **Mobile 390**：底部 64px bar 固定 4 分頁（總覽/資產/明細/匯入，active=700字重＋14×3 mint-deep 短線）；
  右下 52px mint 圓形 FAB「＋」開快速手記（總覽/資產/明細顯示）；
  **管理五頁從總覽底部的「管理」入口列表進入**（列＋chevron），管理頁用 32px `‹` 返回鍵 header。
- 手機與桌機**不是縮放關係**：桌機做表格/批次/月結，手機做查看/快速確認/快速手記。

## 4. 目前頁面結構（設計基準）

### 總覽 Overview
1. 淨現金流卡（span5）：Amount-XL（負值 apricot-deep）＋收入/支出圓點圖例＋轉帳註記。
2. 本月固定支出卡（span7）：檢視月份的固定項目列（名稱＋分類/繳費規則摘要｜金額｜
   已繳費(mint badge，點擊撤銷)/待繳(apricot badge，點擊記錄)）；右上「管理固定支出 →」；
   全繳清顯示「✓ 已全數繳清」；未建立顯示引導文案。
3. 分類支出卡（span4）：**各分類本月支出總額條（mocha，全卡共用比例尺）＋預算截止刻度線**；
   超標→條轉 apricot-strong＋「超出預算」；≥90%→「接近上限」；未設預算→只有條＋「未設預算」。
4. 分類收入卡（span4）：各收入來源 mint 條（以最大來源為比例尺）＋綠色 `+金額`。
5. 信用卡卡（span4）：本期已刷／待繳(apricot-deep)＋20日訂閱註記。
6. 最近交易表（span12，桌機限定）：日期/分類/備註/帳戶(200px 固定寬)/金額/狀態，
   列狀態＝收入 mint-row、待確認 apricot-row、轉帳降階。
7. 手機額外：管理入口列表卡（待確認含計數 badge）。

### 明細 Transactions（桌機高密度表格、手機依日分組卡片）
- 工具列：搜尋框＋狀態 chips（全部/已確認/待確認/轉帳）＋分類下拉（active 轉 mint 樣式）。
- 自動判別摘要條（panel 底一行：退款/轉帳/卡費繳款/投資交割/ATM 提款/建議確認，>0 橘字）。
- 表格（帳本式）：日期只在每日第一列印出、換日用完整 hairline 分隔；
  **類型/分類可行內下拉編輯**（類型上色：收入綠/轉帳灰）；**備註點擊即改**（hover 虛線）；
  標籤欄＝該分類的標籤選項 chips（選中 mint-tint）常駐可點；
  轉帳列帳戶顯示「A → B」單行完整＋「改帳戶」chip 開列下編輯條（轉出/轉入下拉＋確認/取消）；
  疑似重複列（同去重鍵）備註前掛橘「重複」chip；每列尾 ✕ → 列下 apricot 確認條刪除。

### 待確認 Inbox
單卡密集列表：全選＋mint-tint 批次工具列（已選 N 筆／標記為已確認／取消選取）；
每列＝checkbox｜日期｜mono 原始備註＋帳戶/標籤 caption｜建議分類 chip｜待確認 badge｜金額｜確認/跳過。
清空→2g 空狀態「收件匣已清空」。

### 匯入 Import
上傳 CSV 卡（span6：虛線 dropzone＋CSV header mono 提示＋去重規則說明）＋
帳單轉檔卡（span6：來源格式/帳戶名稱雙欄＋dropzone＋轉換結果＋下載標準 CSV）；
驗證預覽全寬（五計數：讀取/新增/重複略過/待確認(橘)/欄位錯誤(橘底)＋確認匯入主按鈕）；
逐列結果表（狀態章：新增 mint/重複 panel/待確認 apricot-tint/錯誤 apricot）；
匯入紀錄（日期・檔名・狀態章・列數＋回復此批次）。

### 固定支出 Fixed Costs（管理頁）
頁首：本月已繳 x/y · 月承諾＋「＋ 新增項目」。
新增/編輯表單：名稱/應繳金額/幣別/週期(月繳/半年繳/年繳/不定期)/分類/標籤/月繳扣款日/備註
（**無「下次扣款」欄——自動推算**：月繳依扣款日、年/半年繳依最後繳費＋一週期）。
列＝名稱＋摘要(分類·標籤·週期·繳費規則)｜金額(外幣才帶幣別前綴)｜已繳費/待繳章(一鍵切換)｜
「紀錄 n」/編輯/✕。點「紀錄」展開 panel 面板：新增繳費(日期＋按鈕)、每筆日期可改可刪、
「最新」標記、方案調整史唯讀；lastPaid 跟最新紀錄。

### 資產 Assets
淨資產卡(span4：Amount-XL＋較上月＋現金/投資/負債/可動用現金分解)｜淨資產趨勢(span5 線圖)｜
資產組成(span3 堆疊條＋負債占比)；手機第一屏＝淨資產＋三行速覽(實心圓/空心圓/短橫線符號)；
帳戶餘額全寬表(餘額＋最後確認日＋來源註記；>90天「待更新」badge＋金額 —)；負債/緊急預備金
(10px 水位＋兩刻度)；投資四指標；底部「月結更新」區＝新增帳戶/餘額快照/負債快照三張表單卡
（支援外幣＋匯率）。

### 月報 Monthly Review
頁首：月份切換＋「月結回顧，非即時數字」。品質 banner(apricot：N 筆待確認→前往待確認)。
第一層「本月結論」三數字（收入綠＋/支出−/淨現金流大字，負值橘）＋較上月差額＋三組堆疊條＋主要支出前五；
支出分類/收入來源＝滿版環圖(環上標籤＋hover tooltip＋chips 圖例)；
轉帳與退款、月末資產、下月配置列表卡；
底部「Export for Google Sheets」卡（工具化文案＋檔名 `finance-tracker-monthly-review-YYYY-MM.csv`
＋主按鈕匯出月報 CSV／次按鈕下載完整備份 ZIP）。

### 投資 Investments
四統計卡（累計淨投入/估計市值(快照日)/未實現損益(正綠負橘)/累計股息）＋持有標的說明＋
規則註記（買賣是轉帳不入生活收支）。

### 設定 Settings
帳號(登出)｜緊急預備金(目標月數，公式：第一線＝必要支出×月數、安心線＝×(月數+2，最少5))｜
總覽預算(各支出分類預算輸入)｜資料備份(連去月報匯出)｜關於。

### 登入 Login
置中白卡：micro「Finance Tracker」＋H1 登入＋說明＋mint 主按鈕「使用 Google 登入」。

### 快速手記 QuickNote（dialog）
overlay 32% ink 底＋420px 卡：日期/類型/金額/分類(依類型)/標籤(依分類)/帳戶(datalist)/
轉帳加轉入帳戶/備註；儲存 mint 主按鈕。

## 5. 共用元件字典

- **卡片** card：白底 1px hairline r12 p16 無陰影；card__header＝H2＋右側 micro 註記。
- **按鈕**：primary＝mint 底 mint-deeper 字 700；secondary＝白底 hairline；--sm＝5×12 12px。
- **狀態章 badge**：已確認/已繳費＝mint-tint＋綠點；待確認/待繳＝apricot-tint＋橘點；
  待更新＝bg 底 hairline 框。可為按鈕（可點切換）。
- **chips**：篩選/標籤 chip 白底 hairline r8；active/選中＝mint-tint＋mint-border；20px 高對齊。
- **表格**：micro 表頭＋hairline 底；列 hairline-soft 分隔、hover row-hover；
  列狀態＝income/review/muted 三種底；金額一律右對齊 mono。
- **表單** form-grid：雙欄(手機單欄)、micro 標籤在上、text-input r8 hairline focus mint-border。
- **展開面板**：panel 底 r8，用於繳費紀錄/轉帳編輯/刪除確認（apricot-tint 版）。
- **空狀態 2g**：白卡置中 48px panel 圖示塊＋H2＋兩行 caption＋0–2 按鈕。
- **自動判別摘要條**：panel 底一行 flex 計數。
- **更新提示**：底部懸浮白卡「有新版本可以使用」＋更新/關閉。

## 6. 互動與資料誠實規則（設計時必守）

- 待確認三處同步：sidebar 計數 badge、明細/收件匣列底色、月報品質 banner。
- 「最後確認日期」出現在：帳戶列、安全線、投資市值、負債；過期→「待更新/待補」＋不計入。
- 轉帳/退款規則：transfer 不入收支；負數 expense＝退款沖回（正數綠顯示）；繳卡費是轉帳。
- 行內編輯模式：點擊即改（備註）、下拉即存（類型/分類）、chips 即點即存（標籤）、
  破壞性操作一律兩段式確認（apricot 確認條）。
- Hover：列 row-hover、sidebar panel 底；無 skeleton 以外的裝飾動效、無玻璃擬態、無科技藍。

## 7. 給 Claude Design 的任務框架（重設計時附上）

- 保留：tokens、佈局骨架、元件字典、命名/隱私規則、互動規則。
- 可重新設計：頁面內的資訊層級、卡片組合、圖表形式（但保持 1.5px 線＋低飽和）。
- 交付：`.dc.html` 高保真參考，Desktop 1440×1024＋Mobile 390×844 各一，
  金額用符合上述規則的虛構 seed；畫面外框是畫布裝飾不屬 UI。
- 本輪要重設計的頁面：＿＿＿＿（使用時填入）。
