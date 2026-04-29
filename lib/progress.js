let _progressCols = 0;

function renderProgress(step, total, formFactor, url) {
  _progressCols = process.stdout.columns || 100;
  const barWidth = 20;
  const filled = Math.round((step / total) * barWidth);
  const bar = "\u2588".repeat(filled) + "\u2591".repeat(barWidth - filled);
  const counter = `${step}/${total}`;
  const prefix = `[${bar}] ${counter} [${formFactor}] `;
  const maxUrlLen = Math.max(_progressCols - prefix.length - 1, 20);
  const shortUrl =
    url.length > maxUrlLen ? "..." + url.slice(-(maxUrlLen - 3)) : url;
  process.stdout.write("\r" + `${prefix}${shortUrl}`.padEnd(_progressCols));
}

function logAboveBar(...messages) {
  const cols = _progressCols || process.stdout.columns || 100;
  process.stdout.write("\r" + " ".repeat(cols) + "\r");
  for (const msg of messages) process.stderr.write(msg + "\n");
}

function clearProgress() {
  const cols = _progressCols || process.stdout.columns || 100;
  process.stdout.write("\r" + " ".repeat(cols) + "\r");
}

export { renderProgress, logAboveBar, clearProgress };
