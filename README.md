# XCrawl Web Search & Scrape — Apify Actor

搜索网页或抓取任何 URL，基于 XCrawl 住宅代理网络。

## 功能

- **搜索** — 通过 XCrawl Search API 获取 Google 质量搜索结果
- **抓取** — 抓取任意 URL，返回 Markdown 格式的页面内容 + 摘要

## 环境变量

| 变量 | 必填 | 说明 |
|------|------|------|
| `XCRAWL_API_KEY` | ✅ | 从 [dash.xcrawl.com](https://dash.xcrawl.com) 获取 |

## 输入

```json
{
  "action": "search",
  "query": "latest AI news",
  "location": "US",
  "language": "en",
  "limit": 5
}
```

```json
{
  "action": "scrape",
  "url": "https://example.com"
}
```
