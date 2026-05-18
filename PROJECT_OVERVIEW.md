# 算算算數學專案說明

這是 LINE 官方帳號 + Cloudflare Worker + Cloudflare D1 的注單整理助手。

使用者透過 LINE Rich Menu 選擇朋友、送出文字或圖片注單，系統會保存原始訊息、解析成標準注單、計算支數，並提供今日/過往報表與成本管理。

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
```

fine-tune 成功後，`OPENAI_MODEL` 應設定成：

```text
ft:gpt-4o-2024-08-06:...
```

## Rich Menu

六個入口：

1. 選朋友下單
2. 今日注單
3. 過往注單
4. 朋友管理
5. 成本管理
6. 說明

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
- 圖片 OCR/AI 解析後，也走同一套 `parsed_entries` 流程。

