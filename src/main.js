import { Actor, log } from 'apify';
import * as gotScraping from 'got-scraping';
import pLimit from 'p-limit';

// got-scraping exports 'got' as a named export
const got = gotScraping.got;

const XCRAWL_API = 'https://run.xcrawl.com/v1';
const XCRAWL_KEY = process.env.XCRAWL_API_KEY || '';
const MAX_CONCURRENCY = 5; // max parallel scrape requests

await Actor.init();

const input = await Actor.getInput() || {};
const {
  action,
  query,
  url,
  location = 'US',
  language = 'en',
  limit = 10,
  withContent = true,
  formats = 'markdown,summary',
  render = false,
  proxy = true,
  screenshot = false,
} = input;

// Parse comma-separated formats string into array
let formatsList = Array.isArray(formats) ? formats : String(formats).split(',').map(f => f.trim()).filter(Boolean);
if (formatsList.length === 0) formatsList = ['markdown', 'summary'];

if (!XCRAWL_KEY) throw new Error('XCRAWL_API_KEY environment variable is required');

log.info('XCrawl Actor started', {
  action, query, url, location, language, limit,
  withContent, formats: formatsList, render, proxy, screenshot,
});

// ====== XCrawl API helper ======
async function xcrawlCall(endpoint, body, timeoutMs = 60000) {
  const res = await got(`${XCRAWL_API}/${endpoint}`, {
    method: 'POST',
    json: body,
    headers: {
      Authorization: `Bearer ${XCRAWL_KEY}`,
      'Content-Type': 'application/json',
    },
    responseType: 'json',
    timeout: { request: timeoutMs },
    retry: { limit: 0 },
  });

  const parsed = typeof res.body === 'object' ? res.body : JSON.parse(res.body);
  log.debug(`XCrawl /${endpoint} response keys`, { keys: Object.keys(parsed || {}) });
  return parsed;
}

// ====== Build scrape options ======
function buildScrapeOptions(u, enableRender = false) {
  // Core body â€” clean URL + formats
  const body = {
    url: u,
    output: { formats: formatsList },
    request: {
      only_main_content: true,
      block_ads: true,
      device: 'desktop',
    },
    proxy: { location },
  };

  // Enable JS rendering for anti-scraping bypass
  if (enableRender || render) {
    body.js_render = {
      enabled: true,
      wait_until: 'networkidle',
      viewport: { width: 1920, height: 1080 },
    };
  }

  // Screenshot
  if (screenshot) {
    body.output.screenshot = 'viewport';
    if (!body.output.formats.includes('screenshot')) {
      body.output.formats.push('screenshot');
    }
  }

  return body;
}

// ====== Scrape a single URL ======
async function doScrape(u, retryRender = false) {
  log.info(`Scraping: ${u} (render=${retryRender || render})`);

  const body = buildScrapeOptions(u, retryRender);
  const res = await xcrawlCall('scrape', body, 60000);

  const data = res.data || res;
  const markdown = (data.markdown || '').slice(0, 100000);
  const summary = data.summary || data.description || '';

  log.info(`Scraped OK ${u} â€” ${markdown.length} chars markdown, ${summary.length} chars summary`);

  return {
    url: u,
    status: res.status || 'completed',
    markdown,
    summary,
    screenshot: data.screenshot || '',
    credits: data.credits_used || res.total_credits_used || '',
  };
}

// ====== Scrape with auto-retry on empty content ======
async function doScrapeWithRetry(u) {
  // First attempt: without JS rendering (faster)
  let result;
  try {
    result = await doScrape(u, false);
  } catch (err) {
    log.warning(`First attempt failed for ${u}: ${err.message}`);
    // Retry with rendering
    try {
      result = await doScrape(u, true);
    } catch (err2) {
      log.warning(`Retry with render also failed for ${u}: ${err2.message}`);
      return {
        url: u, status: 'failed',
        markdown: '', summary: '',
        screenshot: '', credits: '',
        scrapeError: err2.message,
      };
    }
  }

  // If content is missing or looks like captcha/block page, retry with rendering
  const hasContent = (result.markdown.length > 100)
    || (result.markdown && !result.markdown.includes('captcha-delivery.com')
        && !result.markdown.includes('blocked')
        && !result.markdown.includes('network security'));

  if (!hasContent && !render) {
    log.warning(`Content seems blocked/empty for ${u}, retrying with JS rendering...`);
    try {
      const retryResult = await doScrape(u, true);
      if (retryResult.markdown.length > 50) {
        return retryResult;
      }
    } catch (err) {
      log.warning(`Render retry also failed for ${u}: ${err.message}`);
    }
  }

  return result;
}

// ====== Search ======
async function doSearch(q) {
  log.info(`Searching: "${q}" (limit=${limit}, location=${location})`);

  const res = await xcrawlCall('search', {
    query: q,
    location,
    language,
    limit: Math.min(limit, 100),
  });

  let items = res?.data?.data || [];
  log.info(`Search returned ${items.length} raw results`);

  if (items.length === 0) {
    log.warning('No search results');
    return [];
  }

  // Build basic results
  const basicResults = items.slice(0, Math.min(limit, 50)).map((item) => ({
    title: item.title || '',
    url: item.url || '',
    snippet: item.description || item.snippet || item.content || '',
  }));

  // Fast path: no content enrichment
  if (!withContent) {
    log.info(`Returning ${basicResults.length} basic results (withContent=false)`);
    return basicResults;
  }

  // Concurrent enrichment with concurrency limit
  log.info(`Fetching content for ${basicResults.length} results (concurrency=${MAX_CONCURRENCY})`);
  const limit = pLimit(MAX_CONCURRENCY);

  const tasks = basicResults.map((basic, i) =>
    limit(async () => {
      try {
        const full = await doScrapeWithRetry(basic.url);
        log.info(`[${i + 1}/${basicResults.length}] Enriched: "${(basic.title || '').slice(0, 60)}"`);
        return {
          ...basic,
          markdown: full.markdown,
          summary: full.summary,
          scrapeStatus: full.status,
          screenshot: full.screenshot,
          credits: full.credits,
          scrapeError: full.scrapeError || null,
        };
      } catch (err) {
        log.warning(`[${i + 1}/${basicResults.length}] All attempts failed for "${basic.url}": ${err.message}`);
        return {
          ...basic,
          markdown: '', summary: '', scrapeStatus: 'failed', scrapeError: err.message,
        };
      }
    })
  );

  const enrichedResults = await Promise.all(tasks);
  const successCount = enrichedResults.filter(r => r.markdown && r.markdown.length > 50).length;
  log.info(`Enriched ${successCount}/${enrichedResults.length} results with content`);

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
    result = await doScrapeWithRetry(url);
    break;
  default:
    throw new Error(`Unknown action: "${action}". Use "search" or "scrape".`);
}

await Actor.pushData(result);

const count = Array.isArray(result) ? result.length : 1;
log.info(`Done â€” pushed ${count} result(s) to dataset`);

await Actor.exit();
