# 業務邏輯說明

這份文件描述 LINE 注單助手的主要業務流程。

## 核心概念

使用者是被白名單允許的 LINE user。

朋友是下注來源，例如小明、小美、某個客戶名稱。使用者先選朋友，再傳文字或圖片注單，系統把注單歸到目前選定朋友。

每則下注訊息會有兩層資料：

- `raw_messages`：原始 LINE 訊息。
- `parsed_entries`：解析後、可計算與報表使用的注單行。

AI 解析結果另存：

- `ai_parse_results`

方便除錯與之後重新解析。

## 選朋友下單

流程：

1. 使用者點 Rich Menu `選朋友下單`。
2. Worker 回 Flex Message 朋友清單。
3. 使用者點某朋友。
4. Flex Message 送出內部指令 `#朋友名`。
5. Worker 設定 `user_sessions.current_friend_id`。
6. 後續普通文字或圖片視為該朋友的注單。

注意：

- 人工不需要輸入 `#朋友`。
- `#` 是內部指令。
- 若使用者尚未選朋友就傳注單，應提醒先選朋友。

## 文字注單

流程：

1. LINE 收到 text message。
2. 若不是 Rich Menu 指令、內部指令、pending action，就視為注單。
3. 寫入 `raw_messages`。
4. 若有 `OPENAI_API_KEY`，呼叫 `parseOrderTextWithAI()`。
5. AI 回傳標準 JSON。
6. 取出 `normalized` 串成標準注單文字。
7. 呼叫 `saveParsedEntriesForText()`。
8. `parseTextToCalculationEntries()` 計算支數。
9. 寫入 `parsed_entries`。

若 AI 失敗：

- 會保存 `ai_parse_results` 錯誤。
- 目前文字會 fallback 用原始文字直接解析。

## 圖片注單

流程：

1. LINE 收到 image message。
2. 寫入 `raw_messages`，保存 `image_message_id`。
3. 若沒有 `OPENAI_API_KEY`，只保存圖片訊息，不解析。
4. 若有 API key：
   - 用 `downloadLineImage()` 下載 LINE 圖片。
   - 轉成 base64 data URL。
   - 呼叫 `parseOrderImageWithAI()`。
   - AI 輸出標準注單 JSON。
   - 走和文字相同的 `parsed_entries` 計算流程。

## 標準注單格式

每行一筆：

```text
號碼區 玩法x倍率 玩法x倍率
```

例：

```text
152721x102030 二x0.5
152127x102030x142434 二x0.1 三x0.1
33x0.65車
```

規則：

- `x` 分隔號碼排。
- 沒有 `x` 時，連續數字每兩位一碼。
- 號碼必須是兩位數。
- `二三x1` 應展開為 `二x1 三x1`。
- `二三四x1` 應展開為 `二x1 三x1 四x1`。
- 車組格式是 `號碼x倍率車`。

## 下注號碼檢查

文字與圖片經 AI 正規化後，寫入 `parsed_entries` 前會由 `src/calculations.js` 做 deterministic validation。

檢查項目：

- 號碼區只能使用數字、`x` 或 `.` 分隔。
- 號碼區不可有連續分隔符、開頭分隔符或結尾分隔符。
- 號碼區不可同時混用 `x` 和 `.`。
- 號碼必須兩位數一組。
- 同一行注單不可重複號碼，跨排也會檢查，例如 `01x01` 會錯。
- 彩種範圍：
  - `539`：`01-39`
  - `大樂透`：`01-49`
  - `港號`：`01-49`
- 車組號碼也會依彩種範圍檢查。

驗證失敗時，該行仍會寫入 `parsed_entries`，但 `error_message` 會記錄錯誤原因，報表會顯示無法解析。

## 支數計算

普通注單：

```text
010203x040506x070809 二x1 三x1
```

會被拆成多排：

```text
[01,02,03]
[04,05,06]
[07,08,09]
```

二星計算任選 2 排相乘後加總。

三星計算任選 3 排相乘後加總。

四星同理。

使用者可見文案目前顯示為 `二♥`、`三♥`、`四♥`，避免敏感字詞；內部 calculation pick 仍是 `2`、`3`、`4`。

車組：

```text
07x1車
```

代表 `07` 與 539 中其他所有號碼組車。

`01-39` 扣掉 `07`，base count 是 38。

## 今日注單

流程：

