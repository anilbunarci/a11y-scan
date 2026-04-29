#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const lighthouse = require('lighthouse').default;
const chromeLauncher = require('chrome-launcher');
const { XMLParser } = require('fast-xml-parser');
const { createObjectCsvWriter } = require('csv-writer');

let cachedPa11yModule;

const args = process.argv.slice(2);
const positionalArgs = [];
for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg.startsWith('--')) {
    const next = args[i + 1];
    if (next && !next.startsWith('--')) {
      i += 1;
    }
    continue;
  }
  positionalArgs.push(arg);
}

function getPositionalArg(index, defaultValue = undefined) {
  return positionalArgs[index] ?? defaultValue;
}

function getArg(name, defaultValue = undefined) {
  const index = args.indexOf(`--${name}`);
  if (index === -1) return defaultValue;
  const next = args[index + 1];
  if (!next || next.startsWith('--')) return true;
  return next;
}

function hasFlag(name) {
  return args.includes(`--${name}`);
}

function loadPa11y() {
  if (cachedPa11yModule !== undefined) return cachedPa11yModule;

  try {
    cachedPa11yModule = require('pa11y');
  } catch (error) {
    if (error.code !== 'MODULE_NOT_FOUND') {
      throw error;
    }
    cachedPa11yModule = null;
  }

  return cachedPa11yModule;
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'lighthouse-sitemap-audit/1.0',
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  }

  return await res.text();
}

function normalizeArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

async function getUrlsFromSitemap(sitemapUrl, visited = new Set()) {
  if (visited.has(sitemapUrl)) return [];
  visited.add(sitemapUrl);

  const xml = await fetchText(sitemapUrl);
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    parseTagValue: true,
    trimValues: true,
  });

  const parsed = parser.parse(xml);

  if (parsed.urlset) {
    const urls = normalizeArray(parsed.urlset.url)
      .map((entry) => entry.loc)
      .filter(Boolean);
    return urls;
  }

  if (parsed.sitemapindex) {
    const sitemapUrls = normalizeArray(parsed.sitemapindex.sitemap)
      .map((entry) => entry.loc)
      .filter(Boolean);

    let nested = [];
    for (const childUrl of sitemapUrls) {
      const childItems = await getUrlsFromSitemap(childUrl, visited);
      nested = nested.concat(childItems);
    }
    return nested;
  }

  throw new Error(`Unsupported sitemap format at ${sitemapUrl}`);
}

