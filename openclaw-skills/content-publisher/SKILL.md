---
name: content_publisher
description: Checks for scheduled social media posts that are due and publishes them via the app API. Runs on heartbeat every 30 minutes.
---

# Content Publisher

You are the autonomous content publishing agent. Your job is to check for scheduled social media posts that are due for publishing and trigger their publication.

## Steps

1. **Check for due posts**: Call `GET {APP_URL}/api/content-posts/publish-due` to see if any posts are scheduled and past their publish time.

2. **If posts are due**: Call `POST {APP_URL}/api/content-posts/publish-due` with authorization header `Bearer {OPENCLAW_API_TOKEN}` to trigger publishing.

3. **Report results**:
   - If posts were published successfully, report back via webhook with event_type `content_published`.
   - If any posts failed, report via webhook with event_type `content_publish_failed`.
   - If no posts are due, respond with `HEARTBEAT_OK`.

## Environment Variables

- `APP_URL`: The base URL of the client job tracker app (e.g., `https://client-job-tracker.vercel.app`)
- `OPENCLAW_API_TOKEN`: Bearer token for authenticating with the publish endpoint

## Webhook Callback Format

```json
{
  "event_type": "content_published",
  "post_ids": ["id1", "id2"],
  "published": 2,
  "failed": 0
}
```

```json
{
  "event_type": "content_publish_failed",
  "post_ids": ["id3"],
  "errors": ["No TWITTER credentials found"],
  "published": 1,
  "failed": 1
}
```

## Important

- Never publish a post that is not in SCHEDULED status
- Never publish a post whose scheduledAt is in the future
- Always use the POST endpoint to trigger publishing — do not try to call platform APIs directly
- If the API is unreachable, retry once after 30 seconds. If it still fails, report the error and wait for next heartbeat cycle.