1. 使用者點 `今日注單`。
2. Worker 查今天有注單資料的朋友。
3. 回 Flex Message 朋友清單。
4. 使用者點朋友。
5. Flex Message 送出 `!注單報表:yyyy-MM-dd|朋友名`。
6. Worker 查該朋友該日期 `parsed_entries`。
7. 回文字報表。

日期使用台北時區。

## 過往注單

流程：

1. 使用者點 `過往注單`。
2. Worker 回子選單：
   - 昨天
   - 前天
   - 特定日期
3. 昨天/前天會直接選日期。
4. 特定日期會設定 `pending_action = past_order_date`。
5. 使用者下一則文字需輸入 `yyyy-MM-dd`。
6. 選好日期後再選朋友。
7. 回該日報表。

## 朋友管理

功能：

- 新增朋友
- 查看朋友列表
- 刪除朋友

新增朋友：

- 點 `新增朋友` 後進入連續新增模式。
- 連續新增模式中，每則普通文字都新增為朋友名稱。
- 新增朋友不會改變目前選定朋友。
- 朋友名稱不可重複。
- 若同名朋友已軟刪，會恢復該朋友。
- 使用者點其他 Rich Menu 功能時才離開新增模式。

刪除朋友：

- 軟刪，只設定 `friends.deleted_at`。
- 不刪 `raw_messages`。
- 不刪 `parsed_entries`。
- 刪除前要二次確認。
- 軟刪朋友不出現在選朋友/刪除朋友清單。
- 刪除後清掉所有選到該朋友的 `user_sessions.current_friend_id`。

## 成本管理

流程：

1. 使用者點 `成本管理`。
2. Worker 回成本管理子選單。
3. 點 `朋友成本與獎金` 時，Worker 回朋友清單。
4. 選朋友後顯示：
   - 查看成本
   - 編輯成本
5. 查看成本時，若尚未設定，會自動寫入預設成本。
6. 編輯成本可：
   - 套用預設成本
   - 手動輸入
7. 成本管理子選單中的 `每日總報表` 會直接開啟 `/reports` 網頁報表。

彩種：

- 539
- 大樂透
- 港號

手動輸入格式：

```text
70,75,80,70
```

四個數字依序：

```text
二♥、三♥、四♥、車組
```

## 網頁每日總報表

Worker 提供：

```text
GET /reports
```

LINE 成本管理子選單中的 `每日總報表` 按鈕會開啟這個網址。

搜尋條件：

- 日期
- 朋友

不選朋友時，顯示該日期所有朋友。

顯示層級：

1. 頁面頂部：全日總統計。
2. 每位朋友：朋友全部彩種加總。
3. 朋友底下依彩種分區：每個彩種有獨立統計。
4. 彩種底下：注單明細預設收起，可展開查看。

安全設定：

- 可設定 `REPORT_ACCESS_TOKEN`，讓 `/reports` 必須帶 token。
- 可設定 `REPORT_URL` 指定完整網頁報表 URL；未設定時用目前 Worker domain 組 `/reports`。

## AI 訓練與接入

AI 訓練資料在：

```text
ai-training/
```

目前有圖片案例和文字案例。

產生 JSONL：

```bash
npm run ai:build-training
```

fine-tune 成功後，把模型 ID 設到 Cloudflare Worker：

```text
OPENAI_MODEL=ft:gpt-4o-2024-08-06:personal::DgvIeiS6
```

之後 LINE 的文字與圖片都會透過這個 fine-tuned model 正規化。

但目前第一版 fine-tuned model eval 只有：

```text
6/27 cases passed
Failed: 21
Errored: 0
```

所以目前不要直接把這個模型接到正式 LINE Worker。下一步應該先補訓練資料、重跑 eval，或測試 general vision model + prompt + deterministic post-processing 的方案。正式上線前至少要確認常見圖片、文字格式、車組、尾數、扣除類案例都能穩定通過。

本機 OpenAI API key 放在 `ivy.env`，該檔被 `.gitignore` 忽略。不要把 key 提交或寫進文件。除非使用者明確說新訓練資料已提供完並同意測試，不要主動跑 eval 或任何會打 OpenAI API 的指令。

## 下一個 Codex Session 建議先讀

建議順序：

1. `PROJECT_OVERVIEW.md`
2. `BUSINESS_LOGIC.md`
3. `README.md`
4. `ai-training/PROJECT_HANDOFF.md`
5. `src/main.js`
6. `src/aiParser.js`
7. `src/calculations.js`
8. `src/db.js`
