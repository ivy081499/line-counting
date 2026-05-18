# Line Counting Project Handoff

這份文件給下一個 Codex session 快速進入狀況。

## 專案目標

`/Users/admin/Desktop/line-counting` 是 LINE 官方帳號 + Cloudflare Worker + Cloudflare D1 的注單整理助手。

主要用途：

- 管理朋友名單。
- 使用者選朋友後傳文字或圖片注單。
- AI 將文字/圖片正規化成標準注單格式。
- 程式用 deterministic logic 計算二星、三星、四星、車組支數。
- 寫入 D1，供今日注單與過往注單報表查詢。
- 管理每位朋友的成本設定。

## 開發方式

目前已改成「多檔開發、單檔輸出」。

- 平常只改 `src/`。
- 不直接改根目錄 `main.js`。
- 改完跑：

```bash
npm run build
```

build 會產生：

- `dist/worker.js`
- 同步更新根目錄 `main.js`

Cloudflare Worker 要貼的是 `dist/worker.js` 的內容。

## 主要檔案

- `src/main.js`：Webhook 入口、LINE 事件分派、主要業務流程。
- `src/constants.js`：Rich Menu 指令、內部指令、pending action、成本預設值。
- `src/db.js`：D1 schema 建立與資料存取。
- `src/calculations.js`：標準注單文字解析與支數計算。
- `src/aiParser.js`：呼叫 OpenAI，把文字/圖片注單正規化成標準 JSON。
- `src/lineContent.js`：下載 LINE 圖片內容並轉 base64。
- `src/reports.js`：注單報表與成本報表格式。
- `src/lineReplies.js`：LINE text reply 與 Flex Message。
- `src/costs.js`：成本輸入解析、成本 pending action 編碼/解碼。
- `src/utils.js`：日期、白名單、數字格式工具。
- `ai-training/`：AI 訓練資料、JSONL 產生器、eval 腳本、job 紀錄。

## Rich Menu 功能

六個入口：

1. `選朋友下單`
2. `今日注單`
3. `過往注單`
4. `朋友管理`
5. `成本管理`
6. `說明`

`#朋友名`、`!注單報表:yyyy-MM-dd|朋友名` 等是 Flex Message 用的內部指令，不是人工輸入流程。

## 下單流程

1. 使用者點 `選朋友下單`。
2. Worker 回朋友 Flex 選單。
3. 使用者點朋友後，Flex 送出 `#朋友名`。
4. Worker 設定 `user_sessions.current_friend_id`。
5. 接下來的普通文字或圖片會視為該朋友注單。
6. 原始訊息寫入 `raw_messages`。
7. 文字走 `parseOrderTextWithAI()`。
8. 圖片走 `downloadLineImage()` 後再 `parseOrderImageWithAI()`。
9. AI 回傳標準 JSON，取出 normalized lines。
10. normalized text 交給 `saveParsedEntriesForText()`。
11. `src/calculations.js` 計算支數並寫入 `parsed_entries`。

## D1 Tables

`ensureDatabaseSchema()` 會建立：

- `friends`
  - `id`
  - `name`
  - `deleted_at`
  - `created_at`
- `user_sessions`
  - `line_user_id`
  - `current_friend_id`
  - `pending_action`
  - `updated_at`
- `raw_messages`
  - `friend_id`
  - `line_user_id`
  - `message_type`
  - `raw_text`
  - `image_message_id`
  - `created_at`
- `parsed_entries`
  - `raw_message_id`
  - `friend_id`
  - `line_user_id`
  - `source_line_text`
  - `number_part`
  - `rule_part`
  - `rows_json`
  - `calculations_json`
  - `total_amount`
  - `error_message`
- `friend_costs`
- `ai_parse_results`

## 朋友管理

- `新增朋友` 進入連續新增模式。
- 連續新增模式下，每則普通文字都新增為朋友名稱。
- 新增朋友不會改變目前選定朋友。
- 朋友名稱不可重複。
- 若同名朋友已軟刪，重新新增會恢復原本朋友，把 `deleted_at` 設回 `NULL`。
- 刪除朋友是軟刪，只設定 `friends.deleted_at`。
- 刪除朋友前要二次確認。
- 刪除後會清掉所有目前選到該朋友的 `user_sessions.current_friend_id`。

## 報表

今日注單：

