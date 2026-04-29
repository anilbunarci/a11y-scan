"use strict";

let cachedPa11yModule;

function loadPa11y() {
  if (cachedPa11yModule !== undefined) return cachedPa11yModule;

  try {
    cachedPa11yModule = require("pa11y");
  } catch (error) {
    if (error.code !== "MODULE_NOT_FOUND") {
      throw error;
    }
    cachedPa11yModule = null;
  }

  return cachedPa11yModule;
}

async function runPa11y(url, standard) {
  const pa11y = loadPa11y();
  if (!pa11y) {
    return null;
  }

  return pa11y(url, {
    standard,
    runners: ["axe", "htmlcs"],
    chromeLaunchConfig: {
      ignoreHTTPSErrors: true,
      args: ["--headless=new", "--no-sandbox", "--disable-dev-shm-usage"],
    },
  });
}

module.exports = { loadPa11y, runPa11y };
