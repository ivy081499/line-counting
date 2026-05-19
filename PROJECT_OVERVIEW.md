# 算算算數學專案說明

這是 LINE 官方帳號 + Cloudflare Worker + Cloudflare D1 的注單整理助手。

使用者透過 LINE Rich Menu 選擇朋友、送出文字或圖片注單，系統會保存原始訊息、解析成標準注單、計算支數，並提供今日/過往報表與成本管理。

## 目前交接狀態

- 工作目錄：`/Users/admin/Desktop/line-counting`
- 目前所在分支：`dev`
- 目前 HEAD：`0d1c1d5 Merge branch '數字檢查' into dev`
- `dev` 目前已與 `origin/dev` 對齊在 `0d1c1d5`。
- 今天已建立並 merge：
  - `網頁報表`：`896dd59 新增網頁報表與LINE入口`，merge commit `38b32a6`
  - `數字檢查`：`4ecbc4f 補下注號碼檢查`，merge commit `0d1c1d5`
- 目前沒有 stash。
- 工作區仍有 `.DS_Store` 未提交變更；不要把它混進功能 commit。
- 本機 Codex 已新增並驗證 `counting-handoff` skill；之後使用者說「交接今日counting專案工作」或類似語句時，應依該 skill 更新本專案交接 Markdown。
- 歷史中有 merge commit `5ec9f85 Merge remote-tracking branch 'origin/dev' into dev`，但它不是目前 HEAD。
- 目前 fine-tuned model：`ft:gpt-4o-2024-08-06:personal::DgvIeiS6`
- 第一版 fine-tuned model eval：`6/27` 通過、`21` 失敗、`0` error。
- 這個模型目前不適合直接接到 LINE 正式使用；需要補資料、重訓或改走 general vision model + prompt + deterministic post-processing。
- 不要主動跑 OpenAI API/eval。等使用者明確說新資料補完且同意測試後再跑，避免浪費 API 額度。
- 今日驗證已跑：
  - `npm run check`
  - `npm run build`
  - `src/calculations.js` parser smoke tests

下一個 session 建議先讀：

1. `README.md`
2. `BUSINESS_LOGIC.md`
3. `ai-training/PROJECT_HANDOFF.md`
4. `ai-training/README.md`
5. `ai-training/FINE_TUNE_JOB.md`
6. `AI_FAILURE_CASES_TO_COLLECT.md`

## 技術架構

```text
LINE 官方帳號
  -> Cloudflare Worker /line/webhook
  -> Cloudflare D1
  -> OpenAI API
```

主要元件：

- LINE 官方帳號：使用者互動入口。
- Cloudflare Worker：Webhook、業務流程、LINE 回覆、OpenAI 呼叫。
- Cloudflare D1：朋友、session、原始訊息、解析結果、成本資料。
- OpenAI API：文字/圖片注單正規化。

## 開發方式

目前是「多檔開發、單檔輸出」。

平常修改：

```text
src/
```

不要直接修改：

```text
main.js
```

改完後執行：

```bash
npm run build
```

輸出：

```text
dist/worker.js
main.js
```

Cloudflare Worker 要貼的是：

```text
dist/worker.js
```

## 檔案分工

- `src/main.js`：Webhook 入口、LINE 事件分派、主要業務流程。
- `src/constants.js`：Rich Menu 指令、內部指令、pending action、彩種、預設成本。
- `src/db.js`：D1 schema 建立與資料存取。
- `src/calculations.js`：標準注單文字解析與支數計算。
- `src/aiParser.js`：呼叫 OpenAI，把文字/圖片正規化成標準 JSON。
- `src/lineContent.js`：下載 LINE 圖片，轉 base64 給 AI。
- `src/reports.js`：注單報表與成本報表文字格式。
- `src/webReport.js`：`/reports` 網頁每日總報表 HTML。
- `src/lineReplies.js`：LINE text reply 與 Flex Message。
- `src/costs.js`：成本輸入解析、成本 pending action 編碼/解碼。
- `src/utils.js`：日期、白名單、數字格式等工具。
- `ai-training/`：AI 訓練案例、JSONL 產生器、eval 腳本。

## 環境變數

Cloudflare Worker 需要：

```text
LINE_CHANNEL_ACCESS_TOKEN
ALLOWED_USER_IDS
OPENAI_API_KEY
```

可選：

```text
OPENAI_MODEL
REPORT_ACCESS_TOKEN
REPORT_URL
```

fine-tune 成功後，`OPENAI_MODEL` 應設定成：

```text
ft:gpt-4o-2024-08-06:personal::DgvIeiS6
```

但目前 eval 只有 `6/27` 通過，不建議現在設定到正式 LINE Worker。

本機測試用的 API key 放在：

```text
ivy.env
```

`ivy.env` 已被 `.gitignore` 忽略。不要把 API key 印出、提交、寫進 Markdown 或貼到聊天。

## Rich Menu

六個入口：

1. 選朋友下單
2. 今日注單
3. 過往注單
4. 朋友管理
5. 成本管理
6. 說明

目前「成本管理」子選單中的「每日總報表」按鈕會直接開啟 Worker 的 `/reports` 網頁報表，而不是走 LINE 文字報表流程。使用者仍可手動送出 `每日總報表` 觸發舊的日期選單文字流程。

## 網頁報表

Worker 新增：

```text
GET /reports
```

用途：

- 顯示每日總報表。
- 支援日期搜尋與朋友篩選。
- 不選朋友時顯示該日期全部朋友。
- 頁面頂部顯示全日總統計。
- 每位朋友先顯示朋友總統計。
- 每位朋友底下依彩種分區，彩種區塊有獨立統計。
- 注單明細預設收起，可展開查看。

環境變數：

- `REPORT_ACCESS_TOKEN`：可選。設定後 `/reports` 必須帶 `?token=...`；LINE 按鈕會自動帶 token。
- `REPORT_URL`：可選。指定報表完整網址；未設定時會用目前 Worker origin 組出 `/reports`。

部署注意：

- 今天已重新 build，`dist/worker.js` 包含網頁報表與數字檢查更新。
- Cloudflare Worker 手動部署時貼新版 `dist/worker.js`。

## 資料庫

D1 tables：

- `friends`
- `user_sessions`
- `raw_messages`
- `parsed_entries`
- `friend_costs`
- `ai_parse_results`

schema 由 `src/db.js` 的 `ensureDatabaseSchema()` 建立。

## 重要原則

- 使用者人工操作不需要輸入 `#朋友`。
- `#朋友` 是 Flex Message postback/text 內部指令。
- 文字與圖片注單最後都要變成同一種標準注單格式。
- AI 只做正規化，不做支數計算。
- 支數計算由 `src/calculations.js` 負責。
- 使用者可見的二、三、四玩法文案已改成 `二♥`、`三♥`、`四♥`，避免敏感字詞；內部 pick 仍維持 `2`、`3`、`4`。
- 注單寫入 `parsed_entries` 前會檢查格式、號碼範圍與號重。
- 圖片 OCR/AI 解析後，也走同一套 `parsed_entries` 流程。
- AI 輸出在 eval 穩定前不能信任，LINE 正式流程必須保留 `ai_parse_results` 方便追查。
