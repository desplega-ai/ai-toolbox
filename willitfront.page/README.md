# willitfront.page

## Setup

1. Install dependencies:
   ```bash
   bun install
   ```

2. Copy `.env.example` to `.env` and fill in your values:
   ```bash
   cp .env.example .env
   ```

3. Run the dev server:
   ```bash
   bun run dev
   ```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `HN_SQL_API_URL` | HN-SQL API endpoint (use `https://api.willitfront.page` or local) |
| `AI_GATEWAY_API_KEY` | AI Gateway API key |
| `RESEND_API_KEY` | [Resend](https://resend.com) API key for feedback emails |
| `FEEDBACK_EMAIL` | Email to receive feedback (must match your Resend account on free tier) |

## Features

- **Chat Analysis**: Natural language queries against HN data
- **Dashboard**: Key metrics and visualizations
- **Post Tester**: Analyze post ideas before submitting
- **Feedback**: In-app feedback form (header button)
