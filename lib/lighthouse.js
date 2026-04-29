import lighthouse from "lighthouse";

async function runLighthouse(url, formFactor, chrome) {
  const settings = {
    onlyCategories: ["performance", "accessibility", "best-practices", "seo"],
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
  };

  const runnerResult = await lighthouse(url, {
    port: chrome.port,
    ...settings,
    chromeFlags: ["--headless=new", "--no-sandbox", "--disable-dev-shm-usage"],
  });

  if (!runnerResult || !runnerResult.lhr) {
    throw new Error(`Lighthouse did not return results for ${url}`);
  }

  return runnerResult;
}

export { runLighthouse };
