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
