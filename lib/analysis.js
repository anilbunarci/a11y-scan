import { normalizeArray } from "./utils.js";

function formatIssue(audit, categoryId) {
  return {
    id: audit.id,
    category: categoryId,
    title: audit.title,
    score: typeof audit.score === "number" ? audit.score : null,
    displayValue: audit.displayValue || "",
    description: audit.description || "",
  };
}

function getCategoryIssueRefs(lhr, categoryId) {
  return normalizeArray(lhr.categories?.[categoryId]?.auditRefs).filter(
    (ref) => ref.group !== "hidden",
  );
}

function collectCategoryIssues(lhr, categoryId) {
  const auditRefs = getCategoryIssueRefs(lhr, categoryId);
  const issues = [];

  for (const ref of auditRefs) {
    const audit = lhr.audits?.[ref.id];
    if (!audit) continue;

    const mode = audit.scoreDisplayMode;
    if (["notApplicable", "informative", "manual"].includes(mode)) continue;

    if (categoryId === "performance") {
      const isMetric = ref.group === "metrics";
      const score = typeof audit.score === "number" ? audit.score : null;
      const hasSavings = Boolean(
        audit.details?.overallSavingsMs > 0 ||
        audit.details?.overallSavingsBytes > 0,
      );
      const isProblemMetric = isMetric && score !== null && score < 0.9;
      const isProblemDiagnostic =
        !isMetric && (hasSavings || (score !== null && score < 0.9));

      if (isProblemMetric || isProblemDiagnostic) {
        issues.push(formatIssue(audit, categoryId));
      }
      continue;
    }

    const score = typeof audit.score === "number" ? audit.score : null;
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
    "first-contentful-paint",
    "largest-contentful-paint",
    "total-blocking-time",
    "cumulative-layout-shift",
    "speed-index",
  ]
    .map((id) => lhr.audits?.[id])
    .filter(Boolean)
    .map((audit) => `${audit.title}: ${audit.displayValue || "n/a"}`);

  const issues = [
    ...collectCategoryIssues(lhr, "performance"),
    ...collectCategoryIssues(lhr, "accessibility"),
    ...collectCategoryIssues(lhr, "best-practices"),
    ...collectCategoryIssues(lhr, "seo"),
  ];

  const topIssues = issues.slice(0, 8);

  return {
    issueCount: issues.length,
    issues,
    topIssues,
    topIssueTitles: topIssues.map((issue) =>
      issue.displayValue
        ? `${issue.title} (${issue.displayValue})`
        : issue.title,
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
    id: issue.code || issue.type || "pa11y",
    category: "accessibility-extended",
    title: issue.message || "Pa11y issue",
    score: null,
    displayValue: issue.type || "",
    description: issue.context || "",
    severity: issue.type || "notice",
    source: issue.runner || "pa11y",
  }));

  const errorCount = issues.filter(
    (issue) => issue.severity === "error",
  ).length;
  const warningCount = issues.filter(
    (issue) => issue.severity === "warning",
  ).length;
  const noticeCount = issues.filter(
    (issue) => issue.severity === "notice",
  ).length;

  return {
    issueCount: issues.length,
    errorCount,
    warningCount,
    noticeCount,
    issues,
    topIssueTitles: issues
      .slice(0, 8)
      .map((issue) =>
        issue.displayValue
          ? `${issue.title} [${issue.displayValue}]`
          : issue.title,
      ),
  };
}

function countAccessibilityIssues(issues) {
  return normalizeArray(issues).filter(
    (issue) =>
      issue.category === "accessibility" ||
      issue.category === "accessibility-extended",
  ).length;
}

function scoreAverageForRow(row) {
  const values = [
    row.performance,
    row.accessibility,
    row.bestPractices,
    row.seo,
  ].filter((value) => typeof value === "number");

  if (!values.length) return null;
  return Math.round(
    values.reduce((sum, value) => sum + value, 0) / values.length,
  );
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
      if (b.pagesAffected !== a.pagesAffected)
        return b.pagesAffected - a.pagesAffected;
      if (b.occurrences !== a.occurrences) return b.occurrences - a.occurrences;
      return a.title.localeCompare(b.title);
    });
}

function getWorstRows(rows, limit = 10) {
  return rows
    .filter((row) => row.status === "success")
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

function getBestRows(rows, limit = 10) {
  return rows
    .filter((row) => row.status === "success")
    .map((row) => ({ ...row, averageScore: scoreAverageForRow(row) }))
    .sort((a, b) => {
      const avgA = a.averageScore ?? -1;
      const avgB = b.averageScore ?? -1;
      if (avgA !== avgB) return avgB - avgA;
      if (a.issueCount !== b.issueCount) return a.issueCount - b.issueCount;
      return a.url.localeCompare(b.url);
    })
    .slice(0, limit);
}

export {
  collectLighthouseFindings,
  collectPa11yFindings,
  countAccessibilityIssues,
  scoreAverageForRow,
  aggregateCommonIssues,
  getBestRows,
  getWorstRows,
};