- 點 `今日注單` 後，Worker 回今天有注單資料的朋友清單。
- 點朋友後查該朋友今天 `parsed_entries`。
- 日期使用台北時區，格式 `yyyy-MM-dd`。

過往注單：

- 子選單有昨天、前天、特定日期。
- 特定日期會進入 `pending_action = past_order_date`。
- 使用者輸入 `yyyy-MM-dd` 後再選朋友。

報表示例：

```text
小明 2026-05-16 報表

1. 0102x0304 二x1：二4
2. 010203x040506x070809 二三x1：二27、三27

加總
二31、三27、四0
```

## 成本管理

成本彩種：

- `539`
- `大樂透`
- `港號`

預設值在 `src/constants.js`：

```js
DEFAULT_COST_VALUES_BY_GAME = {
  "539": [70, 75, 80, 70],
  "大樂透": [70, 75, 80, 70],
  "港號": [70, 75, 80, 70],
}
```

四個數字依序是：

- 二星成本
- 三星成本
- 四星成本
- 車組成本

成本管理流程：

1. 選朋友。
2. 查看成本或編輯成本。
3. 若尚未設定，查看時會自動寫入預設成本。
4. 編輯可套用預設或手動輸入。
5. 手動輸入格式：`70,75,80,70`。

## 標準注單格式

AI 的工作是輸出標準注單，不計算支數。

每行一筆：

```text
號碼區 玩法x倍率 玩法x倍率 ...
```

例：

```text
152721x102030 二x0.5
152127x102030x142434 二x0.1 三x0.1
33x0.65車
```

規則：

- `X`、`×`、`*` 都正規化成 `x`。
- 號碼一律兩位數。
- `二三x1` 展開成 `二x1 三x1`。
- `二三四x1` 展開成 `二x1 三x1 四x1`。
- `車` 格式是 `號碼x倍率車`。
- `N尾` 要展開，例如 `4尾` 是 `04142434`，`7尾` 是 `07172737`，`0尾` 是 `102030`。
- `539全部數字` 是 `01` 到 `39`。
- 若寫「扣除某排數字」，要展開 `01-39` 並扣掉該排兩位數。

## 計算邏輯

`src/calculations.js` 負責 deterministic 計算。

普通注單：

- 先拆 `numberPart` 與 `rulePart`。
- `numberPart` 用 `x` 分排。
- 若無 `x`，連續數字每兩位一碼。
- 每個玩法 pick 用 row combination 計算。

車組：

```text
33x0.65車
```

表示指定號碼和其他 `01-39` 號碼組車。

車組 base count：

```text
38
```

因為 `01-39` 扣掉指定號碼。

## AI Parser

目前 `src/aiParser.js` 使用 OpenAI Responses API。

需要 Cloudflare Worker 環境變數：

- `OPENAI_API_KEY`
- `OPENAI_MODEL` 可選

目前程式預設：

```js
const DEFAULT_OPENAI_MODEL = "gpt-4.1-mini";
```

之後 fine-tune 成功後，Cloudflare Worker 要設定：

```text
OPENAI_MODEL=ft:gpt-4o-2024-08-06:...
```

AI 回傳 schema：

```json
{
  "lines": [
    {
      "original": "",
      "normalized": "152721x102030 二x0.5",
      "confidence": 0.95
    }
  ],
  "warnings": []
}
```

## AI Training

訓練資料在：

```text
ai-training/
```

重要檔案：

- `ai-training/README.md`
- `ai-training/scripts/shared.js`
- `ai-training/scripts/build-training-jsonl.js`
- `ai-training/scripts/run-eval.js`
- `ai-training/cases/image/*.json`
- `ai-training/cases/text/*.json`
- `ai-training/images/*.jpg`
- `ai-training/output/training.jsonl`
- `ai-training/output/validation.jsonl`
- `ai-training/FINE_TUNE_JOB.md`

產生 JSONL：

```bash
npm run ai:build-training
```

目前最後一次產生結果：

```text
Cases: 27
Training: 22
Validation: 5
```

eval：

```bash
export OPENAI_API_KEY="..."
export OPENAI_MODEL="gpt-4o-2024-08-06"
npm run ai:eval
```

如果要測 fine-tuned model，把 `OPENAI_MODEL` 換成 `ft:...`。

## Fine-Tuning Job

目前已建立過兩次 fine-tuning job。

詳見：

```text
ai-training/FINE_TUNE_JOB.md
```