function sanitizeFileName(input) {
  return input
    .replace(/^https?:\/\//, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 180);
}

function scoreToPercent(score) {
  if (typeof score !== 'number') return null;
  return Math.round(score * 100);
}

async function runLighthouse(url, formFactor, chrome) {
  const settings = {
    onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
    output: ['html', 'json'],
    logLevel: 'error',
    formFactor,
    screenEmulation:
      formFactor === 'desktop'
        ? {
            mobile: false,
            width: 1350,
            height: 940,
            deviceScaleFactor: 1,
            disabled: false,
          }
        : {
            mobile: true,
            width: 390,
            height: 844,
            deviceScaleFactor: 2,
            disabled: false,
          },
  };

  const runnerResult = await lighthouse(url, {
    port: chrome.port,
    ...settings,
    chromeFlags: ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage'],
  });

  if (!runnerResult || !runnerResult.lhr) {
    throw new Error(`Lighthouse did not return results for ${url}`);
  }

  return runnerResult;
}

async function runPa11y(url, standard) {
  const pa11y = loadPa11y();
  if (!pa11y) {
    return null;
  }

  return pa11y(url, {
    standard,
    runners: ['axe', 'htmlcs'],
    chromeLaunchConfig: {
      ignoreHTTPSErrors: true,
      args: ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage'],
    },
  });
}

function average(values) {
  const valid = values.filter((v) => typeof v === 'number');
  if (!valid.length) return null;
  return Math.round(valid.reduce((a, b) => a + b, 0) / valid.length);
}

function formatIssue(audit, categoryId) {
  return {
    id: audit.id,
    category: categoryId,
    title: audit.title,
    score: typeof audit.score === 'number' ? audit.score : null,
    displayValue: audit.displayValue || '',
    description: audit.description || '',
  };
}

function getCategoryIssueRefs(lhr, categoryId) {
  return normalizeArray(lhr.categories?.[categoryId]?.auditRefs).filter(
    (ref) => ref.group !== 'hidden'
  );
}

function collectCategoryIssues(lhr, categoryId) {
  const auditRefs = getCategoryIssueRefs(lhr, categoryId);
  const issues = [];

  for (const ref of auditRefs) {
    const audit = lhr.audits?.[ref.id];
    if (!audit) continue;

    const mode = audit.scoreDisplayMode;
    if (['notApplicable', 'informative', 'manual'].includes(mode)) continue;

    if (categoryId === 'performance') {
      const isMetric = ref.group === 'metrics';
      const score = typeof audit.score === 'number' ? audit.score : null;
      const hasSavings = Boolean(
        audit.details?.overallSavingsMs > 0 || audit.details?.overallSavingsBytes > 0
      );
      const isProblemMetric = isMetric && score !== null && score < 0.9;
      const isProblemDiagnostic = !isMetric && (hasSavings || (score !== null && score < 0.9));

      if (isProblemMetric || isProblemDiagnostic) {
        issues.push(formatIssue(audit, categoryId));
      }
      continue;
    }

    const score = typeof audit.score === 'number' ? audit.score : null;
    if (score !== null && score < 1) {
      issues.push(formatIssue(audit, categoryId));
    }
  }

  return issues.sort((a, b) => {
    const scoreA = a.score ?? 999;
    const scoreB = b.score ?? 999;
    if (scoreA !== scoreB) return scoreA - scoreB;
    return a.title.localeCompare(b.title);
  });
}

function collectLighthouseFindings(lhr) {
  const performanceMetrics = [
    'first-contentful-paint',
    'largest-contentful-paint',
    'total-blocking-time',
    'cumulative-layout-shift',
    'speed-index',
  ]
    .map((id) => lhr.audits?.[id])
    .filter(Boolean)
    .map((audit) => `${audit.title}: ${audit.displayValue || 'n/a'}`);

  const issues = [
    ...collectCategoryIssues(lhr, 'performance'),
    ...collectCategoryIssues(lhr, 'accessibility'),
    ...collectCategoryIssues(lhr, 'best-practices'),
    ...collectCategoryIssues(lhr, 'seo'),
  ];

  const topIssues = issues.slice(0, 8);

  return {
    issueCount: issues.length,
    issues,
    topIssues,
    topIssueTitles: topIssues.map((issue) =>
      issue.displayValue ? `${issue.title} (${issue.displayValue})` : issue.title
    ),
    performanceMetrics,
  };
}

function collectPa11yFindings(results) {
  if (!results) {
    return {
      issueCount: 0,
      errorCount: 0,
      warningCount: 0,
      noticeCount: 0,
      issues: [],
      topIssueTitles: [],
    };
  }

  const issues = normalizeArray(results.issues).map((issue) => ({
    id: issue.code || issue.type || 'pa11y',
    category: 'accessibility-extended',
    title: issue.message || 'Pa11y issue',
    score: null,
    displayValue: issue.type || '',
    description: issue.context || '',
    severity: issue.type || 'notice',
    source: issue.runner || 'pa11y',
  }));

  const errorCount = issues.filter((issue) => issue.severity === 'error').length;
  const warningCount = issues.filter((issue) => issue.severity === 'warning').length;
  const noticeCount = issues.filter((issue) => issue.severity === 'notice').length;

  return {
    issueCount: issues.length,
    errorCount,
    warningCount,
    noticeCount,
    issues,
    topIssueTitles: issues
      .slice(0, 8)
      .map((issue) =>
        issue.displayValue ? `${issue.title} [${issue.displayValue}]` : issue.title
      ),
  };
}

function countAccessibilityIssues(issues) {
  return normalizeArray(issues).filter(
    (issue) => issue.category === 'accessibility' || issue.category === 'accessibility-extended'
  ).length;
}

function scoreAverageForRow(row) {
  const values = [row.performance, row.accessibility, row.bestPractices, row.seo].filter(
    (value) => typeof value === 'number'
  );

  if (!values.length) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function aggregateCommonIssues(rows) {
  const counts = new Map();

  for (const row of rows) {
    for (const issue of normalizeArray(row.issues)) {
      const key = `${issue.category}::${issue.title}`;
      const current = counts.get(key) || {
        category: issue.category,
        title: issue.title,
        occurrences: 0,
        pages: new Set(),
      };
      current.occurrences += 1;
      current.pages.add(`${row.formFactor}:${row.url}`);
      counts.set(key, current);
    }
  }

  return Array.from(counts.values())
    .map((entry) => ({
      category: entry.category,
      title: entry.title,
      occurrences: entry.occurrences,
      pagesAffected: entry.pages.size,
    }))
    .sort((a, b) => {
      if (b.pagesAffected !== a.pagesAffected) return b.pagesAffected - a.pagesAffected;
      if (b.occurrences !== a.occurrences) return b.occurrences - a.occurrences;
      return a.title.localeCompare(b.title);
    });
}

function getWorstRows(rows, limit = 10) {
  return rows
    .filter((row) => row.status === 'success')
    .map((row) => ({ ...row, averageScore: scoreAverageForRow(row) }))
    .sort((a, b) => {
      const avgA = a.averageScore ?? 999;
      const avgB = b.averageScore ?? 999;
      if (avgA !== avgB) return avgA - avgB;
      if (b.issueCount !== a.issueCount) return b.issueCount - a.issueCount;
      return a.url.localeCompare(b.url);
    })
    .slice(0, limit);
}

function renderHtmlDashboard(summary, rows, generatedAt, sitemapUrl) {
  const esc = (s) =>
    String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  const badges = [
    ['Average Performance', summary.performance],
    ['Average Accessibility', summary.accessibility],
    ['Average Best Practices', summary.bestPractices],
    ['Average SEO', summary.seo],
    ['Avg Accessibility Findings', summary.averageAccessibilityFindings],
    ['Pages With Extended A11y Issues', summary.pagesWithExtendedA11yIssues],
  ]
    .map(
      ([label, value]) =>
        `<div class="card"><div class="label">${esc(label)}</div><div class="value">${
          value ?? 'n/a'
        }</div></div>`
    )
    .join('');

  const commonIssues = aggregateCommonIssues(rows).slice(0, 12);
  const worstRows = getWorstRows(rows, 10);

  const issueListHtml = commonIssues.length
    ? commonIssues
        .map(
          (issue) => `
      <tr>
        <td>${esc(issue.category)}</td>
        <td>${esc(issue.title)}</td>
        <td>${issue.pagesAffected}</td>
        <td>${issue.occurrences}</td>
      </tr>`
        )
        .join('')
    : '<tr><td colspan="4">No issue details collected.</td></tr>';

  const worstRowsHtml = worstRows.length
    ? worstRows
        .map(
          (row) => `
      <tr>
        <td>${esc(row.formFactor)}</td>
        <td><a href="${esc(row.url)}" target="_blank" rel="noopener noreferrer">${esc(
            row.url
          )}</a></td>
        <td>${row.averageScore ?? 'n/a'}</td>
        <td>${row.issueCount ?? 0}</td>
        <td>${row.accessibilityFindingCount ?? 0}</td>
        <td>${row.pa11yIssueCount ?? 0}</td>
        <td>${esc((row.topIssueTitles || []).slice(0, 3).join(' | ') || 'n/a')}</td>
      </tr>`
        )
        .join('')
    : '<tr><td colspan="7">No successful audits yet.</td></tr>';

  const rowHtml = rows
    .map(
      (row) => `
    <tr>
      <td>${esc(row.pageType)}</td>
      <td><a href="${esc(row.url)}" target="_blank" rel="noopener noreferrer">${esc(
        row.url
      )}</a></td>
      <td>${esc(row.formFactor)}</td>
      <td>${row.performance ?? 'n/a'}</td>
      <td>${row.accessibility ?? 'n/a'}</td>
      <td>${row.bestPractices ?? 'n/a'}</td>
      <td>${row.seo ?? 'n/a'}</td>
      <td>${row.issueCount ?? 0}</td>
      <td>${row.accessibilityFindingCount ?? 0}</td>
      <td>${row.pa11yIssueCount ?? 0}</td>
      <td>${esc((row.topIssueTitles || []).slice(0, 4).join(' | ') || 'n/a')}</td>
      <td>${row.status}</td>
      <td>
        ${row.reportHtml ? `<a href="./${esc(row.reportHtml)}">Lighthouse</a>` : ''}
        ${
          row.pa11yReportHtml
            ? ` ${row.reportHtml ? '|' : ''} <a href="./${esc(
                row.pa11yReportHtml
              )}">Pa11y Report</a>`
            : ''
        }
      </td>
    </tr>`
    )
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Lighthouse Sitemap Audit</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 24px; color: #222; }
    h1, h2 { margin-bottom: 8px; }
    .meta { color: #555; margin-bottom: 20px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; margin: 24px 0; }
    .card { border: 1px solid #ddd; border-radius: 12px; padding: 16px; background: #fafafa; }
    .label { font-size: 14px; color: #666; }
    .value { font-size: 32px; font-weight: 700; margin-top: 6px; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    th, td { border: 1px solid #ddd; padding: 10px; text-align: left; vertical-align: top; }
    th { background: #f5f5f5; }
    tr:nth-child(even) { background: #fcfcfc; }
    a { color: #0a5; text-decoration: none; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <h1>Lighthouse Sitemap Audit</h1>
  <div class="meta">
    <div><strong>Generated:</strong> ${esc(generatedAt)}</div>
    <div><strong>Sitemap:</strong> <a href="${esc(sitemapUrl)}">${esc(sitemapUrl)}</a></div>
    <div><strong>Total audited results:</strong> ${rows.length}</div>
  </div>

  <div class="grid">${badges}</div>

  <h2>Most Common Issues</h2>
  <table>
    <thead>
      <tr>
        <th>Category</th>
        <th>Issue</th>
        <th>Pages Affected</th>
        <th>Total Hits</th>
      </tr>
    </thead>
    <tbody>${issueListHtml}</tbody>
  </table>

  <h2>Worst Pages</h2>
  <table>
    <thead>
      <tr>
        <th>Device</th>
        <th>URL</th>
        <th>Average Score</th>
        <th>Issue Count</th>
        <th>A11y Findings</th>
        <th>Extended A11y</th>
        <th>Top Issues</th>
      </tr>
    </thead>
    <tbody>${worstRowsHtml}</tbody>
  </table>

  <h2>Per-URL Results</h2>
  <table>
    <thead>
      <tr>
        <th>Type</th>
        <th>URL</th>
        <th>Device</th>
        <th>Performance</th>
        <th>Accessibility</th>
        <th>Best Practices</th>
        <th>SEO</th>
        <th>Issue Count</th>
        <th>A11y Findings</th>
        <th>Extended A11y</th>
        <th>Top Issues</th>
        <th>Status</th>
        <th>Report</th>
      </tr>
    </thead>
    <tbody>${rowHtml}</tbody>
  </table>
</body>
</html>`;
}

