# Fine-Tuning Job Record

建立日期：2026-05-18

## Attempt 2: Smaller Split

建立日期：2026-05-18

這次先用較小 training split 重建 job：

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

查詢指令：

```bash
curl https://api.openai.com/v1/fine_tuning/jobs/ftjob-NMkkD5N3jlMFa7T5F53OVAOw \
  -H "Authorization: Bearer $OPENAI_API_KEY"
```

### Eval Result

使用者回報第一版 fine-tuned model eval：

```text
6/27 cases passed
Failed: 21
Errored: 0
```

結論：

- 模型已成功建立，但解析能力還不夠穩。
- 目前不要直接部署到 LINE 正式流程。
- 失敗類型整理在根目錄 `AI_FAILURE_CASES_TO_COLLECT.md`。
- 後來 `ai-training/output/eval-report.json` 曾被一次網路失敗的 eval 覆蓋，所以不要只看該檔判斷這次 `6/27` 的細節。

注意：目前 repository 重新 build training JSONL 的結果是：

```text
Cases: 27
Training: 22
Validation: 5
```

但 Attempt 2 成功模型當時是用 `Training: 13`、`Validation: 14` 的較小 split 訓練出來。

## Attempt 1: Cancelled

建立日期：2026-05-18

狀態：使用者等待約一小時仍 `queued`，已取消。

- Training file id: `file-WMjGFCzpd4tHR8SQB76sBi`
- Validation file id: `file-W4pmeQzLrBst1qG6KWT6R3`
- Fine-tuning job id: `ftjob-5KdTCTeCN7QcQSewQNTGn1Tt`

### Latest Known Status

- `validating_files` 時 `fine_tuned_model` 是 `null`
- 後來狀態變成 `queued`，`fine_tuned_model` 仍是 `null`
- 使用者已執行 cancel，回報 `cancelled`

查詢指令：

```bash
curl https://api.openai.com/v1/fine_tuning/jobs/ftjob-5KdTCTeCN7QcQSewQNTGn1Tt \
  -H "Authorization: Bearer $OPENAI_API_KEY"
```

## Completed Model

完成時要記下回傳的：

```json
{
  "status": "succeeded",
  "fine_tuned_model": "ft:..."
}
```

之後把 `fine_tuned_model` 設到 Cloudflare Worker 的 `OPENAI_MODEL`。

目前可用模型：

```text
ft:gpt-4o-2024-08-06:personal::DgvIeiS6
```

目前可用不代表可上線。請先重跑受控 eval，確認通過率足夠後再考慮設定到 Cloudflare Worker 的 `OPENAI_MODEL`。