### Attempt 2: Succeeded

第二次使用較小 split 建立，已成功：

```text
Cases: 27
Training: 13
Validation: 14
```

IDs:

- Training file id: `file-8DJi7ZBKz1uAyQyx8SYiSw`
- Validation file id: `file-9z5cYQnYgbT4UoGHjyt3uy`
- Fine-tuning job id: `ftjob-NMkkD5N3jlMFa7T5F53OVAOw`
- Fine-tuned model: `ft:gpt-4o-2024-08-06:personal::DgvIeiS6`
- Status: `succeeded`

查詢：

```bash
curl https://api.openai.com/v1/fine_tuning/jobs/ftjob-NMkkD5N3jlMFa7T5F53OVAOw \
  -H "Authorization: Bearer $OPENAI_API_KEY"
```

### Eval Result

```text
6/27 cases passed
Failed: 21
Errored: 0
```

結論：模型建立成功，但目前不適合直接部署到 LINE 正式流程。失敗類型整理在根目錄 `AI_FAILURE_CASES_TO_COLLECT.md`。

注意：後來 `ai-training/output/eval-report.json` 曾被一次網路失敗的 eval 覆蓋，不要只看該檔判斷這次 `6/27` 的細節。

### Attempt 1: Cancelled

第一次 job 等待約一小時仍 `queued`，使用者已取消。

- Training file id: `file-WMjGFCzpd4tHR8SQB76sBi`
- Validation file id: `file-W4pmeQzLrBst1qG6KWT6R3`
- Fine-tuning job id: `ftjob-5KdTCTeCN7QcQSewQNTGn1Tt`
- Final known status: `cancelled`

## 接上 LINE Bot

fine-tune 成功且 eval 穩定後：

1. 在 Cloudflare Worker 設定 `OPENAI_MODEL` 為 `ft:...`。
2. 確認 `OPENAI_API_KEY` 已設定。
3. `npm run build`。
4. 貼上 `dist/worker.js` 到 Cloudflare Worker。
5. LINE 選朋友後傳圖片測試。
6. 查 `ai_parse_results` 與 `parsed_entries` 確認結果。

目前不要直接把 `ft:gpt-4o-2024-08-06:personal::DgvIeiS6` 接到正式 LINE Bot，因為 eval 只有 `6/27` 通過。

## Git / 分支建議

目前所在分支：

```text
對獎
```

目前 HEAD：

```text
78df960 完成對獎
```

`dev` 目前已與 `origin/dev` 對齊在：

```text
2c0eccc Merge branch '計算總額' into dev
```

歷史中有 merge commit：

```text
5ec9f85 Merge remote-tracking branch 'origin/dev' into dev
```

但它不是目前 HEAD。

`對獎` 是本機功能分支，尚未 push。請使用者確認後再自行 push。

另一個 Codex session 若要做主程式功能開發，建議另開分支，避免同時改 `src/main.js`、`src/aiParser.js`、`package.json`。例如：

```bash
git checkout dev
git pull
git checkout -b feature/<name>
```

若另一個 session 要接續目前工作，請先確認是否要從 `對獎` 分支開始，而不是直接從 `dev` 開新分支。

## 注意事項

- 不要把真正的 `OPENAI_API_KEY` 寫進專案或聊天。
- 本機 key 放在 `ivy.env`，已被 `.gitignore` 忽略。
- 除非使用者明確說新訓練資料已提供完並同意測試，不要主動跑 OpenAI API/eval。
- `ai-training/output/` 被 `.gitignore` 忽略，只放可重建的 JSONL 或暫存輸出。
- fine-tuning job 紀錄放在 `ai-training/FINE_TUNE_JOB.md`，可被 git 追蹤。
- `ai-training/images/` 被 `.gitignore` 忽略，不會提交原圖。
- 目前訓練資料中的 image JSON 會引用本機圖片，`build-training-jsonl.js` 會把圖片轉成 base64 data URL 寫進 JSONL。
- 若新增圖片，只要放到 `ai-training/images/`，再建立 `ai-training/cases/image/*.json`。
- 若新增文字格式，建立 `ai-training/cases/text/*.json`。
- OpenAI dashboard 曾出現 fine-tuning platform wind down 提示，所以不要把方案完全綁死在 fine-tuned model；保留 general vision model + prompt + deterministic post-processing + eval 的備案。
