"use strict";

const { XMLParser } = require("fast-xml-parser");
const { normalizeArray } = require("./utils");

async function fetchText(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "lighthouse-sitemap-audit/1.0",
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  }

  return await res.text();
}

async function getUrlsFromSitemap(sitemapUrl, visited = new Set()) {
  if (visited.has(sitemapUrl)) return [];
  visited.add(sitemapUrl);

  const xml = await fetchText(sitemapUrl);
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    parseTagValue: true,
    trimValues: true,
  });

  const parsed = parser.parse(xml);

  if (parsed.urlset) {
    const urls = normalizeArray(parsed.urlset.url)
      .map((entry) => entry.loc)
      .filter(Boolean);
    return urls;
  }

  if (parsed.sitemapindex) {
    const sitemapUrls = normalizeArray(parsed.sitemapindex.sitemap)
      .map((entry) => entry.loc)
      .filter(Boolean);

    let nested = [];
    for (const childUrl of sitemapUrls) {
      const childItems = await getUrlsFromSitemap(childUrl, visited);
      nested = nested.concat(childItems);
    }
    return nested;
  }

  throw new Error(`Unsupported sitemap format at ${sitemapUrl}`);
}

module.exports = { getUrlsFromSitemap };