function renderPa11yHtml(results) {
  const esc = (s) =>
    String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  const issues = normalizeArray(results.issues);

  const errorCount = issues.filter((i) => i.type === 'error').length;
  const warningCount = issues.filter((i) => i.type === 'warning').length;
  const noticeCount = issues.filter((i) => i.type === 'notice').length;

  const typeColor = { error: '#c0392b', warning: '#e67e22', notice: '#2980b9' };
  const typeBg = { error: '#fdf2f2', warning: '#fef9f0', notice: '#f0f6fd' };

  // Group by rule code
  const groups = new Map();
  for (const issue of issues) {
    const key = issue.code;
    if (!groups.has(key)) {
      groups.set(key, {
        code: issue.code,
        type: issue.type,
        runner: issue.runner,
        message: issue.message,
        description: issue.runnerExtras?.description || '',
        helpUrl: issue.runnerExtras?.helpUrl || '',
        impact: issue.runnerExtras?.impact || '',
        items: [],
      });
    }
    groups.get(key).items.push(issue);
  }

  const groupHtml = Array.from(groups.values())
    .sort((a, b) => {
      const order = { error: 0, warning: 1, notice: 2 };
      return (order[a.type] ?? 3) - (order[b.type] ?? 3);
    })
    .map((group) => {
      const color = typeColor[group.type] || '#555';
      const bg = typeBg[group.type] || '#fafafa';
      const itemsHtml = group.items
        .map(
          (item, idx) => `
          <details class="occurrence">
            <summary>#${idx + 1} &nbsp;<code>${esc(item.selector)}</code></summary>
            <div class="occurrence-body">
              ${
                item.context
                  ? `<div class="context-label">HTML context</div><pre class="context">${esc(
                      item.context
                    )}</pre>`
                  : ''
              }
              ${
                item.runnerExtras?.needsFurtherReview
                  ? '<p class="needs-review">⚠ Needs further review</p>'
                  : ''
              }
            </div>
          </details>`
        )
        .join('');

      return `
      <div class="rule-card" style="border-left: 4px solid ${color}; background:${bg};">
        <div class="rule-header">
          <span class="badge" style="background:${color}">${esc(group.type)}</span>
          ${group.runner ? `<span class="runner-badge">${esc(group.runner)}</span>` : ''}
          ${group.impact ? `<span class="impact-badge">${esc(group.impact)}</span>` : ''}
          <span class="rule-count">${group.items.length} occurrence${
        group.items.length !== 1 ? 's' : ''
      }</span>
        </div>
        <div class="rule-title">${esc(group.message.replace(/\s*\(https?:\/\/[^)]+\)/, ''))}</div>
        ${
          group.description && group.description !== group.message
            ? `<div class="rule-desc">${esc(group.description)}</div>`
            : ''
        }
        ${
          group.helpUrl
            ? `<a class="rule-link" href="${esc(
                group.helpUrl
              )}" target="_blank" rel="noopener noreferrer">View rule documentation ↗</a>`
            : ''
        }
        <div class="occurrences">${itemsHtml}</div>
      </div>`;
    })
    .join('');

  const noIssues =
    issues.length === 0 ? '<p style="color:#27ae60;font-weight:600;">✓ No issues found.</p>' : '';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Pa11y Report — ${esc(results.documentTitle || results.pageUrl)}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body { font-family: Arial, sans-serif; margin: 0; padding: 24px; color: #222; background: #f7f8fa; }
    h1 { font-size: 22px; margin-bottom: 4px; }
    .meta { color: #555; font-size: 14px; margin-bottom: 20px; }
    .meta a { color: #0a5; }
    .summary { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 28px; }
    .stat { border-radius: 10px; padding: 14px 22px; min-width: 120px; text-align: center; color: #fff; }
    .stat .num { font-size: 32px; font-weight: 700; line-height: 1; }
    .stat .lbl { font-size: 12px; margin-top: 4px; opacity: .85; text-transform: uppercase; letter-spacing: .05em; }
    .stat.error   { background: #c0392b; }
    .stat.warning { background: #e67e22; }
    .stat.notice  { background: #2980b9; }
    .stat.total   { background: #555; }
    .filters { margin-bottom: 16px; display: flex; gap: 8px; flex-wrap: wrap; }
    .filter-btn { border: 1px solid #ccc; background: #fff; border-radius: 20px; padding: 5px 14px; font-size: 13px; cursor: pointer; transition: background .15s; }
    .filter-btn.active, .filter-btn:hover { background: #222; color: #fff; border-color: #222; }
    .rule-card { border-radius: 8px; padding: 16px 18px; margin-bottom: 14px; }
    .rule-card.hidden { display: none; }
    .rule-header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; flex-wrap: wrap; }
    .badge { color: #fff; font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 20px; text-transform: uppercase; letter-spacing: .04em; }
    .runner-badge { font-size: 11px; background: #eee; color: #444; padding: 2px 8px; border-radius: 20px; }
    .impact-badge { font-size: 11px; background: #fff3cd; color: #856404; padding: 2px 8px; border-radius: 20px; }
    .rule-count { margin-left: auto; font-size: 12px; color: #666; }
    .rule-title { font-weight: 600; font-size: 15px; margin-bottom: 4px; }
    .rule-desc { font-size: 13px; color: #555; margin-bottom: 4px; }
    .rule-link { font-size: 12px; color: #0a5; text-decoration: none; display: inline-block; margin-bottom: 10px; }
    .rule-link:hover { text-decoration: underline; }
    .occurrences { margin-top: 10px; display: flex; flex-direction: column; gap: 6px; }
    .occurrence { border: 1px solid #ddd; border-radius: 6px; background: #fff; overflow: hidden; }
    .occurrence > summary { padding: 8px 12px; cursor: pointer; font-size: 13px; list-style: none; display: flex; align-items: baseline; gap: 6px; user-select: none; }
    .occurrence > summary::-webkit-details-marker { display: none; }
    .occurrence > summary::before { content: '▶'; font-size: 10px; color: #888; flex-shrink: 0; transition: transform .15s; }
    .occurrence[open] > summary::before { transform: rotate(90deg); }
    .occurrence-body { padding: 10px 14px; border-top: 1px solid #eee; }
    .context-label { font-size: 11px; color: #888; text-transform: uppercase; letter-spacing: .05em; margin-bottom: 4px; }
    pre.context { background: #f4f4f4; border: 1px solid #ddd; border-radius: 4px; padding: 10px; font-size: 12px; overflow-x: auto; white-space: pre-wrap; word-break: break-all; margin: 0 0 8px; }
    .needs-review { font-size: 12px; color: #856404; margin: 0; }
  </style>
</head>
<body>
  <h1>Pa11y Accessibility Report</h1>
  <div class="meta">
    <div><strong>Page:</strong> <a href="${esc(
      results.pageUrl
    )}" target="_blank" rel="noopener noreferrer">${esc(results.pageUrl)}</a></div>
    ${
      results.documentTitle
        ? `<div><strong>Title:</strong> ${esc(results.documentTitle)}</div>`
        : ''
    }
    <div><strong>Unique rules triggered:</strong> ${groups.size}</div>
  </div>

  <div class="summary">
    <div class="stat total"><div class="num">${
      issues.length
    }</div><div class="lbl">Total</div></div>
    <div class="stat error"><div class="num">${errorCount}</div><div class="lbl">Errors</div></div>
    <div class="stat warning"><div class="num">${warningCount}</div><div class="lbl">Warnings</div></div>
    <div class="stat notice"><div class="num">${noticeCount}</div><div class="lbl">Notices</div></div>
  </div>

  ${
    issues.length > 0
      ? `
  <div class="filters">
    <button class="filter-btn active" data-filter="all" onclick="setFilter('all',this)">All (${
      issues.length
    })</button>
    ${
      errorCount
        ? `<button class="filter-btn" data-filter="error"   onclick="setFilter('error',this)">Errors (${errorCount})</button>`
        : ''
    }
    ${
      warningCount
        ? `<button class="filter-btn" data-filter="warning" onclick="setFilter('warning',this)">Warnings (${warningCount})</button>`
        : ''
    }
    ${
      noticeCount
        ? `<button class="filter-btn" data-filter="notice"  onclick="setFilter('notice',this)">Notices (${noticeCount})</button>`
        : ''
    }
  </div>`
      : ''
  }

  ${noIssues}
  <div id="issue-list">${groupHtml}</div>

  <script>
    function setFilter(type, btn) {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.rule-card').forEach(card => {
        card.classList.toggle('hidden', type !== 'all' && !card.querySelector('.badge').textContent.trim().toLowerCase().startsWith(type));
      });
    }
  </script>
</body>
</html>`;
}

