# Fine-Tuning Job Record

建立日期：2026-05-18

## OpenAI IDs

- Training file id: `file-WMjGFCzpd4tHR8SQB76sBi`
- Validation file id: `file-W4pmeQzLrBst1qG6KWT6R3`
- Fine-tuning job id: `ftjob-5KdTCTeCN7QcQSewQNTGn1Tt`

## Latest Known Status

- `validating_files` 時 `fine_tuned_model` 是 `null`
- 後來狀態變成 `queued`，`fine_tuned_model` 仍是 `null`
- 需要繼續查詢直到 `status` 變成 `succeeded`

查詢指令：

```bash
curl https://api.openai.com/v1/fine_tuning/jobs/ftjob-5KdTCTeCN7QcQSewQNTGn1Tt \
  -H "Authorization: Bearer $OPENAI_API_KEY"
```

完成時要記下回傳的：

```json
{
  "status": "succeeded",
  "fine_tuned_model": "ft:..."
}
```

之後把 `fine_tuned_model` 設到 Cloudflare Worker 的 `OPENAI_MODEL`。

