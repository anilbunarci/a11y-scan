import lighthouse from "lighthouse";

async function runLighthouse(url, formFactor, chrome) {
  const settings = {
    onlyCategories: ["performance", "accessibility", "best-practices", "seo"],
    skipAudits: ["third-party-cookies"],
    output: ["html", "json"],
    logLevel: "error",
    formFactor,
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
    throttlingMethod: "simulate",
    throttling: {
      rttMs: 40,
      throughputKbps: 10240,
      cpuSlowdownMultiplier: 1,
      requestLatencyMs: 0,
      downloadThroughputKbps: 0,
      uploadThroughputKbps: 0,
    },
  };

  const runnerResult = await lighthouse(url, {
    port: chrome.port,
    ...settings,
    chromeFlags: [
      "--headless=new",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--enable-features=NetworkServiceInProcess2",
    ],
  });

  if (!runnerResult || !runnerResult.lhr) {
    throw new Error(`Lighthouse did not return results for ${url}`);
  }

  return runnerResult;
}

export { runLighthouse };
