import { average, normalizeArray } from "./utils.js";
import { aggregateCommonIssues, getWorstRows } from "./analysis.js";

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const CIRC = 251.2; // 2 * π * 40
const SCORE_PASS = 90; // Lighthouse "Good" threshold
const SCORE_AVG = 50; // Lighthouse "Needs Improvement" threshold

function scoreGauge(label, value) {
  const color =
    value === null
      ? "#ccc"
      : value >= SCORE_PASS
        ? "#0cce6b"
        : value >= SCORE_AVG
          ? "#ffa400"
          : "#ff4e42";

  const offset = value === null ? CIRC : CIRC * (1 - value / 100);
  const shortLabel = label.replace(/^Average /, "");

  return `<div class="gauge-wrap">
    <div class="gauge-circle">
      <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <circle class="gauge-bg" cx="50" cy="50" r="40"/>
        <circle class="gauge-arc" cx="50" cy="50" r="40"
          stroke="${color}"
          stroke-dasharray="${CIRC}"
          stroke-dashoffset="${offset.toFixed(1)}"
          transform="rotate(-90 50 50)"/>
      </svg>
      <div class="gauge-num" style="color:${color}">${value ?? "n/a"}</div>
    </div>
    <div class="gauge-label">${esc(shortLabel)}</div>
  </div>`;
}

function renderTabPanel(device, rows) {
  const deviceRows = rows.filter((r) => r.formFactor === device);
  const commonIssues = aggregateCommonIssues(deviceRows).slice(0, 12);
  const worstRows = getWorstRows(deviceRows, 10);

  const badges = [
    ["Average Performance", average(deviceRows.map((r) => r.performance))],
    ["Average Accessibility", average(deviceRows.map((r) => r.accessibility))],
    ["Average Best Practices", average(deviceRows.map((r) => r.bestPractices))],
    ["Average SEO", average(deviceRows.map((r) => r.seo))],
  ]
    .map(([label, value]) => scoreGauge(label, value))
    .join("");

  const issueListHtml = commonIssues.length
    ? commonIssues
        .map(
          (issue) => `
      <tr>
        <td>${esc(issue.category)}</td>
        <td>${esc(issue.title)}</td>
        <td>${issue.pagesAffected}</td>
        <td>${issue.occurrences}</td>
      </tr>`,
        )
        .join("")
    : '<tr><td colspan="4">No issue details collected.</td></tr>';

  const worstRowsHtml = worstRows.length
    ? worstRows
        .map(
          (row) => `
      <tr>
        <td><a href="${esc(row.url)}" target="_blank" rel="noopener noreferrer">${esc(row.url)}</a></td>
        <td>${row.averageScore ?? "n/a"}</td>
        <td>${row.issueCount ?? 0}</td>
        <td>${row.accessibilityFindingCount ?? 0}</td>
        <td>${row.pa11yIssueCount ?? 0}</td>
        <td>${esc((row.topIssueTitles || []).slice(0, 3).join(" | ") || "n/a")}</td>
      </tr>`,
        )
        .join("")
    : '<tr><td colspan="6">No successful audits yet.</td></tr>';

  const rowHtml = deviceRows
    .map(
      (row) => `
    <tr>
      <td>${esc(row.pageType)}</td>
      <td><a href="${esc(row.url)}" target="_blank" rel="noopener noreferrer">${esc(row.url)}</a></td>
      <td>${row.performance ?? "n/a"}</td>
      <td>${row.accessibility ?? "n/a"}</td>
      <td>${row.bestPractices ?? "n/a"}</td>
      <td>${row.seo ?? "n/a"}</td>
      <td>${row.issueCount ?? 0}</td>
      <td>${row.accessibilityFindingCount ?? 0}</td>
      <td>${row.pa11yIssueCount ?? 0}</td>
      <td>${esc((row.topIssueTitles || []).slice(0, 4).join(" | ") || "n/a")}</td>
      <td>${row.status}</td>
      <td>
        ${row.reportHtml ? `<a href="./${esc(row.reportHtml)}">Lighthouse</a>` : ""}
        ${row.pa11yReportHtml ? ` ${row.reportHtml ? "|" : ""} <a href="./${esc(row.pa11yReportHtml)}">Pa11y Report</a>` : ""}
      </td>
    </tr>`,
    )
    .join("");

  return `
  <div class="gauges">${badges}</div>
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
  </table>`;
}

