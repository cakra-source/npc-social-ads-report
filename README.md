# NPC Office Social & Ads Report

Password-protected dashboard for NPC Office: Instagram, Meta Ads, Google Ads, GA4 and Search Console, loaded live from Windsor.ai.

- `index.html` – the report page (date range, tabs, charts, tables, insights)
- `api/report.js` – Vercel function that reads Windsor.ai with `WINDSOR_API_KEY`; requires the team password in `DASHBOARD_PASSWORD`
- `api/_insights.js` – the written analysis, rewritten each morning by the daily Claude task

Vercel environment variables: `WINDSOR_API_KEY`, `DASHBOARD_PASSWORD`.
