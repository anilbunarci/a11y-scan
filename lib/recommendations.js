/**
 * Curated actionable recommendations keyed by Lighthouse audit ID or pa11y
 * WCAG rule code prefix. Lookup order in the renderer:
 *   1. Exact match on audit id
 *   2. pa11y prefix match (first two segments of the dot-separated code)
 *   3. Fallback to first prose sentence from Lighthouse description field
 */

const RECOMMENDATIONS = {
  // ─── Performance ────────────────────────────────────────────────────────────
  "first-contentful-paint":
    "Reduce server response times, eliminate render-blocking resources, and inline critical CSS to paint content sooner.",
  "largest-contentful-paint":
    "Optimise and preload the hero image or largest text block; eliminate render-blocking resources above the fold.",
  "total-blocking-time":
    "Break up long JavaScript tasks into smaller chunks and defer non-critical scripts to unblock the main thread.",
  "cumulative-layout-shift":
    "Set explicit width and height on images and embeds, and avoid inserting content above existing page content.",
  "speed-index":
    "Prioritise above-the-fold content, defer below-the-fold resources, and minimise main-thread work.",
  interactive:
    "Reduce JavaScript execution time and defer non-critical scripts to reach interactivity faster.",
  "unused-javascript":
    "Remove unused code and apply code splitting so only the JavaScript needed for the current page is loaded.",
  "unused-css-rules":
    "Remove unused CSS rules and defer styles not needed for above-the-fold content.",
  "total-byte-weight":
    "Compress images, minify CSS/JS, and remove unused dependencies to reduce total page weight.",
  "render-blocking-resources":
    "Inline critical CSS, defer non-critical stylesheets, and add `async`/`defer` to non-critical scripts.",
  "uses-optimized-images":
    "Compress and convert images to modern formats (WebP/AVIF) to reduce file size without quality loss.",
  "uses-responsive-images":
    "Serve appropriately sized images using `srcset` and `sizes` attributes to avoid over-large downloads on small screens.",
  "uses-text-compression":
    "Enable gzip or Brotli compression on your server for text-based assets (HTML, CSS, JS).",
  "uses-long-cache-ttl":
    "Set long `Cache-Control` max-age headers on static assets and use content-hashed filenames for cache-busting.",
  "efficient-animated-content":
    "Replace animated GIFs with looping video (MP4/WebM) to significantly reduce file size.",
  "offscreen-images":
    'Lazy-load images below the fold using the `loading="lazy"` attribute or an Intersection Observer.',
  "duplicated-javascript":
    "Audit your bundle for duplicated modules and deduplicate via your bundler's configuration.",
  "legacy-javascript":
    "Configure Babel/TypeScript to target modern browsers only and remove unnecessary polyfills.",
  "uses-passive-event-listeners":
    "Mark scroll and touch event listeners as `{ passive: true }` to allow the browser to optimise scrolling.",
  "no-document-write":
    "Replace `document.write()` calls with DOM manipulation methods to avoid blocking the parser.",
  "uses-rel-preconnect":
    'Add `<link rel="preconnect">` for third-party origins (fonts, analytics, CDN) to reduce connection latency.',
  "uses-rel-preload":
    'Use `<link rel="preload">` for critical assets (hero image, key font) to start loading them earlier.',
  "font-display":
    "Add `font-display: swap` (or `optional`) in your `@font-face` declarations so text is visible while fonts load.",
  "server-response-time":
    "Investigate slow server response times; consider caching, a CDN, or infrastructure upgrades.",
  redirects:
    "Eliminate unnecessary redirect chains; update internal links to point directly to the final URL.",
  "preload-lcp-image":
    'Add a `<link rel="preload" as="image">` tag for the largest contentful image to fetch it earlier.',
  "prioritize-lcp-image":
    "Ensure the LCP image is not lazy-loaded and is included in the initial HTML response.",
  "lcp-lazy-loaded":
    'Remove `loading="lazy"` from the LCP image — it delays the most important paint on the page.',
  "network-requests":
    "Audit and consolidate third-party requests; remove tracking scripts and widgets that are not essential.",
  "network-rtt":
    "Serve static assets from a CDN geographically close to your users to reduce round-trip time.",
  "mainthread-work-breakdown":
    "Profile JavaScript execution in DevTools and break up long tasks that block the main thread.",
  "bootup-time":
    "Reduce the amount of JavaScript parsed and executed on page load; defer or remove non-critical scripts.",
  "third-party-summary":
    "Audit third-party scripts and remove or defer those that are not essential to the page's core functionality.",

  // ─── Accessibility ──────────────────────────────────────────────────────────
  "color-contrast":
    "Increase text-to-background contrast ratio to at least 4.5:1 for normal text and 3:1 for large text.",
  "image-alt":
    'Add descriptive `alt` text to all meaningful images; use `alt=""` for purely decorative images.',
  label:
    "Associate every form input with a visible `<label>` element using the `for`/`id` pairing or `aria-label`.",
  "button-name":
    "Give every `<button>` a discernible name via visible text content, `aria-label`, or `aria-labelledby`.",
  "link-name":
    "Ensure every link has descriptive text; avoid generic labels like 'click here' or 'read more'.",
  "heading-order":
    "Use heading levels sequentially (h1 → h2 → h3) without skipping levels to preserve document structure.",
  "duplicate-id-active":
    "Make all `id` attributes on interactive elements unique within the page.",
  "duplicate-id-aria":
    "Make all `id` attributes referenced by ARIA attributes unique within the page.",
  "aria-required-attr":
    'Add all required ARIA attributes to elements using ARIA roles (e.g. `aria-valuenow` on `role="slider"`).',
  "aria-allowed-attr":
    "Remove ARIA attributes that are not permitted for the element's role.",
  "aria-valid-attr-value":
    "Correct invalid ARIA attribute values to match the values permitted by the ARIA specification.",
  "aria-dialog-name":
    'Give every `role="dialog"` and `role="alertdialog"` element an accessible name via `aria-label` or `aria-labelledby`.',
  "aria-hidden-focus":
    'Ensure focusable elements are not hidden from assistive technology with `aria-hidden="true"`.',
  "focus-traps":
    "Ensure keyboard focus is not trapped inside a component unless intentional (e.g. a modal dialog).",
  "focusable-controls":
    "Ensure custom interactive controls are reachable and operable with the keyboard.",
  "interactive-element-affordance":
    "Style interactive elements so they are visually distinguishable as clickable/focusable.",
  "logical-tab-order":
    "Ensure the DOM order matches the visual order so the tab sequence is logical and predictable.",
  "skip-link":
    "Add a 'Skip to main content' link as the first focusable element to let keyboard users bypass navigation.",
  "td-headers-attr":
    "Ensure all `<td>` cells in a complex table reference valid `<th>` header cells with `headers` attributes.",
  "th-has-data-cells":
    "Ensure every `<th>` header cell has associated data cells so its purpose is clear to screen readers.",
  "valid-lang":
    "Set a valid BCP 47 language code on the `<html lang>` attribute and any inline language changes.",
  "html-has-lang":
    "Add a `lang` attribute to the `<html>` element to help screen readers use the correct language profile.",
  "document-title":
    "Add a unique, descriptive `<title>` element to every page so users know where they are.",
  "meta-viewport":
    "Remove `user-scalable=no` from the viewport meta tag to allow users to zoom the page.",
  "video-caption":
    "Add captions to all video content so it is accessible to users who are deaf or hard of hearing.",
  "audio-caption": "Provide a transcript or captions for all audio content.",
  "object-alt":
    "Provide alternative text for `<object>` elements using the `aria-label` attribute or fallback body content.",

  // ─── Best Practices ─────────────────────────────────────────────────────────
  "no-vulnerable-libraries":
    "Update front-end libraries with known vulnerabilities to their latest patched versions.",
  "csp-xss":
    "Implement a strict Content Security Policy header to reduce the risk of cross-site scripting attacks.",
  "is-on-https":
    "Migrate the site to HTTPS and set up HTTP → HTTPS redirects to ensure secure connections.",
  "uses-http2":
    "Serve assets over HTTP/2 or HTTP/3 to benefit from multiplexing and header compression.",
  "no-unload-listeners":
    "Replace `unload` event listeners with `pagehide` or `visibilitychange` to allow bfcache optimisation.",
  "inspector-issues":
    "Review and resolve issues flagged in the Chrome DevTools Issues panel (e.g. deprecated APIs, cookie problems).",
  "js-libraries":
    "Audit included JavaScript libraries; remove those that are unused or can be replaced with native browser APIs.",
  charset:
    'Declare the character encoding early in the `<head>` with `<meta charset="utf-8">`.',
  doctype:
    "Add `<!DOCTYPE html>` at the very start of every HTML document to prevent quirks mode rendering.",
  "errors-in-console":
    "Investigate and resolve JavaScript console errors; they may indicate broken functionality.",
  "image-aspect-ratio":
    "Set explicit `width` and `height` attributes or use CSS `aspect-ratio` to prevent layout shifts.",
  "image-size-responsive":
    "Ensure image display size matches the intrinsic size to avoid blurry images on high-DPI screens.",

  // ─── SEO ───────────────────────────────────────────────────────────────────
  "meta-description":
    'Add a unique, descriptive `<meta name="description">` to every page to improve search result snippets.',
  "http-status-code":
    "Ensure all pages return a 200 OK status; fix broken pages returning 4xx/5xx codes.",
  "link-text":
    "Use descriptive anchor text for links instead of generic phrases like 'click here' or 'learn more'.",
  "crawlable-anchors":
    "Ensure links use standard `<a href>` elements so search engines can follow them.",
  "is-crawlable":
    "Remove `noindex` directives from pages that should be indexed by search engines.",
  "robots-txt":
    "Ensure the `robots.txt` file is valid and does not accidentally block important pages.",
  "tap-targets":
    "Increase the size and spacing of tap targets to at least 48×48 px to improve usability on touch screens.",
  hreflang:
    "Add correct `hreflang` link elements to multilingual pages so search engines serve the right language variant.",
  canonical:
    'Add a `<link rel="canonical">` element to specify the preferred URL and prevent duplicate content issues.',
  plugins:
    "Remove reliance on browser plugins (Flash, Java applets) which are not supported by modern browsers.",
  "font-size":
    "Set a base font size of at least 12 px and use relative units so text scales correctly on all devices.",
};

/**
 * Returns a curated recommendation string for a given issue id, or null if
 * no curated entry exists.
 *
 * @param {string} id - Lighthouse audit id or pa11y rule code
 * @returns {string|null}
 */
export function getRecommendation(id) {
  if (!id) return null;

  // Exact match first
  if (RECOMMENDATIONS[id]) return RECOMMENDATIONS[id];

  // pa11y rule codes are dot-separated (e.g. WCAG2AA.Principle1.Guideline1_4.1_4_3.G18.Fail)
  // Try the first two segments as a prefix key
  const parts = id.split(".");
  if (parts.length >= 2) {
    const prefix = `${parts[0]}.${parts[1]}`;
    if (RECOMMENDATIONS[prefix]) return RECOMMENDATIONS[prefix];
  }

  return null;
}
