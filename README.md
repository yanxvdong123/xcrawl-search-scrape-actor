# XCrawl Web Search & Scrape â€” Apify Actor

Search the web and scrape any URL using [XCrawl](https://xcrawl.com)'s residential proxy network. Bypass anti-bot systems with automatic JS rendering fallback and global IP rotation.

**Actor:** `yanxvdong123/xcrawl-search-scrape` | **Runtime:** Node.js 22 | **License:** MIT

---

## ðŸš€ Quick Start

1. Open the [Actor Console](https://console.apify.com/actors/yanxvdong123~xcrawl-search-scrape)
2. Set `XCRAWL_API_KEY` in **Environment Variables** (get a free key at [dash.xcrawl.com](https://dash.xcrawl.com))
3. Choose **Search** or **Scrape** mode, fill in the inputs
4. Hit **Run**

No credit card needed â€” XCrawl gives free trial credits on signup.

---

## ðŸ“‹ Input Parameters

### Search Mode (`action: "search"`)

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `query` | string | **required** | Web search query (max 200 chars) |
| `limit` | integer | `10` | Number of results (1â€“50) |
| `location` | string | `"US"` | Geo-location code (`US`, `UK`, `CN`, `JP`, `DE`, etc.) |
| `language` | string | `"en"` | Search language (`en`, `zh`, `ja`, `fr`, etc.) |
| `withContent` | boolean | `true` | Fetch full page content for each result |
| `render` | boolean | `false` | JS rendering for anti-bot bypass |
| `formats` | string | `"markdown,summary"` | Output formats: comma-separated (`markdown`, `summary`, `html`) |
| `screenshot` | boolean | `false` | Capture page screenshot (requires `render=true`) |

### Scrape Mode (`action: "scrape"`)

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `url` | string | **required** | Single URL to scrape (max 2000 chars) |
| `render` | boolean | `false` | JS rendering for anti-bot bypass |
| `formats` | string | `"markdown,summary"` | Output formats |
| `screenshot` | boolean | `false` | Capture screenshot (requires `render=true`) |

---

## ðŸ§  Intelligent Anti-Block System

This actor is built to handle modern anti-bot systems out of the box:

- **Automatic block detection** â€” Heuristically checks for Cloudflare, DataDome, and other challenge pages (looks for captcha forms, browser verification, access denied messages)
- **Smart retry** â€” If a page appears blocked, automatically retries with headless browser rendering (Chromium via XCrawl's `jsRender`)
- **Concurrent crawling** â€” Uses `p-limit` to run up to 5 parallel scrapes (balanced for speed + reliability)
- **Global proxy pool** â€” Requests route through XCrawl's residential proxy network with configurable geo-location
- **Per-URL resilience** â€” Each URL gets at least 2 attempts; if both fail, the error is recorded per-entry without stopping the batch

### When to enable `render`

âœ… **Turn ON** for: News sites with paywalls (Reuters, WSJ), sites behind Cloudflare/DataDome, JavaScript-heavy SPAs  
âŒ **Keep OFF** for: Simple HTML pages, blogs, documentation (faster and cheaper without rendering)

---

## ðŸ“¦ Output Format

Each result is pushed to the Apify dataset:

```json
{
  "title": "Page Title",
  "url": "https://example.com",
  "snippet": "Search result description",
  "markdown": "Full page content converted to markdown...",
  "summary": "AI-generated summary from XCrawl...",
  "scrapeStatus": "completed",
  "screenshot": "base64-encoded PNG (if enabled)",
  "credits": "0.5",
  "scrapeError": null
}
```

**Search mode** returns an **array** of enriched results.  
**Scrape mode** returns a single result object.

---

## ðŸ’° Usage & Pricing

| Mode | XCrawl Credits Consumed |
|------|------------------------|
| Search (1 query) | ~1 credit |
| Scrape (no render) | ~1â€“3 credits |
| Scrape (with render) | ~3â€“8 credits |
| Free trial | âœ… Included with XCrawl signup |

The **actor itself is free** to run on Apify â€” you only pay for XCrawl API credits consumed.

---

## ðŸ”§ Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `XCRAWL_API_KEY` | âœ… Yes | Your API key from [dash.xcrawl.com](https://dash.xcrawl.com). Sign up â†’ Dashboard â†’ API Keys |

---

## ðŸŽ¯ Use Cases

- **Content research** â€” Collect articles, blog posts, and documentation on any topic
- **Market intelligence** â€” Scrape competitor pricing, product listings, and reviews
- **SEO / SERP monitoring** â€” Track search rankings across different geo-locations
- **RAG / LLM pipelines** â€” Feed clean markdown content into vector databases or AI agents
- **E-commerce** â€” Monitor product catalogs with location-specific searches
- **News aggregation** â€” Gather articles from multiple sources with automatic paywall bypass

---

## ðŸ— Architecture

```
Apify Run
  â””â”€ src/main.js (entry point)
      â”œâ”€ XCrawl Search API  â†’  Get top results
      â”œâ”€ XCrawl Scrape API  â†’  Extract page content
      â”‚   â””â”€ p-limit (concurrency = 5)
      â”‚       â”œâ”€ Normal scrape (fast)
      â”‚       â””â”€ Retry with JS render (anti-bot fallback)
      â””â”€ Apify Dataset     â†  Push all results
```

---

## ðŸ“„ Links

- **Source code:** [GitHub](https://github.com/yanxvdong123/xcrawl-search-scrape-actor)
- **XCrawl Dashboard:** [dash.xcrawl.com](https://dash.xcrawl.com)
- **XCrawl API Docs:** [docs.xcrawl.com](https://docs.xcrawl.com)
- **Report issues:** [GitHub Issues](https://github.com/yanxvdong123/xcrawl-search-scrape-actor/issues)