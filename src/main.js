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

log.info('XCrawl Actor started', { action, query, url, location, language, limit });

// ------ Search ------
async function doSearch(q) {
  log.info('Calling XCrawl search API', { query: q, limit: Math.min(limit, 20) });

  const res = await got(`${XCRAWL_API}/search`, {
    method: 'POST',
    json: { query: q, location, language, limit: Math.min(limit, 20) },
    headers: { 'Authorization': `Bearer ${XCRAWL_KEY}` },
    responseType: 'json',
    timeout: { request: 30000 },
  }).json();

  log.debug('XCrawl search API raw response keys', { keys: Object.keys(res || {}) });

  // XCrawl wraps results in { code: 0, data: { data: [...] } }
  const items = res?.data?.data || [];
  log.info(`XCrawl returned ${items.length} raw results`);

  if (items.length === 0) {
    log.warning('No search results returned from XCrawl API');
    return [];
  }

  return items.slice(0, limit).map((item, i) => ({
    title: item.title || '',
    url: item.url || '',
    snippet: item.snippet || item.content || item.desc || '',
  }));
}

// ------ Scrape ------
async function doScrape(u) {
  log.info('Calling XCrawl scrape API', { url: u });

  const res = await got(`${XCRAWL_API}/scrape`, {
    method: 'POST',
    json: { url: u, output: { formats: ['markdown', 'summary'] } },
    headers: { 'Authorization': `Bearer ${XCRAWL_KEY}` },
    responseType: 'json',
    timeout: { request: 45000 },
  }).json();

  log.debug('XCrawl scrape API raw response keys', { keys: Object.keys(res || {}) });

  const data = res.data || res;
  const markdown = (data.markdown || '').slice(0, 50000);
  const summary = data.summary || '';

  log.info(`Scraped "${u}" â€” markdown: ${markdown.length} chars, summary: ${summary.length} chars, credits: ${data.credits_used || res.total_credits_used || '?'}`);

  return {
    url: u,
    status: res.status || 'completed',
    markdown,
    summary,
    credits: data.credits_used || res.total_credits_used || '?',
  };
}

// ------ Main logic ------
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
    throw new Error(`Unknown action: "${action}". Use "search" or "scrape".`);
}

await Actor.pushData(result);

const count = Array.isArray(result) ? result.length : 1;
log.info(`Done â€” pushed ${count} result(s) to dataset`);

await Actor.exit();
