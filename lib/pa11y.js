let cachedPa11y;

async function loadPa11y() {
  if (cachedPa11y !== undefined) return cachedPa11y;

  try {
    const mod = await import("pa11y");
    cachedPa11y = mod.default;
  } catch (error) {
    if (
      error.code !== "MODULE_NOT_FOUND" &&
      error.code !== "ERR_MODULE_NOT_FOUND"
    ) {
      throw error;
    }
    cachedPa11y = null;
  }

  return cachedPa11y;
}

async function runPa11y(url, standard) {
  const pa11y = await loadPa11y();
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

export { loadPa11y, runPa11y };
