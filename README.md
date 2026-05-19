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

- 目前所在分支是 `dev`；功能最新 commit 是 `aa72451 拆分LINE文字訊息訓練案例`，本交接文件 commit 會在它之後。
- `dev` 目前比 `origin/dev` ahead 2；`origin/dev` 在 `963d79b 交接工作`。
- 今天已將 `網頁報表` 分支與 `數字檢查` 分支 merge 回 `dev`。
- 今天新增圖片訓練案例 commit：`8281a01 新增圖片訓練案例`。
- 今天拆分 LINE 文字訊息訓練案例 commit：`aa72451 拆分LINE文字訊息訓練案例`。
- 目前 `git stash list` 是空的。
- 目前工作區乾淨。
- `dist/worker.js` 已因今天功能更新重新 build；要部署 Cloudflare Worker 時請貼新版 `dist/worker.js`。
- 本機 Codex 已新增 `counting-handoff` skill；之後使用者說「交接今日counting專案工作」或類似語句時，應更新本專案交接 Markdown。
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
- `src/webReport.js`：`/reports` 網頁每日總報表 HTML。
- `src/lineReplies.js`：LINE text reply 與 Flex Message。
- `src/costs.js`：成本輸入解析、成本 pending action 編碼/解碼。
- `src/utils.js`：日期、白名單、數字格式等工具。

## 今日新增功能交接

- 新增 Worker `GET /reports` 網頁報表入口。
- LINE 成本管理選單中的「每日總報表」按鈕已改為開啟 `/reports`。
- `/reports` 支援日期與朋友篩選；不選朋友時顯示該日所有朋友。
- 網頁報表最上方顯示全日總統計，每位朋友區塊顯示朋友總統計。
- 每位朋友底下依彩種分區顯示獨立統計，注單明細預設收起，可展開查看。
- 可選 Cloudflare env `REPORT_ACCESS_TOKEN` 保護 `/reports`；若有設定，LINE 按鈕會自動帶 `token`。
- 可選 Cloudflare env `REPORT_URL` 指定完整報表網址；未設定時用目前 Worker origin + `/reports`。
- 使用者可見的「二星 / 三星 / 四星」文案已改成 `二♥ / 三♥ / 四♥`，避免敏感字詞；內部計算仍用 `2 / 3 / 4 / car`。
- 新增 LINE Rich Menu 底圖：`rich-menu-background-hearts-2500x1686.png`。
- 下注號碼檢查已補強：格式、號重、彩種範圍。
- AI 訓練資料新增 12 個圖片案例，並把文字案例調整成更貼近 LINE 實際情境的一則訊息一個 case。
- 目前 `npm run ai:build-training` 成功結果：`Cases: 115`、`Training: 92`、`Validation: 23`。

## 下注號碼檢查

`src/calculations.js` 現在會在寫入 `parsed_entries` 前檢查：

- 號碼區只能使用數字、`x` 或 `.` 分隔。
- 不允許連續分隔符、開頭/結尾分隔符。
- 不允許同時混用 `x` 和 `.`。
- 號碼必須兩位數一組。
- 同一行注單不可重複號碼，跨排也會檢查，例如 `01x01` 會錯。
- 彩種範圍：
  - `539`：`01-39`
  - `大樂透`：`01-49`
  - `港號`：`01-49`
- 車組號碼也會依彩種範圍檢查。

## AI 解析

- Cloudflare Worker 需要設定 `OPENAI_API_KEY`。
- 可選設定 `OPENAI_MODEL`，未設定時預設使用 `gpt-4.1-mini`。
- AI 只負責把文字或圖片正規化成標準注單行，不負責計算支數。
- 支數仍由 `src/calculations.js` 的 deterministic 程式邏輯計算。
- AI 解析結果會寫入 `ai_parse_results`，方便之後除錯或重算。
- 本機 API key 放在 `ivy.env`，該檔已被 `.gitignore` 忽略；不要把 key 印出、提交或貼到文件。