function renderHtmlDashboard(summary, rows, generatedAt, sitemapUrl) {
  const devices = [...new Set(rows.map((r) => r.formFactor))].sort();
  const firstDevice = devices[0] ?? "desktop";

  const tabButtons = devices
    .map(
      (d) =>
        `<button class="tab-btn${d === firstDevice ? " active" : ""}" data-device="${esc(d)}" onclick="switchTab('${esc(d)}',this)">${d.charAt(0).toUpperCase() + d.slice(1)}</button>`,
    )
    .join("");

  const tabPanels = devices
    .map(
      (d) =>
        `<div class="tab-panel" id="panel-${esc(d)}" style="display:${d === firstDevice ? "block" : "none"}">${renderTabPanel(d, rows)}</div>`,
    )
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Lighthouse Sitemap Audit</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 24px; color: #222; }
    h1, h2 { margin-bottom: 8px; margin-top: 0; }
    .meta { color: #555; margin-bottom: 20px; }
    .tabs { display: flex; gap: 4px; margin-bottom: 24px; border-bottom: 2px solid #ddd; }
    .tab-btn { border: none; background: none; padding: 10px 24px; font-size: 15px; font-weight: 600; cursor: pointer; border-bottom: 3px solid transparent; margin-bottom: -2px; color: #666; border-radius: 4px 4px 0 0; transition: color .15s, border-color .15s; }
    .tab-btn:hover { color: #222; }
    .tab-btn.active { color: #0a5; border-bottom-color: #0a5; }
    .gauges { display: flex; gap: 40px; flex-wrap: wrap; margin: 24px 0; }
    .gauge-wrap { display: flex; flex-direction: column; align-items: center; }
    .gauge-circle { position: relative; width: 112px; height: 112px; }
    .gauge-circle svg { width: 112px; height: 112px; display: block; }
    .gauge-bg { fill: none; stroke: #e8f0f0; stroke-width: 9; }
    .gauge-arc { fill: none; stroke-width: 9; stroke-linecap: round; }
    .gauge-num { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 28px; font-weight: 700; line-height: 1; }
    .gauge-label { font-size: 13px; color: #444; margin-top: 8px; text-align: center; font-weight: 500; }
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
  <div class="tabs">${tabButtons}</div>
  ${tabPanels}
  <script>
    function switchTab(device, btn) {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.style.display = 'none');
      btn.classList.add('active');
      document.getElementById('panel-' + device).style.display = 'block';
    }
  </script>
</body>
</html>`;
}

function renderPa11yHtml(results) {
  const issues = normalizeArray(results.issues);

  const errorCount = issues.filter((i) => i.type === "error").length;
  const warningCount = issues.filter((i) => i.type === "warning").length;
  const noticeCount = issues.filter((i) => i.type === "notice").length;

  const typeColor = { error: "#c0392b", warning: "#e67e22", notice: "#2980b9" };
  const typeBg = { error: "#fdf2f2", warning: "#fef9f0", notice: "#f0f6fd" };

  const groups = new Map();
  for (const issue of issues) {
    const key = issue.code;
    if (!groups.has(key)) {
      groups.set(key, {
        code: issue.code,
        type: issue.type,
        runner: issue.runner,
        message: issue.message,
        description: issue.runnerExtras?.description || "",
        helpUrl: issue.runnerExtras?.helpUrl || "",
        impact: issue.runnerExtras?.impact || "",
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
      const color = typeColor[group.type] || "#555";
      const bg = typeBg[group.type] || "#fafafa";
      const itemsHtml = group.items
        .map(
          (item, idx) => `
          <details class="occurrence">
            <summary>#${idx + 1} &nbsp;<code>${esc(item.selector)}</code></summary>
            <div class="occurrence-body">
              ${
                item.context
                  ? `<div class="context-label">HTML context</div><pre class="context">${esc(
                      item.context,
                    )}</pre>`
                  : ""
              }
              ${
                item.runnerExtras?.needsFurtherReview
                  ? '<p class="needs-review">⚠ Needs further review</p>'
                  : ""
              }
            </div>
          </details>`,
        )
        .join("");

      return `
      <div class="rule-card" style="border-left: 4px solid ${color}; background:${bg};">
        <div class="rule-header">
          <span class="badge" style="background:${color}">${esc(group.type)}</span>
          ${group.runner ? `<span class="runner-badge">${esc(group.runner)}</span>` : ""}
          ${group.impact ? `<span class="impact-badge">${esc(group.impact)}</span>` : ""}
          <span class="rule-count">${group.items.length} occurrence${
            group.items.length !== 1 ? "s" : ""
          }</span>
        </div>
        <div class="rule-title">${esc(group.message.replace(/\s*\(https?:\/\/[^)]+\)/, ""))}</div>
        ${
          group.description && group.description !== group.message
            ? `<div class="rule-desc">${esc(group.description)}</div>`
            : ""
        }
        ${
          group.helpUrl
            ? `<a class="rule-link" href="${esc(
                group.helpUrl,
              )}" target="_blank" rel="noopener noreferrer">View rule documentation ↗</a>`
            : ""
        }
        <div class="occurrences">${itemsHtml}</div>
      </div>`;
    })
    .join("");

  const noIssues =
    issues.length === 0
      ? '<p style="color:#27ae60;font-weight:600;">✓ No issues found.</p>'
      : "";

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
    .back-btn { display: inline-block; margin-bottom: 16px; padding: 6px 14px; font-size: 13px; color: #444; text-decoration: none; border: 1px solid #ccc; border-radius: 6px; background: #fff; box-shadow: 0 1px 4px rgba(0,0,0,.1); }
    .back-btn:hover { background: #f5f5f5; }
  </style>
</head>
<body>
  <a href="../index.html" class="back-btn">&larr; Back</a>
  <h1>Pa11y Accessibility Report</h1>
  <div class="meta">
    <div><strong>Page:</strong> <a href="${esc(
      results.pageUrl,
    )}" target="_blank" rel="noopener noreferrer">${esc(results.pageUrl)}</a></div>
    ${
      results.documentTitle
        ? `<div><strong>Title:</strong> ${esc(results.documentTitle)}</div>`
        : ""
    }
    <div><strong>Unique rules triggered:</strong> ${groups.size}</div>
  </div>

  <div class="summary">
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
        : ""
    }
    ${
      warningCount
        ? `<button class="filter-btn" data-filter="warning" onclick="setFilter('warning',this)">Warnings (${warningCount})</button>`
        : ""
    }
    ${
      noticeCount
        ? `<button class="filter-btn" data-filter="notice"  onclick="setFilter('notice',this)">Notices (${noticeCount})</button>`
        : ""
    }
  </div>`
      : ""
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

export { renderHtmlDashboard, renderPa11yHtml };
