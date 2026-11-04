// Live data for the NPC Office Social & Ads Report.
// Reads Windsor.ai with the WINDSOR_API_KEY env var; access needs the DASHBOARD_PASSWORD env var.
const crypto = require('crypto');

const BASE = 'https://connectors.windsor.ai/';
const DATE = /^20\d\d-[01]\d-[0-3]\d$/;
const cache = new Map(); // per-instance cache, 10 minutes

const IGM = ['media_id', 'timestamp', 'media_type', 'media_permalink', 'media_caption', 'media_url', 'media_thumbnail_url', 'media_views', 'media_reach',
  'media_like_count', 'media_comments_count', 'media_shares', 'media_saved', 'media_engagement', 'media_follows', 'media_profile_visits',
  'media_reel_avg_watch_time', 'media_reel_skip_rate'];

async function windsor(connector, fields, opt = {}) {
  const p = new URLSearchParams({ api_key: process.env.WINDSOR_API_KEY || '', fields: fields.join(',') });
  if (opt.from) { p.set('date_from', opt.from); p.set('date_to', opt.to); }
  if (opt.preset) p.set('date_preset', opt.preset);
  if (opt.filter) p.set('filter', JSON.stringify(opt.filter));
  const url = BASE + connector + '?' + p.toString();
  const hit = cache.get(url);
  if (hit && Date.now() - hit.t < 10 * 60 * 1000) return hit.v;
  const r = await fetch(url, { signal: AbortSignal.timeout(110000) });
  let j;
  try { j = await r.json(); } catch { throw new Error('Windsor.ai answered HTTP ' + r.status); }
  if (!r.ok || j.error) {
    const e = j.error;
    throw new Error((e && (e.message || (typeof e === 'string' ? e : JSON.stringify(e)))) || 'Windsor.ai answered HTTP ' + r.status);
  }
  const v = Array.isArray(j.data) ? j.data : [];
  cache.set(url, { t: Date.now(), v });
  return v;
}

function sameText(a, b) {
  const x = crypto.createHash('sha256').update(String(a)).digest();
  const y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
}

function jakartaDaysAgo(n) {
  const now = new Date(Date.now() + 7 * 3600e3);
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - n)).toISOString().slice(0, 10);
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const pass = process.env.DASHBOARD_PASSWORD;
  if (!pass) return res.status(500).json({ error: 'DASHBOARD_PASSWORD is not set in Vercel.' });
  if (!sameText(req.headers['x-dashboard-key'] || '', pass)) return res.status(401).json({ error: 'Wrong password.' });
  const q = req.query || {};
  if (q.part === 'ping') return res.status(200).json({ ok: true });
  if (!process.env.WINDSOR_API_KEY) return res.status(500).json({ error: 'WINDSOR_API_KEY is not set in Vercel yet.' });
  const start = String(q.start || ''), end = String(q.end || ''), mediaStart = String(q.media_start || '');
  if (!DATE.test(start) || !DATE.test(end) || !DATE.test(mediaStart) || start > end) return res.status(400).json({ error: 'Bad dates.' });
  const range = { from: start, to: end };
  // Instagram keeps follower history for the last 30 days only.
  const folFrom = start < jakartaDaysAgo(29) ? jakartaDaysAgo(29) : start;

  const jobs = q.part === 'detail' ? {
    ig_media: () => windsor('instagram', IGM, { from: mediaStart, to: end }),
    meta_ads: () => windsor('facebook', ['campaign', 'adset_name', 'ad_id', 'ad_name', 'object_type', 'instagram_permalink_url', 'thumbnail_url', 'spend', 'impressions', 'reach', 'clicks', 'link_clicks', 'actions_lead'], range),
    gads_keywords: () => windsor('google_ads', ['campaign', 'ad_group_name', 'keyword_text', 'keyword_match_type', 'spend', 'impressions', 'clicks', 'conversions'], { ...range, filter: [['impressions', 'gt', 0]] }),
    gads_pages: () => windsor('google_ads', ['final_url', 'spend', 'impressions', 'clicks', 'conversions'], { ...range, filter: [['clicks', 'gt', 0]] }),
  } : {
    ig_profile: () => windsor('instagram', ['username', 'followers_count', 'follows_count', 'media_count']),
    ig_daily: () => folFrom > end ? Promise.resolve([]) : windsor('instagram', ['date', 'follower_count_1d', 'reach_1d'], { from: folFrom, to: end }),
    ig_media_period: () => windsor('instagram', ['media_id', 'media_type', 'timestamp'], range),
    ig_media_6d: () => windsor('instagram', ['media_id', 'media_type', 'timestamp'], { preset: 'last_6d' }),
    ig_stories: () => windsor('instagram', ['story_id', 'story_timestamp', 'story_reach'], range),
    ig_stories_6d: () => windsor('instagram', ['story_id', 'story_timestamp', 'story_reach'], { preset: 'last_6d' }),
    meta_campaigns: () => windsor('facebook', ['campaign', 'campaign_objective', 'campaign_status', 'campaign_daily_budget', 'spend', 'impressions', 'reach', 'clicks', 'link_clicks', 'actions_lead'], range),
    meta_daily: () => windsor('facebook', ['date', 'spend', 'link_clicks', 'actions_lead'], range),
    gads_campaigns: () => windsor('google_ads', ['campaign', 'campaign_status', 'budget_amount', 'spend', 'impressions', 'clicks', 'conversions'], range),
    gads_daily: () => windsor('google_ads', ['date', 'spend', 'clicks', 'conversions'], range),
    ga4_channels: () => windsor('googleanalytics4', ['session_default_channel_group', 'sessions', 'active_users', 'engagement_rate'], range),
    gsc_totals: () => windsor('searchconsole', ['clicks', 'impressions', 'ctr', 'position'], range),
  };

  const out = { datasets: {}, errors: {}, fetched_at: new Date().toISOString() };
  await Promise.all(Object.entries(jobs).map(async ([id, fn]) => {
    try { out.datasets[id] = await fn(); } catch (e) { out.errors[id] = String((e && e.message) || e); }
  }));
  if (q.part === 'detail') {
    const v = [];
    (out.datasets.ig_media || []).forEach((r) => { const u = r.media_thumbnail_url || r.media_url; if (u) v.push({ id: 'ig:' + r.media_id, img: u }); });
    (out.datasets.meta_ads || []).forEach((r) => { if (r.thumbnail_url) v.push({ id: 'ad:' + r.ad_id, img: r.thumbnail_url }); });
    out.datasets.visuals = v;
  } else {
    try { out.datasets.insights = require('./_insights.js').rows; } catch (e) { out.errors.insights = 'Analysis file missing'; }
  }
  res.status(200).json(out);
};
