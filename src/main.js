import { Actor, log } from 'apify';
import * as gotScraping from 'got-scraping';

// got-scraping exports 'got' as a named export
const got = gotScraping.got;

const XCRAWL_API = 'https://run.xcrawl.com/v1';
const XCRAWL_KEY = process.env.XCRAWL_API_KEY || '';

await Actor.init();

const input = await Actor.getInput() || {};
const {
  action,
  query,
  url,
  location = 'US',
  language = 'en',
  limit = 10,
  withContent = true,   // search mode: auto-fetch full content for each result
  formats = ['markdown', 'summary'],
} = input;

if (!XCRAWL_KEY) throw new Error('XCRAWL_API_KEY environment variable is required');

log.info('XCrawl Actor started', { action, query, url, location, language, limit, withContent, formats });

// ====== XCrawl API helpers ======

async function xcrawlCall(endpoint, body, timeoutMs = 30000) {
  const res = await got(`${XCRAWL_API}/${endpoint}`, {
    method: 'POST',
    json: body,
    headers: { Authorization: `Bearer ${XCRAWL_KEY}` },
    responseType: 'json',
    timeout: { request: timeoutMs },
    retry: { limit: 0 }, // XCrawl charges per request, so no auto-retry
  });

  const parsed = typeof res.body === 'object' ? res.body : JSON.parse(res.body);
  log.debug(`XCrawl /${endpoint} response keys`, { keys: Object.keys(parsed || {}) });
  return parsed;
}

// ====== Scrape a single URL ======
async function doScrape(u) {
  log.info(`Scraping: ${u}`);

  const res = await xcrawlCall('scrape', {
    url: u,
    output: { formats },
  }, 45000);

  const data = res.data || res;
  const markdown = (data.markdown || '').slice(0, 50000);
  const summary = data.summary || data.description || '';

  log.info(`Scraped OK â€” ${markdown.length} chars markdown, ${summary.length} chars summary`);

  return {
    url: u,
    status: res.status || 'completed',
    markdown,
    summary,
    credits: data.credits_used || res.total_credits_used || '',
  };
}

// ====== Search ======
async function doSearch(q) {
  log.info(`Searching: "${q}" (limit ${limit}, location ${location})`);

  // Step 1: search
  const res = await xcrawlCall('search', {
    query: q,
    location,
    language,
    limit: Math.min(limit, 100),
  });

  let items = res?.data?.data || [];
  log.info(`Search returned ${items.length} raw results`);

  if (items.length === 0) {
    log.warning('No search results â€” returning empty set');
    return [];
  }

  // Step 2: extract the basic info from search results
  const basicResults = items.slice(0, Math.min(limit, 50)).map((item, i) => ({
    title: item.title || '',
    url: item.url || '',
    snippet: item.snippet || item.content || item.desc || '',
  }));

  // Step 3: if withContent is enabled, fetch full content for each
  if (!withContent) return basicResults;

  log.info(`Fetching full content for ${basicResults.length} results (serial to avoid rate limits)`);
  const enrichedResults = [];

  for (let i = 0; i < basicResults.length; i++) {
    const basic = basicResults[i];
    try {
      const full = await doScrape(basic.url);
      enrichedResults.push({
        ...basic,
        markdown: full.markdown,
        summary: full.summary,
        scrapeStatus: full.status,
        credits: full.credits,
      });
      log.info(`[${i + 1}/${basicResults.length}] Enriched: "${basic.title}"`);
    } catch (err) {
      log.warning(`[${i + 1}/${basicResults.length}] Scrape failed for "${basic.url}": ${err.message}`);
      enrichedResults.push({
        ...basic,
        markdown: '',
        summary: '',
        scrapeStatus: 'failed',
        scrapeError: err.message,
      });
    }
  }

  return enrichedResults;
}

// ====== Main dispatch ======
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
