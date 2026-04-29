# Lighthouse Sitemap Audit

A small Node.js app you can run in VS Code to:

1. read a `sitemap.xml`
2. collect all URLs (including nested sitemap indexes)
3. run Lighthouse for each URL
4. generate per-page HTML/JSON reports
5. run Lighthouse plus extended accessibility checks
6. generate a combined HTML dashboard + CSV + JSON summary
7. surface common issues across pages so you can prioritize fixes faster

## Requirements

- Node.js 18+
- Google Chrome installed

## Install

```bash
npm install
```

This project can now use `pa11y` for deeper accessibility coverage in addition to Lighthouse.

## Run

### Audit all sitemap URLs for mobile + desktop

```bash
npm run audit -- --sitemap https://example.com/sitemap.xml --out ./audit-output --device both
```

### Run with extended accessibility coverage

```bash
npm run audit -- --sitemap https://example.com/sitemap.xml --a11y extended --standard WCAG2AA
```

Note: when using `npm run`, prefer `--standard` instead of `--wcag`. Some npm versions misread `--wcag` as npm's own shorthand flags before your script starts.

### Audit only mobile

```bash
npm run audit -- --sitemap https://example.com/sitemap.xml --device mobile
```

### Audit only first 25 URLs

```bash
npm run audit -- --sitemap https://example.com/sitemap.xml --limit 25
```

### Positional CLI style also works

```bash
npm run audit -- https://example.com/sitemap.xml ./audit-output both 25
```

### Include only a section

```bash
npm run audit -- --sitemap https://example.com/sitemap.xml --include "/news/"
```

### Exclude PDFs or search pages

```bash
npm run audit -- --sitemap https://example.com/sitemap.xml --exclude "\\.pdf$|/search"
```

## Output

The app creates:

- `audit-output/index.html` → combined dashboard
- `audit-output/summary.csv` → spreadsheet-friendly summary with Lighthouse issues, extended accessibility findings, and key performance metrics
- `audit-output/summary.json` → raw summary data plus common issue rollups and worst pages
- `audit-output/reports/*.html` → one Lighthouse HTML report per URL/device
- `audit-output/reports/*.json` → one Lighthouse JSON report per URL/device
- `audit-output/reports/*.pa11y.json` → one extended accessibility report per URL/device when `pa11y` is installed

## What The Dashboard Now Highlights

- average Lighthouse scores
- average accessibility findings per page
- most common issues across the crawl
- worst-performing pages to prioritize first
- top issues per page
- extended accessibility issue counts from `pa11y`

## Free Tool Integrations To Consider Next

- `pa11y`: deeper automated accessibility testing than Lighthouse alone and now supported by this tool
- `axe-core` or `@axe-core/cli`: useful if you want a dedicated accessibility-only workflow
- `html-validate`: catches invalid markup patterns that often contribute to accessibility and SEO issues
- `linkinator`: finds broken internal links across the site
- `sitemap-validator`: verifies sitemap coverage and malformed entries
- `Lighthouse CI`: stores runs over time so you can compare regressions
- `webhint`: additional best-practices and standards checks

## Notes

- Lighthouse results vary slightly from run to run, especially performance.
- Lighthouse is still an automated baseline; the new `pa11y` layer improves accessibility coverage but does not replace manual keyboard and screen-reader testing.
- For authenticated pages, log in first with a dedicated Chrome profile and extend the script later to reuse that profile.
- If the site is very large, use `--limit`, `--include`, or `--exclude` to run sections separately.
