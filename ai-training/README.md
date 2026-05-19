# AI 注單解析訓練資料

這個資料夾用來累積「文字/圖片注單 -> 標準解析結果」案例，並產生 OpenAI fine-tuning JSONL。

## 目錄

- `cases/text/`：文字下單案例。
- `cases/image/`：圖片下單案例。
- `images/`：本機圖片，可放 JPG/PNG/WEBP。預設不提交到 git。
- `output/`：腳本產生的 `training.jsonl`、`validation.jsonl`，預設不提交到 git。
- `scripts/build-training-jsonl.js`：把 cases 轉成 fine-tuning JSONL。
- `scripts/run-eval.js`：用目前模型跑案例並做 exact match 比對。

## 新增文字案例

在 `cases/text/` 新增一個 JSON：

```json
{
  "id": "text-001",
  "type": "text",
  "input": "02.38二×3\n02×38×22.33.37二三×|",
  "lines": [
    {
      "original": "02.38二×3",
      "normalized": "02x38 二x3",
      "confidence": 0.99
    },
    {
      "original": "02×38×22.33.37二三×|",
      "normalized": "02x38x223337 二x1 三x1",
      "confidence": 0.99
    }
  ],
  "warnings": []
}
```

## 新增圖片案例

先把圖片放到 `ai-training/images/`，再在 `cases/image/` 新增 JSON：

```json
{
  "id": "image-001",
  "type": "image",
  "image": {
    "path": "../../images/image-001.jpg",
    "detail": "high"
  },
  "lines": [
    {
      "original": "",
      "normalized": "1819212934 二x1 三x1 四x1",
      "confidence": 0.95
    }
  ],
  "warnings": []
}
```

`path` 是相對於該 JSON 檔案的位置。也可以改用公開 URL：

```json
{
  "image": {
    "url": "https://example.com/image-001.jpg",
    "detail": "high"
  }
}
```

## 產生訓練檔

```bash
npm run ai:build-training
```

會產生：

```text
ai-training/output/training.jsonl
ai-training/output/validation.jsonl
```

預設 20% 案例放進 validation，且用案例 id 穩定排序。

目前最近一次產生結果：

```text
Cases: 27
Training: 22
Validation: 5
```

這個指令只讀本機資料並產生 JSONL，不會呼叫 OpenAI API。

## 跑評測

需要先設定：

```bash
export OPENAI_API_KEY="..."
export OPENAI_MODEL="gpt-4o-2024-08-06"
```

或改成 fine-tuned model id：

```bash
export OPENAI_MODEL="ft:gpt-4o-2024-08-06:..."
```

執行：

```bash
npm run ai:eval
```

腳本會逐筆案例呼叫 OpenAI Responses API，並比對輸出的 `normalized` 是否跟正解完全一致。

注意：`npm run ai:eval` 會消耗 OpenAI API 額度。除非使用者明確說新訓練資料已提供完並同意測試，不要主動執行。

若要使用本機 `ivy.env`：

```bash
set -a
source ./ivy.env
set +a
OPENAI_MODEL="ft:gpt-4o-2024-08-06:personal::DgvIeiS6" npm run ai:eval
```

`ivy.env` 已被 `.gitignore` 忽略，不要提交，也不要把 key 印出來。

## 控制 eval 範圍

為了節省 API 費用，可以只跑部分案例。

只跑前 5 筆：

```bash
AI_EVAL_LIMIT=5 npm run ai:eval
```

只跑圖片案例：

```bash
AI_EVAL_TYPE=image npm run ai:eval
```

只跑指定案例：

```bash
AI_EVAL_CASES=image-584597,image-8245 npm run ai:eval
```

也可以合併使用，例如只跑前 3 筆圖片案例：

```bash
AI_EVAL_TYPE=image AI_EVAL_LIMIT=3 npm run ai:eval
```

## 目前模型狀態

成功建立的模型：

```text
ft:gpt-4o-2024-08-06:personal::DgvIeiS6
```

第一次 eval 結果：

```text
6/27 cases passed
Failed: 21
Errored: 0
```

目前不建議部署到 LINE 正式流程。請先看根目錄 `AI_FAILURE_CASES_TO_COLLECT.md` 補資料，再重跑小範圍 eval，例如：

```bash
AI_EVAL_LIMIT=5 npm run ai:eval
AI_EVAL_TYPE=image npm run ai:eval
AI_EVAL_CASES=image-584597,image-8245 npm run ai:eval
```
