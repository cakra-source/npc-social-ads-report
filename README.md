# NPC Office · Social Media & Ads Report

Live dashboard for Instagram, Meta Ads, Google Ads, GA4 and Search Console, read from Windsor.ai.

- `index.html` — the page (bright, earth-tone design; date range, tabs, top 5, insights, details).
- `api/report.js` — Vercel function that reads Windsor.ai with `WINDSOR_API_KEY` and checks `DASHBOARD_PASSWORD`.
- `api/_insights.js` — written analysis, rewritten every morning by Claude's daily task.

Environment variables (Vercel → Settings → Environment Variables): `WINDSOR_API_KEY`, `DASHBOARD_PASSWORD`.
