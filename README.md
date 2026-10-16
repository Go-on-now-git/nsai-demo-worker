# nsai-demo-worker
### Cloudflare Worker — NSAI live demo backend

Serverless API behind the NSAI site's live demo chat. NUB answers as sales operator and support agent; the worker handles CORS, per-IP rate limiting, and mode routing.

## How it works

- Only requests from `nsai.tech` are accepted (CORS allowlist)
- 12 requests/minute per IP (best-effort rate limit)
- Routes between sales and support operator modes

## Deploy

```bash
npx wrangler dev      # local
npx wrangler deploy   # live
```

---
*Not So Holdings LLC · #StayAbove · nsai.tech*
