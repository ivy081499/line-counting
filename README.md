# line-counting

LINE 官方帳號 + Cloudflare Worker + Cloudflare D1 的注單整理助手。

## 下一個 Codex Session 先讀

請先依序閱讀：

1. `PROJECT_OVERVIEW.md`
2. `BUSINESS_LOGIC.md`
3. `ai-training/PROJECT_HANDOFF.md`
4. `ai-training/README.md`
5. `ai-training/FINE_TUNE_JOB.md`
6. `AI_FAILURE_CASES_TO_COLLECT.md`

目前狀態摘要：

- 目前所在分支是 `對獎`，HEAD 是 `78df960 完成對獎`。
- `dev` 目前已與 `origin/dev` 對齊在 `2c0eccc`。
- `對獎` 是本機功能分支，尚未 push；請使用者確認後再自行 push。
- fine-tuned model 已建立成功：`ft:gpt-4o-2024-08-06:personal::DgvIeiS6`。
- 第一版 fine-tuned model eval 結果只有 `6/27` 通過，目前不建議直接接到 LINE 正式使用。
- 不要主動跑 OpenAI API 或 eval；等使用者明確說新訓練資料已提供完、同意測試後再跑。

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
- 本機 API key 放在 `ivy.env`，該檔已被 `.gitignore` 忽略；不要把 key 印出、提交或貼到文件。
