import lighthouse from "lighthouse";

// --disable-extensions prevents locally-installed Chrome extensions from injecting
// scripts that can cause false Best Practices failures (console errors, etc.).
const CHROME_FLAGS = [
  "--headless=new",
  "--no-sandbox",
  "--disable-dev-shm-usage",
  "--disable-extensions",
];

// Throttling presets that match PageSpeed Insights
// Adjusted CPU multiplier to match the cloud runner relative to a standard local machine
const THROTTLING = {
  desktop: {
    rttMs: 40,
    throughputKbps: 10 * 1024,
    cpuSlowdownMultiplier: 6,
    requestLatencyMs: 0,
    downloadThroughputKbps: 0,
    uploadThroughputKbps: 0,
  },
  mobile: {
    rttMs: 150,
    throughputKbps: 1638.4,
    cpuSlowdownMultiplier: 10,
    requestLatencyMs: 562.5,
    downloadThroughputKbps: 1474.56,
    uploadThroughputKbps: 675,
  },
};

async function runLighthouse(url, formFactor, chrome) {
  const settings = {
    onlyCategories: ["performance", "accessibility", "best-practices", "seo"],
    output: ["html", "json"],
    logLevel: "error",
    formFactor,
    // Block tracking scripts that generate false Best Practices failures
    // in PageSpeed Insights because PSI traffic is often bot-filtered.
    blockedUrlPatterns: ["*facebook.net*", "*twitter.com*"],
    throttlingMethod: "simulate",
    throttling:
      formFactor === "desktop" ? THROTTLING.desktop : THROTTLING.mobile,
    screenEmulation:
      formFactor === "desktop"
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
    ...settings,
    port: chrome.port,
    chromeFlags: CHROME_FLAGS,
  });

  if (!runnerResult || !runnerResult.lhr) {
    throw new Error(`Lighthouse did not return results for ${url}`);
  }

  return runnerResult;
}

export { runLighthouse };
