"use strict";

function normalizeArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function sanitizeFileName(input) {
  return input
    .replace(/^https?:\/\//, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 180);
}

function scoreToPercent(score) {
  if (typeof score !== "number") return null;
  return Math.round(score * 100);
}

function average(values) {
  const valid = values.filter((v) => typeof v === "number");
  if (!valid.length) return null;
  return Math.round(valid.reduce((a, b) => a + b, 0) / valid.length);
}

module.exports = { normalizeArray, sanitizeFileName, scoreToPercent, average };