let _progressCols = 0;

function renderProgress(step, total, formFactor, url) {
  _progressCols = process.stdout.columns || 100;
  const barWidth = 20;
  const filled = Math.round((step / total) * barWidth);
  const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(barWidth - filled);
  const counter = `${step}/${total}`;
  const prefix = `[${bar}] ${counter} [${formFactor}] `;
  const maxUrlLen = Math.max(_progressCols - prefix.length - 1, 20);
  const shortUrl = url.length > maxUrlLen ? '...' + url.slice(-(maxUrlLen - 3)) : url;
  process.stdout.write('\r' + `${prefix}${shortUrl}`.padEnd(_progressCols));
}

function logAboveBar(...messages) {
  const cols = _progressCols || process.stdout.columns || 100;
  process.stdout.write('\r' + ' '.repeat(cols) + '\r');
  for (const msg of messages) process.stderr.write(msg + '\n');
}

async function main() {
  const sitemapUrl = getArg('sitemap') || getPositionalArg(0);
  if (!sitemapUrl) {
    console.error(
      'Usage: node audit.js --sitemap https://example.com/sitemap.xml [--out ./audit-output] [--limit 50] [--device mobile|desktop|both] [--include pattern] [--exclude pattern] [--a11y standard|extended] [--standard WCAG2AA]'
    );
    console.error(
      '   or: node audit.js https://example.com/sitemap.xml [./audit-output] [mobile|desktop|both] [limit]'
    );
    process.exit(1);
  }

  const outDir = path.resolve(getArg('out', getPositionalArg(1, './audit-output')));
  const limit = Number(getArg('limit', getPositionalArg(3, '0'))) || 0;
  const includePattern = getArg('include');
  const excludePattern = getArg('exclude');
  const deviceArg = (getArg('device', getPositionalArg(2, 'both')) || 'both').toLowerCase();
  const a11yMode = (getArg('a11y', 'extended') || 'extended').toLowerCase();
  const wcagStandard = (getArg('standard', getArg('wcag', 'WCAG2AA')) || 'WCAG2AA').toUpperCase();

  const formFactors = deviceArg === 'both' ? ['mobile', 'desktop'] : [deviceArg];
  if (!formFactors.every((v) => ['mobile', 'desktop'].includes(v))) {
    throw new Error('Invalid --device value. Use mobile, desktop, or both.');
  }
  if (!['standard', 'extended'].includes(a11yMode)) {
    throw new Error('Invalid --a11y value. Use standard or extended.');
  }

  const extendedA11yEnabled = a11yMode === 'extended';
  if (extendedA11yEnabled && !loadPa11y()) {
    console.warn(
      'Extended accessibility mode requested, but `pa11y` is not installed yet. Falling back to Lighthouse-only accessibility checks.'
    );
  }

  fs.mkdirSync(outDir, { recursive: true });
  fs.mkdirSync(path.join(outDir, 'reports'), { recursive: true });

  console.log(`Fetching sitemap: ${sitemapUrl}`);
  let urls = await getUrlsFromSitemap(sitemapUrl);

  urls = Array.from(new Set(urls));

  // Exclude the pages under /-/media/ which are typically media files and not HTML pages
  let urlsExcludingMedia = urls.filter((url) => !url.includes('/-/media/'));
  console.log(`Found ${urlsExcludingMedia.length} URL(s) to audit.`);
  urls = urlsExcludingMedia;

  if (includePattern) {
    const re = new RegExp(includePattern, 'i');
    urls = urls.filter((url) => re.test(url));
  }

  if (excludePattern) {
    const re = new RegExp(excludePattern, 'i');
    urls = urls.filter((url) => !re.test(url));
  }

  if (limit > 0) {
    urls = urls.slice(0, limit);
  }

  if (!urls.length) {
    throw new Error('No URLs found after filters were applied.');
  }

  console.log(`Found ${urls.length} URL(s) to audit.`);

  const totalSteps = urls.length * formFactors.length;
  let completedSteps = 0;

  const chrome = await chromeLauncher.launch({
    chromeFlags: ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage'],
  });

  const rows = [];

  try {
    for (const url of urls) {
      for (const formFactor of formFactors) {
        const id = sanitizeFileName(`${formFactor}_${url}`);
        const htmlPath = path.join(outDir, 'reports', `${id}.html`);
        const jsonPath = path.join(outDir, 'reports', `${id}.json`);
        const pa11yJsonPath = path.join(outDir, 'reports', `${id}.pa11y.json`);
        const pa11yHtmlPath = path.join(outDir, 'reports', `${id}.pa11y.html`);

        completedSteps += 1;
        renderProgress(completedSteps, totalSteps, formFactor, url);

        try {
          const result = await runLighthouse(url, formFactor, chrome);
          const [htmlReport, jsonReport] = result.report;
          fs.writeFileSync(htmlPath, htmlReport, 'utf8');
          fs.writeFileSync(jsonPath, jsonReport, 'utf8');

          const lhr = result.lhr;
          const findings = collectLighthouseFindings(lhr);
          let pa11yResults = null;
          let pa11yFindings = collectPa11yFindings(null);
          let pa11yStatus = 'not-run';
          let pa11yReportJson = '';
          let pa11yReportHtml = '';

          if (extendedA11yEnabled && loadPa11y()) {
            try {
              pa11yResults = await runPa11y(url, wcagStandard);
              pa11yFindings = collectPa11yFindings(pa11yResults);
              pa11yStatus = 'success';
              pa11yReportJson = `reports/${path.basename(pa11yJsonPath)}`;
              pa11yReportHtml = `reports/${path.basename(pa11yHtmlPath)}`;
              fs.writeFileSync(pa11yJsonPath, JSON.stringify(pa11yResults, null, 2), 'utf8');
              fs.writeFileSync(pa11yHtmlPath, renderPa11yHtml(pa11yResults), 'utf8');
            } catch (error) {
              pa11yStatus = `failed: ${error.message}`;
              logAboveBar(`Extended accessibility failed [${formFactor}] ${url}`, error.message);
            }
          }

          const combinedIssues = findings.issues.concat(pa11yFindings.issues);
          const combinedTopIssueTitles = Array.from(
            new Set(findings.topIssueTitles.concat(pa11yFindings.topIssueTitles))
          ).slice(0, 10);
          rows.push({
            pageType: 'sitemap',
            url,
            formFactor,
            performance: scoreToPercent(lhr.categories.performance?.score),
            accessibility: scoreToPercent(lhr.categories.accessibility?.score),
            bestPractices: scoreToPercent(lhr.categories['best-practices']?.score),
            seo: scoreToPercent(lhr.categories.seo?.score),
            status: 'success',
            reportHtml: `reports/${path.basename(htmlPath)}`,
            reportJson: `reports/${path.basename(jsonPath)}`,
            pa11yReportJson,
            pa11yReportHtml,
            pa11yStatus,
            fetchTime: lhr.fetchTime,
            finalUrl: lhr.finalUrl,
            issueCount: combinedIssues.length,
            accessibilityFindingCount: countAccessibilityIssues(combinedIssues),
            topIssueTitles: combinedTopIssueTitles,
            performanceMetrics: findings.performanceMetrics,
            issues: combinedIssues,
            pa11yIssueCount: pa11yFindings.issueCount,
            pa11yErrorCount: pa11yFindings.errorCount,
            pa11yWarningCount: pa11yFindings.warningCount,
            pa11yNoticeCount: pa11yFindings.noticeCount,
          });
        } catch (error) {
          rows.push({
            pageType: 'sitemap',
            url,
            formFactor,
            performance: null,
            accessibility: null,
            bestPractices: null,
            seo: null,
            status: `failed: ${error.message}`,
            reportHtml: '',
            reportJson: '',
            pa11yReportJson: '',
            pa11yReportHtml: '',
            pa11yStatus: 'not-run',
            fetchTime: '',
            finalUrl: '',
            issueCount: 0,
            accessibilityFindingCount: 0,
            topIssueTitles: [],
            performanceMetrics: [],
            issues: [],
            pa11yIssueCount: 0,
            pa11yErrorCount: 0,
            pa11yWarningCount: 0,
            pa11yNoticeCount: 0,
          });
          logAboveBar(`Failed [${formFactor}] ${url}`, error.message);
        }
      }
    }
  } finally {
    await chrome.kill();
  }

  const summary = {
    performance: average(rows.map((r) => r.performance)),
    accessibility: average(rows.map((r) => r.accessibility)),
    bestPractices: average(rows.map((r) => r.bestPractices)),
    seo: average(rows.map((r) => r.seo)),
    averageAccessibilityFindings: average(rows.map((r) => r.accessibilityFindingCount)),
    pagesWithExtendedA11yIssues: rows.filter((row) => row.pa11yIssueCount > 0).length,
    commonIssues: aggregateCommonIssues(rows).slice(0, 20),
    worstPages: getWorstRows(rows, 10).map((row) => ({
      url: row.url,
      formFactor: row.formFactor,
      averageScore: row.averageScore,
      issueCount: row.issueCount,
      accessibilityFindingCount: row.accessibilityFindingCount,
      pa11yIssueCount: row.pa11yIssueCount,
      topIssueTitles: row.topIssueTitles.slice(0, 5),
      reportHtml: row.reportHtml,
    })),
  };

  const csvWriter = createObjectCsvWriter({
    path: path.join(outDir, 'summary.csv'),
    header: [
      { id: 'pageType', title: 'TYPE' },
      { id: 'url', title: 'URL' },
      { id: 'formFactor', title: 'DEVICE' },
      { id: 'performance', title: 'PERFORMANCE' },
      { id: 'accessibility', title: 'ACCESSIBILITY' },
      { id: 'bestPractices', title: 'BEST_PRACTICES' },
      { id: 'seo', title: 'SEO' },
      { id: 'status', title: 'STATUS' },
      { id: 'issueCount', title: 'ISSUE_COUNT' },
      { id: 'accessibilityFindingCount', title: 'ACCESSIBILITY_FINDINGS' },
      { id: 'pa11yIssueCount', title: 'EXTENDED_A11Y_ISSUES' },
      { id: 'pa11yErrorCount', title: 'EXTENDED_A11Y_ERRORS' },
      { id: 'pa11yWarningCount', title: 'EXTENDED_A11Y_WARNINGS' },
      { id: 'pa11yNoticeCount', title: 'EXTENDED_A11Y_NOTICES' },
      { id: 'pa11yStatus', title: 'EXTENDED_A11Y_STATUS' },
      { id: 'topIssueTitlesJoined', title: 'TOP_ISSUES' },
      { id: 'performanceMetricsJoined', title: 'PERFORMANCE_METRICS' },
      { id: 'reportHtml', title: 'HTML_REPORT' },
      { id: 'reportJson', title: 'JSON_REPORT' },
      { id: 'pa11yReportJson', title: 'EXTENDED_A11Y_REPORT' },
      { id: 'fetchTime', title: 'FETCH_TIME' },
      { id: 'finalUrl', title: 'FINAL_URL' },
    ],
  });

  await csvWriter.writeRecords(
    rows.map((row) => ({
      ...row,
      topIssueTitlesJoined: normalizeArray(row.topIssueTitles).join(' | '),
      performanceMetricsJoined: normalizeArray(row.performanceMetrics).join(' | '),
    }))
  );

  const htmlDashboard = renderHtmlDashboard(summary, rows, new Date().toISOString(), sitemapUrl);
  fs.writeFileSync(path.join(outDir, 'index.html'), htmlDashboard, 'utf8');
  fs.writeFileSync(
    path.join(outDir, 'summary.json'),
    JSON.stringify({ summary, rows }, null, 2),
    'utf8'
  );

  const cols = _progressCols || process.stdout.columns || 100;
  process.stdout.write('\r' + ' '.repeat(cols) + '\r');
  console.log('Done. Files generated:');
  console.log(`- ${path.join(outDir, 'index.html')}`);
  console.log(`- ${path.join(outDir, 'summary.csv')}`);
  console.log(`- ${path.join(outDir, 'summary.json')}`);
  console.log(`- ${path.join(outDir, 'reports')}/*`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
