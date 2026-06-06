# Lighthouse Sitemap Audit

Audit every page listed in a sitemap (including nested sitemap indexes) with Lighthouse, then generate:

- per-page HTML and JSON reports
- optional extended accessibility reports with pa11y
- a combined dashboard and machine-readable summaries

This is designed for full-site, one-command quality baselining across performance, accessibility, best practices, and SEO.

## What It Does

1. Fetches a sitemap URL and recursively resolves nested sitemap indexes.
2. Deduplicates URLs and auto-excludes paths containing `/-/media/`.
3. Applies optional include/exclude regex filters.
4. Runs Lighthouse for each URL on mobile, desktop, or both.
5. Runs pa11y checks when extended accessibility mode is enabled.
6. Aggregates common issues and identifies best/worst pages.
7. Writes an HTML dashboard plus CSV and JSON summaries.

## Requirements

- Node.js 18+
- Google Chrome installed

## Install

```bash
npm install
```

## Scripts

- `npm run audit` - run the main audit CLI
- `npm run audit:extended` - run with `--a11y extended --standard WCAG2AA`

## CLI Usage

### Named arguments (recommended)

```bash
npm run audit -- --sitemap https://example.com/sitemap.xml [options]
```

### Positional arguments (also supported)

```bash
npm run audit -- <sitemap> [outDir] [mobile|desktop|both] [limit]
```

### Options

- `--sitemap <url>`: sitemap URL (required unless positional arg 1 is used)
- `--out <dir>`: output directory (default: `./audit-output`)
- `--device <mobile|desktop|both>`: form factor(s) (default: `both`)
- `--limit <n>`: only audit first `n` URLs after filtering
- `--include <regex>`: include URLs matching regex (case-insensitive)
- `--exclude <regex>`: exclude URLs matching regex (case-insensitive)
- `--a11y <standard|extended>`: accessibility mode (default: `extended`)
- `--standard <WCAG standard>`: pa11y standard in extended mode (default: `WCAG2AA`)
- `--wcag <WCAG standard>`: alias for `--standard`

Note: when using `npm run`, prefer `--standard` instead of `--wcag`. Some npm versions can misread `--wcag` before your script receives arguments.

## Examples

### Audit all sitemap URLs for mobile and desktop

```bash
npm run audit -- --sitemap https://example.com/sitemap.xml --out ./audit-output --device both
```

### Audit only mobile

```bash
npm run audit -- --sitemap https://example.com/sitemap.xml --device mobile
```

### Audit only first 25 URLs

```bash
npm run audit -- --sitemap https://example.com/sitemap.xml --limit 25
```

### Include only one section

```bash
npm run audit -- --sitemap https://example.com/sitemap.xml --include "/news/"
```

### Exclude PDFs and search pages

```bash
npm run audit -- --sitemap https://example.com/sitemap.xml --exclude "\\.pdf$|/search"
```

### Extended accessibility with an explicit standard

```bash
npm run audit -- --sitemap https://example.com/sitemap.xml --a11y extended --standard WCAG2AA
```

## Output

The app writes:

- `audit-output/index.html`: combined dashboard
- `audit-output/summary.csv`: flattened per-page summary (scores, issue counts, links, key metrics)
- `audit-output/summary.json`: raw `{ summary, rows }` payload
- `audit-output/reports/*.html`: Lighthouse HTML reports per URL/device
- `audit-output/reports/*.json`: Lighthouse JSON reports per URL/device
- `audit-output/reports/*.pa11y.json`: pa11y JSON reports per URL/device (extended mode)
- `audit-output/reports/*.pa11y.html`: pa11y HTML reports per URL/device (extended mode)

## Dashboard Highlights

- per-device tabs (mobile/desktop)
- score gauges for average Performance, Accessibility, Best Practices, and SEO
- executive summary and recommended next steps
- most common issues across pages (with counts and recommendations)
- worst-performing and best-performing pages
- all-audited-pages table with status/health filtering

## Current Behavior Notes

- `--a11y` defaults to `extended`.
- If extended mode is requested but pa11y cannot load, the run continues with Lighthouse-only accessibility checks.
- Lighthouse runs with simulated throttling presets for mobile and desktop, and blocks select third-party patterns (`*facebook.net*`, `*twitter.com*`) to reduce noisy best-practices failures.
- Results can vary slightly between runs, especially performance metrics.
- Automated checks are a baseline; manual keyboard and screen-reader testing is still required.
