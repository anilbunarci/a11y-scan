/**
 * Generates an executive summary paragraph for the audit report
 * using a deterministic template driven by the scan results.
 */
import { aggregateCommonIssues } from "./analysis.js";

const TOOL_RECOMMENDATION =
  "For ongoing monitoring and recurring reporting, it is recommended to evaluate market-proven platforms such as Siteimprove or Monsido, which provide automated alerting, compliance tracking, and actionable dashboards as the site evolves.";

/**
 * Derives the overall health label and CSS class from a composite average score.
 * @param {number|null} score
 * @returns {{ label: string, cls: string }}
 */
function healthVerdict(score) {
  if (score === null || score === undefined) {
    return { label: "Unknown", cls: "exec-unknown" };
  }
  if (score >= 90) return { label: "Healthy", cls: "exec-pass" };
  if (score >= 70) return { label: "Needs Attention", cls: "exec-attention" };
  return { label: "At Risk", cls: "exec-critical" };
}

/**
 * Builds a structured data object summarising the scan results.
 *
 * @param {object[]} rows      - Audit row records
 * @param {string}   sitemapUrl
 * @param {string}   generatedAt - ISO date string
 * @returns {object}
 */
function buildScanContext(rows, sitemapUrl, generatedAt) {
  const successful = rows.filter((r) => r.status === "success");

  const avg = (key) => {
    const vals = successful
      .map((r) => r[key])
      .filter((v) => v !== null && v !== undefined);
    if (!vals.length) return null;
    return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
  };

  const scores = {
    performance: avg("performance"),
    accessibility: avg("accessibility"),
    bestPractices: avg("bestPractices"),
    seo: avg("seo"),
  };

  const composite = Object.values(scores).filter((v) => v !== null).length
    ? Math.round(
        Object.values(scores)
          .filter((v) => v !== null)
          .reduce((a, b) => a + b, 0) /
          Object.values(scores).filter((v) => v !== null).length,
      )
    : null;

  // Identify weakest and strongest categories
  const scorePairs = Object.entries(scores).filter(([, v]) => v !== null);
  scorePairs.sort(([, a], [, b]) => a - b);
  const weakest = scorePairs[0]?.[0] ?? null;
  const strongest = scorePairs[scorePairs.length - 1]?.[0] ?? null;

  // Aggregate all issues and derive the dominant category by total hits
  const aggregated = aggregateCommonIssues(successful);
  const categoryHits = new Map();
  for (const issue of aggregated) {
    categoryHits.set(
      issue.category,
      (categoryHits.get(issue.category) || 0) + issue.occurrences,
    );
  }
  const dominantIssueCategory =
    [...categoryHits.entries()].sort(([, a], [, b]) => b - a)[0]?.[0] ?? null;
  const topIssueCount = aggregated.length;

  const categoryLabels = {
    performance: "Performance",
    accessibility: "Accessibility",
    bestPractices: "Best Practices",
    seo: "SEO",
  };

  return {
    totalPages: rows.length,
    successfulPages: successful.length,
    scores,
    composite,
    weakest: weakest ? categoryLabels[weakest] : null,
    weakestScore: weakest ? scores[weakest] : null,
    strongest: strongest ? categoryLabels[strongest] : null,
    strongestScore: strongest ? scores[strongest] : null,
    dominantIssueCategory,
    topIssueCount,
    sitemapUrl,
    generatedAt,
    verdict: healthVerdict(composite),
  };
}

/**
 * Builds the summary text from the scan context.
 * @param {object} ctx - Result of buildScanContext()
 * @returns {string}   - Plain text paragraph (HTML-unsafe, caller must escape)
 */
function buildSummaryText(ctx) {
  const {
    totalPages,
    weakest,
    weakestScore,
    strongest,
    strongestScore,
    dominantIssueCategory,
    topIssueCount,
    verdict,
  } = ctx;

  const scoreStr = (label, val) =>
    val !== null ? `${label} (${val}/100)` : label;

  // Opening sentence — calibrated to verdict
  let opening;
  if (verdict.label === "Healthy") {
    opening = `The scan covered ${totalPages} page${totalPages !== 1 ? "s" : ""} and reveals an overall website health of Healthy, with consistently strong scores across all measured categories.`;
  } else if (verdict.label === "Needs Attention") {
    opening = `The scan covered ${totalPages} page${totalPages !== 1 ? "s" : ""} and reveals an overall website health of Needs Attention — the site is broadly functional but has areas requiring focused improvement.`;
  } else {
    opening = `The scan covered ${totalPages} page${totalPages !== 1 ? "s" : ""} and reveals an overall website health of At Risk, with one or more categories scoring below acceptable thresholds and requiring urgent remediation.`;
  }

  // Category commentary
  let categoryNote = "";
  if (weakest && weakestScore !== null) {
    categoryNote = `${scoreStr(weakest, weakestScore)} is the primary area to focus on for improvements`;
    if (strongest && strongest !== weakest && strongestScore !== null) {
      categoryNote += `, while ${scoreStr(strongest, strongestScore)} is performing well`;
    }
    categoryNote += ".";
  }

  // Issues sentence — derived from actual occurrence counts, not score ranking
  let issuesNote = "";
  if (topIssueCount > 0) {
    const area = dominantIssueCategory ?? "several areas";
    issuesNote =
      topIssueCount === 1
        ? `A recurring issue was identified in the ${area} area, appearing across multiple pages.`
        : `${topIssueCount} recurring issue types were identified, with the highest concentration in the ${area} area.`;
  }

  // Action sentence — calibrated to verdict
  let action;
  if (verdict.label === "Healthy") {
    action =
      "It is recommended to maintain the current quality standards and schedule periodic reviews to stay ahead of emerging issues.";
  } else if (verdict.label === "Needs Attention") {
    action = `It is recommended to address ${weakest ?? "the identified"} issues in the near term to prevent further degradation and to ensure a positive experience for all users.`;
  } else {
    action = `Immediate remediation of ${weakest ?? "critical"} issues is strongly recommended, prioritising accessibility and performance fixes that have the broadest impact across the site.`;
  }

  return [opening, categoryNote, issuesNote, action, TOOL_RECOMMENDATION]
    .filter(Boolean)
    .join(" ");
}

/**
 * Main entry point. Returns an HTML string for the executive summary card.
 *
 * @param {object[]} rows
 * @param {string}   sitemapUrl
 * @param {string}   generatedAt - ISO date string
 * @returns {{ html: string }}
 */
export function buildExecutiveSummary(rows, sitemapUrl, generatedAt) {
  const ctx = buildScanContext(rows, sitemapUrl, generatedAt);
  const { verdict } = ctx;

  const summaryText = buildSummaryText(ctx);

  // Escape for HTML output
  const escaped = String(summaryText)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

  const html = `
<div class="exec-summary">
  <div class="exec-header">
    <h2 class="exec-title">Executive Summary</h2>
  </div>
  <p class="exec-body">${escaped}</p>
</div>`;

  return { html };
}
