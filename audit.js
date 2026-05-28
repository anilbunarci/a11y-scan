#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { createObjectCsvWriter } from "csv-writer";
import { runLighthouse } from "./lib/lighthouse.js";
import { loadPa11y, runPa11y } from "./lib/pa11y.js";
import { getUrlsFromSitemap } from "./lib/sitemap.js";
import { launch as launchChrome } from "chrome-launcher";
import { getArg, getPositionalArg } from "./lib/args.js";
import { renderHtmlDashboard, renderPa11yHtml } from "./lib/render.js";
import { renderProgress, logAboveBar, clearProgress } from "./lib/progress.js";
import {
  average,
  normalizeArray,
  scoreToPercent,
  sanitizeFileName,
} from "./lib/utils.js";
import {
  getWorstRows,
  collectPa11yFindings,
  aggregateCommonIssues,
  countAccessibilityIssues,
  collectLighthouseFindings,
} from "./lib/analysis.js";

async function main() {
  const sitemapUrl = getArg("sitemap") || getPositionalArg(0);
  if (!sitemapUrl) {
    console.error(
      "Usage: node audit.js --sitemap https://example.com/sitemap.xml [--out ./audit-output] [--limit 50] [--device mobile|desktop|both] [--include pattern] [--exclude pattern] [--a11y standard|extended] [--standard WCAG2AA]",
    );
    console.error(
      "   or: node audit.js https://example.com/sitemap.xml [./audit-output] [mobile|desktop|both] [limit]",
    );
    process.exit(1);
  }

  const outDir = path.resolve(
    getArg("out", getPositionalArg(1, "./audit-output")),
  );
  const limit = Number(getArg("limit", getPositionalArg(3, "0"))) || 0;
  const includePattern = getArg("include");
  const excludePattern = getArg("exclude");
  const deviceArg = (
    getArg("device", getPositionalArg(2, "both")) || "both"
  ).toLowerCase();
  const a11yMode = (getArg("a11y", "extended") || "extended").toLowerCase();
  const wcagStandard = (
    getArg("standard", getArg("wcag", "WCAG2AA")) || "WCAG2AA"
  ).toUpperCase();

  const formFactors =
    deviceArg === "both" ? ["mobile", "desktop"] : [deviceArg];
  if (!formFactors.every((v) => ["mobile", "desktop"].includes(v))) {
    throw new Error("Invalid --device value. Use mobile, desktop, or both.");
  }
  if (!["standard", "extended"].includes(a11yMode)) {
    throw new Error("Invalid --a11y value. Use standard or extended.");
  }

  const extendedA11yEnabled = a11yMode === "extended";
  if (extendedA11yEnabled && !(await loadPa11y())) {
    console.warn(
      "Extended accessibility mode requested, but `pa11y` is not installed yet. Falling back to Lighthouse-only accessibility checks.",
    );
  }

  fs.mkdirSync(outDir, { recursive: true });
  fs.mkdirSync(path.join(outDir, "reports"), { recursive: true });

  console.log(`Fetching sitemap: ${sitemapUrl}`);
  let urls = await getUrlsFromSitemap(sitemapUrl);

  urls = Array.from(new Set(urls));

  // Exclude the pages under /-/media/ which are typically media files and not HTML pages
  let urlsExcludingMedia = urls.filter((url) => !url.includes("/-/media/"));
  console.log(`Found ${urlsExcludingMedia.length} URL(s) to audit.`);
  urls = urlsExcludingMedia;

  if (includePattern) {
    const re = new RegExp(includePattern, "i");
    urls = urls.filter((url) => re.test(url));
  }

  if (excludePattern) {
    const re = new RegExp(excludePattern, "i");
    urls = urls.filter((url) => !re.test(url));
  }

  if (limit > 0) {
    urls = urls.slice(0, limit);
  }

  if (!urls.length) {
    throw new Error("No URLs found after filters were applied.");
  }

  console.log(`Found ${urls.length} URL(s) to audit.`);

  const totalSteps = urls.length * formFactors.length;
  let completedSteps = 0;

  const chrome = await launchChrome({
    chromeFlags: ["--headless=new", "--no-sandbox", "--disable-dev-shm-usage"],
  });

  const rows = [];

  try {
    for (const url of urls) {
      for (const formFactor of formFactors) {
        const id = sanitizeFileName(`${formFactor}_${url}`);
        const htmlPath = path.join(outDir, "reports", `${id}.html`);
        const jsonPath = path.join(outDir, "reports", `${id}.json`);
        const pa11yJsonPath = path.join(outDir, "reports", `${id}.pa11y.json`);
        const pa11yHtmlPath = path.join(outDir, "reports", `${id}.pa11y.html`);

        completedSteps += 1;
        renderProgress(completedSteps, totalSteps, formFactor, url);

        try {
          const result = await runLighthouse(url, formFactor, chrome);
          const [htmlReport, jsonReport] = result.report;
          const backBtn = `<a href="../index.html" style="position:fixed;top:72px;left:16px;z-index:9999;background:#fff;border:1px solid #ccc;border-radius:6px;padding:6px 14px;font-family:Arial,sans-serif;font-size:13px;color:#444;text-decoration:none;box-shadow:0 1px 4px rgba(0,0,0,.15)">&larr; Back</a>`;
          fs.writeFileSync(
            htmlPath,
            htmlReport.replace("</body>", backBtn + "</body>"),
            "utf8",
          );
          fs.writeFileSync(jsonPath, jsonReport, "utf8");

          const lhr = result.lhr;
          const findings = collectLighthouseFindings(lhr);
          let pa11yResults = null;
          let pa11yFindings = collectPa11yFindings(null);
          let pa11yStatus = "not-run";
          let pa11yReportJson = "";
          let pa11yReportHtml = "";

          if (extendedA11yEnabled && (await loadPa11y())) {
            try {
              pa11yResults = await runPa11y(url, wcagStandard);
              pa11yFindings = collectPa11yFindings(pa11yResults);
              pa11yStatus = "success";
              pa11yReportJson = `reports/${path.basename(pa11yJsonPath)}`;
              pa11yReportHtml = `reports/${path.basename(pa11yHtmlPath)}`;
              fs.writeFileSync(
                pa11yJsonPath,
                JSON.stringify(pa11yResults, null, 2),
                "utf8",
              );
              fs.writeFileSync(
                pa11yHtmlPath,
                renderPa11yHtml(pa11yResults),
                "utf8",
              );
            } catch (error) {
              pa11yStatus = `failed: ${error.message}`;
              logAboveBar(
                `Extended accessibility failed [${formFactor}] ${url}`,
                error.message,
              );
            }
          }

          const combinedIssues = findings.issues.concat(pa11yFindings.issues);
          const combinedTopIssueTitles = Array.from(
            new Set(
              findings.topIssueTitles.concat(pa11yFindings.topIssueTitles),
            ),
          ).slice(0, 10);
          rows.push({
            pageType: "sitemap",
            url,
            formFactor,
            performance: scoreToPercent(lhr.categories.performance?.score),
            accessibility: scoreToPercent(lhr.categories.accessibility?.score),
            bestPractices: scoreToPercent(
              lhr.categories["best-practices"]?.score,
            ),
            seo: scoreToPercent(lhr.categories.seo?.score),
            status: "success",
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
            pageType: "sitemap",
            url,
            formFactor,
            performance: null,
            accessibility: null,
            bestPractices: null,
            seo: null,
            status: `failed: ${error.message}`,
            reportHtml: "",
            reportJson: "",
            pa11yReportJson: "",
            pa11yReportHtml: "",
            pa11yStatus: "not-run",
            fetchTime: "",
            finalUrl: "",
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
    averageAccessibilityFindings: average(
      rows.map((r) => r.accessibilityFindingCount),
    ),
    pagesWithExtendedA11yIssues: rows.filter((row) => row.pa11yIssueCount > 0)
      .length,
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
    path: path.join(outDir, "summary.csv"),
    header: [
      { id: "pageType", title: "TYPE" },
      { id: "url", title: "URL" },
      { id: "formFactor", title: "DEVICE" },
      { id: "performance", title: "PERFORMANCE" },
      { id: "accessibility", title: "ACCESSIBILITY" },
      { id: "bestPractices", title: "BEST_PRACTICES" },
      { id: "seo", title: "SEO" },
      { id: "status", title: "STATUS" },
      { id: "issueCount", title: "ISSUE_COUNT" },
      { id: "accessibilityFindingCount", title: "ACCESSIBILITY_FINDINGS" },
      { id: "pa11yIssueCount", title: "EXTENDED_A11Y_ISSUES" },
      { id: "pa11yErrorCount", title: "EXTENDED_A11Y_ERRORS" },
      { id: "pa11yWarningCount", title: "EXTENDED_A11Y_WARNINGS" },
      { id: "pa11yNoticeCount", title: "EXTENDED_A11Y_NOTICES" },
      { id: "pa11yStatus", title: "EXTENDED_A11Y_STATUS" },
      { id: "topIssueTitlesJoined", title: "TOP_ISSUES" },
      { id: "performanceMetricsJoined", title: "PERFORMANCE_METRICS" },
      { id: "reportHtml", title: "HTML_REPORT" },
      { id: "reportJson", title: "JSON_REPORT" },
      { id: "pa11yReportJson", title: "EXTENDED_A11Y_REPORT" },
      { id: "fetchTime", title: "FETCH_TIME" },
      { id: "finalUrl", title: "FINAL_URL" },
    ],
  });

  await csvWriter.writeRecords(
    rows.map((row) => ({
      ...row,
      topIssueTitlesJoined: normalizeArray(row.topIssueTitles).join(" | "),
      performanceMetricsJoined: normalizeArray(row.performanceMetrics).join(
        " | ",
      ),
    })),
  );

  const htmlDashboard = renderHtmlDashboard(
    summary,
    rows,
    new Date().toISOString(),
    sitemapUrl,
  );
  fs.writeFileSync(path.join(outDir, "index.html"), htmlDashboard, "utf8");
  fs.writeFileSync(
    path.join(outDir, "summary.json"),
    JSON.stringify({ summary, rows }, null, 2),
    "utf8",
  );

  clearProgress();
  console.log("Done. Files generated:");
  console.log(`- ${path.join(outDir, "index.html")}`);
  console.log(`- ${path.join(outDir, "summary.csv")}`);
  console.log(`- ${path.join(outDir, "summary.json")}`);
  console.log(`- ${path.join(outDir, "reports")}/*`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
