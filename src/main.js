import { Actor, log } from 'apify';
import * as gotScraping from 'got-scraping';

// got-scraping exports 'got' as a named export, which is a callable function
const got = gotScraping.got;

const XCRAWL_API = 'https://run.xcrawl.com/v1';
const XCRAWL_KEY = process.env.XCRAWL_API_KEY || '';

await Actor.init();

const input = await Actor.getInput() || {};
const { action, query, url, location = 'US', language = 'en', limit = 5 } = input;

if (!XCRAWL_KEY) {
  throw new Error('XCRAWL_API_KEY environment variable is required');
}

async function doSearch(q) {
  const res = await got(`${XCRAWL_API}/search`, {
    method: 'POST',
    json: { query: q, location, language, limit: Math.min(limit, 20) },
    headers: { 'Authorization': `Bearer ${XCRAWL_KEY}` },
    responseType: 'json',
    timeout: { request: 30000 },
  }).json();

  const items = res?.data?.data || [];
  return items.slice(0, limit).map(item => ({
    title: item.title || '',
    url: item.url || '',
    snippet: item.snippet || item.content || '',
  }));
}

async function doScrape(u) {
  const res = await got(`${XCRAWL_API}/scrape`, {
    method: 'POST',
    json: { url: u, output: { formats: ['markdown', 'summary'] } },
    headers: { 'Authorization': `Bearer ${XCRAWL_KEY}` },
    responseType: 'json',
    timeout: { request: 45000 },
  }).json();

  const data = res.data || res;
  return {
    url: u,
    status: res.status || 'completed',
    markdown: (data.markdown || '').slice(0, 50000),
    summary: data.summary || '',
    credits: data.credits_used || res.total_credits_used || '?',
  };
}

log.info('XCrawl Actor started', { action, query, url });

let result;
switch (action) {
  case 'search':
  case undefined:
    if (!query) throw new Error('query is required for search action');
    result = await doSearch(query);
    break;
  case 'scrape':
    if (!url) throw new Error('url is required for scrape action');
    result = await doScrape(url);
    break;
  default:
    throw new Error(`Unknown action: ${action}. Use "search" or "scrape".`);
}

await Actor.pushData(result);
log.info('Done', { count: Array.isArray(result) ? result.length : 1 });

await Actor.exit();
