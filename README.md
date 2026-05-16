# line-counting

LINE 官方帳號 + Cloudflare Worker + Cloudflare D1 的注單整理助手。

## 開發方式

- 平常改 `src/` 裡的多個 JS 檔，方便閱讀與維護。
- 跑 `npm run build` 會輸出單檔 `dist/worker.js`。
- build 也會同步更新根目錄 `main.js`，避免 Cloudflare 手動貼上時拿到舊版。
- 要貼到 Cloudflare Worker 時，複製 `dist/worker.js` 的內容即可。
- 之後不要直接改根目錄的 `main.js`；請改 `src/` 後重新 build。

## 檔案分工

- `src/main.js`：Webhook 入口、LINE 事件分派、主要業務流程。
- `src/constants.js`：Rich Menu 指令、內部指令、pending action、預設成本。
- `src/db.js`：D1 schema 建立與資料存取。
- `src/calculations.js`：注單文字解析與支數計算。
- `src/aiParser.js`：呼叫 OpenAI，將文字/圖片注單正規化成標準注單 JSON。
- `src/lineContent.js`：下載 LINE 圖片內容，轉成可送給 AI 的 base64。
- `src/reports.js`：注單報表與成本報表文字格式。
- `src/lineReplies.js`：LINE text reply 與 Flex Message。
- `src/costs.js`：成本輸入解析、成本 pending action 編碼/解碼。
- `src/utils.js`：日期、白名單、數字格式等工具。

## AI 解析

- Cloudflare Worker 需要設定 `OPENAI_API_KEY`。
- 可選設定 `OPENAI_MODEL`，未設定時預設使用 `gpt-4.1-mini`。
- AI 只負責把文字或圖片正規化成標準注單行，不負責計算支數。
- 支數仍由 `src/calculations.js` 的 deterministic 程式邏輯計算。
- AI 解析結果會寫入 `ai_parse_results`，方便之後除錯或重算。
