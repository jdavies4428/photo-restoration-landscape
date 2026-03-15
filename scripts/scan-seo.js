#!/usr/bin/env node
/**
 * scan-seo.js
 * Analyzes SEO terms and on-page optimization for competing photo restoration/AI photo apps.
 *
 * Usage:
 *   node scripts/scan-seo.js                          # Scan all competitors from data/competitors.json
 *   node scripts/scan-seo.js https://remini.ai/       # Scan specific URLs
 *   node scripts/scan-seo.js --help
 */

import https from 'node:https';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));

const TIMEOUT_MS = 15_000;

const SCAN_DATE = '2026-03-14';

/** All keyword terms to track, grouped into labeled clusters. */
const KEYWORD_TERMS = [
  'photo restoration',
  'restore photos',
  'old photos',
  'photo enhancement',
  'enhance',
  'upscale',
  'HD',
  'AI',
  'artificial intelligence',
  'machine learning',
  'scan',
  'scanning',
  'digitize',
  'colorize',
  'colorization',
  'black and white',
  'background removal',
  'remove background',
  'photo editing',
  'editor',
  'edit photos',
  'free',
  'trial',
  'premium',
  'pro',
  'download',
  'app',
  'face',
  'portrait',
  'selfie',
  'video',
  'animation',
  'e-commerce',
  'product photo',
  'family',
  'memories',
  'heritage',
];

const HELP_TEXT = `
scan-seo.js — Analyze SEO for competing photo restoration/AI photo apps

USAGE
  node scripts/scan-seo.js [OPTIONS] [URL ...]

OPTIONS
  --help    Show this help message and exit

ARGUMENTS
  URL       One or more competitor URLs to scan.
            If omitted, URLs are read from ../data/competitors.json.

EXAMPLES
  node scripts/scan-seo.js
  node scripts/scan-seo.js https://skylum.com/ https://remini.ai/
  node scripts/scan-seo.js | jq .
`.trim();

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

/**
 * Fetch a URL and return the response body as a string.
 * Follows up to 5 redirects. Times out after TIMEOUT_MS.
 *
 * @param {string} url
 * @param {number} [redirectsLeft=5]
 * @returns {Promise<string>}
 */
function fetchUrl(url, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const transport = parsed.protocol === 'https:' ? https : http;

    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; SEOScanner/1.0; +https://github.com/scan-seo)',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'identity',
        Connection: 'close',
      },
    };

    const req = transport.request(options, (res) => {
      // Follow redirects
      if (
        [301, 302, 303, 307, 308].includes(res.statusCode) &&
        res.headers.location &&
        redirectsLeft > 0
      ) {
        const next = new URL(res.headers.location, url).toString();
        res.resume(); // consume and discard body
        resolve(fetchUrl(next, redirectsLeft - 1));
        return;
      }

      if (res.statusCode < 200 || res.statusCode >= 400) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }

      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      res.on('error', reject);
    });

    req.on('error', reject);

    req.setTimeout(TIMEOUT_MS, () => {
      req.destroy(new Error(`Timeout after ${TIMEOUT_MS}ms for ${url}`));
    });

    req.end();
  });
}

// ---------------------------------------------------------------------------
// HTML parsing helpers (no external deps — pure regex)
// ---------------------------------------------------------------------------

/**
 * Extract the first match of a regex from html, returning captured group 1.
 * Returns empty string on no match.
 *
 * @param {string} html
 * @param {RegExp} re
 * @returns {string}
 */
function extract(html, re) {
  const m = re.exec(html);
  return m ? (m[1] ?? '').trim() : '';
}

/**
 * Extract all matches of a regex from html, returning captured group 1 per match.
 *
 * @param {string} html
 * @param {RegExp} re
 * @returns {string[]}
 */
function extractAll(html, re) {
  const results = [];
  let m;
  const globalRe = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
  while ((m = globalRe.exec(html)) !== null) {
    results.push((m[1] ?? '').trim());
  }
  return results;
}

/**
 * Decode common HTML entities in a string.
 *
 * @param {string} str
 * @returns {string}
 */
function decodeEntities(str) {
  return str
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

/**
 * Strip all HTML tags, collapse whitespace, and decode entities.
 *
 * @param {string} html
 * @returns {string}
 */
function stripTags(html) {
  return decodeEntities(html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')).trim();
}

// ---------------------------------------------------------------------------
// Meta tag extraction
// ---------------------------------------------------------------------------

/**
 * @param {string} html
 * @returns {object}
 */
function extractMeta(html) {
  // <title>
  const title = decodeEntities(extract(html, /<title[^>]*>([\s\S]*?)<\/title>/i));

  // <meta name="description" content="...">
  const description = decodeEntities(
    extract(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i) ||
    extract(html, /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i)
  );

  // <meta name="keywords" content="...">
  const keywords = decodeEntities(
    extract(html, /<meta[^>]+name=["']keywords["'][^>]+content=["']([^"']*)["']/i) ||
    extract(html, /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']keywords["']/i)
  );

  // Open Graph
  const ogTitle = decodeEntities(
    extract(html, /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["']/i) ||
    extract(html, /<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:title["']/i)
  );
  const ogDescription = decodeEntities(
    extract(html, /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)["']/i) ||
    extract(html, /<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:description["']/i)
  );
  const ogImage =
    extract(html, /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']*)["']/i) ||
    extract(html, /<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:image["']/i);

  // Twitter card
  const twitterCard =
    extract(html, /<meta[^>]+name=["']twitter:card["'][^>]+content=["']([^"']*)["']/i) ||
    extract(html, /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']twitter:card["']/i);
  const twitterTitle = decodeEntities(
    extract(html, /<meta[^>]+name=["']twitter:title["'][^>]+content=["']([^"']*)["']/i) ||
    extract(html, /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']twitter:title["']/i)
  );
  const twitterDescription = decodeEntities(
    extract(html, /<meta[^>]+name=["']twitter:description["'][^>]+content=["']([^"']*)["']/i) ||
    extract(html, /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']twitter:description["']/i)
  );

  // Canonical
  const canonical =
    extract(html, /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']*)["']/i) ||
    extract(html, /<link[^>]+href=["']([^"']*)["'][^>]+rel=["']canonical["']/i);

  // Robots
  const robots = decodeEntities(
    extract(html, /<meta[^>]+name=["']robots["'][^>]+content=["']([^"']*)["']/i) ||
    extract(html, /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']robots["']/i)
  );

  return {
    title,
    titleLength: title.length,
    description,
    descriptionLength: description.length,
    keywords: keywords || null,
    ogTitle: ogTitle || null,
    ogDescription: ogDescription || null,
    ogImage: ogImage || null,
    twitterCard: twitterCard || null,
    twitterTitle: twitterTitle || null,
    twitterDescription: twitterDescription || null,
    canonical: canonical || null,
    robots: robots || null,
  };
}

// ---------------------------------------------------------------------------
// Heading extraction
// ---------------------------------------------------------------------------

/**
 * @param {string} html
 * @returns {{ h1: string[], h2: string[], h3: string[], h3Count: number }}
 */
function extractHeadings(html) {
  const h1 = extractAll(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i).map(stripTags).filter(Boolean);
  const h2 = extractAll(html, /<h2[^>]*>([\s\S]*?)<\/h2>/i).map(stripTags).filter(Boolean);
  const h3All = extractAll(html, /<h3[^>]*>([\s\S]*?)<\/h3>/i).map(stripTags).filter(Boolean);

  return {
    h1,
    h1Count: h1.length,
    h2,
    h2Count: h2.length,
    h3: h3All.slice(0, 10),
    h3Count: h3All.length,
  };
}

// ---------------------------------------------------------------------------
// Keyword frequency analysis
// ---------------------------------------------------------------------------

/**
 * Count case-insensitive occurrences of each keyword term in text.
 *
 * @param {string} text  Plain text (tags already stripped)
 * @returns {Record<string, number>}
 */
function countKeywords(text) {
  const lower = text.toLowerCase();
  const result = {};
  for (const term of KEYWORD_TERMS) {
    const re = new RegExp(term.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    const matches = lower.match(re);
    result[term] = matches ? matches.length : 0;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Technical SEO signals
// ---------------------------------------------------------------------------

/**
 * @param {string} html
 * @param {string} baseUrl
 * @returns {object}
 */
function extractTechnicalSeo(html, baseUrl) {
  // JSON-LD schema blocks
  const schemaBlocks = extractAll(
    html,
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i
  );
  let schemaTypes = [];
  let hasSchema = false;
  const schemaObjects = [];
  for (const block of schemaBlocks) {
    try {
      const obj = JSON.parse(block.trim());
      hasSchema = true;
      const types = collectSchemaTypes(obj);
      schemaTypes.push(...types);
      // Capture key properties for the first few schema objects
      schemaObjects.push(summarizeSchema(obj));
    } catch {
      // Malformed JSON-LD — skip
    }
  }
  schemaTypes = [...new Set(schemaTypes)];

  // Hreflang
  const hreflangTags = extractAll(
    html,
    /<link[^>]+rel=["']alternate["'][^>]+hreflang=["']([^"']*)["']/i
  ).concat(
    extractAll(html, /<link[^>]+hreflang=["']([^"']*)["'][^>]+rel=["']alternate["']/i)
  );
  const hreflangLocales = [...new Set(hreflangTags.filter(Boolean))];

  // Mobile viewport
  const hasMobileViewport =
    /<meta[^>]+name=["']viewport["']/i.test(html);

  // Lazy loading hints
  const hasLazyLoading =
    /loading=["']lazy["']/i.test(html) ||
    /data-src=/i.test(html) ||
    /lazyload/i.test(html);

  // Image optimization hints (srcset, picture element, webp references)
  const hasImageOptimization =
    /srcset=/i.test(html) || /<picture/i.test(html) || /\.webp/i.test(html);

  // Links — count anchors with href
  const baseHost = new URL(baseUrl).hostname.replace(/^www\./, '');
  const allHrefs = extractAll(html, /<a[^>]+href=["']([^"'#][^"']*)["']/i);
  let internalLinks = 0;
  let externalLinks = 0;
  for (const href of allHrefs) {
    if (href.startsWith('http://') || href.startsWith('https://')) {
      try {
        const host = new URL(href).hostname.replace(/^www\./, '');
        if (host === baseHost || host.endsWith('.' + baseHost)) {
          internalLinks++;
        } else {
          externalLinks++;
        }
      } catch {
        // unparseable — treat as internal
        internalLinks++;
      }
    } else {
      // relative URL — internal
      internalLinks++;
    }
  }

  return {
    hasSchema,
    schemaTypes,
    schemaObjects: schemaObjects.slice(0, 5),
    hasHreflang: hreflangLocales.length > 0,
    hreflangLocales,
    hasMobileViewport,
    hasLazyLoading,
    hasImageOptimization,
    internalLinks,
    externalLinks,
  };
}

/**
 * Recursively collect all @type values from a JSON-LD object/array.
 *
 * @param {unknown} obj
 * @returns {string[]}
 */
function collectSchemaTypes(obj) {
  if (!obj || typeof obj !== 'object') return [];
  if (Array.isArray(obj)) return obj.flatMap(collectSchemaTypes);
  const types = [];
  if (obj['@type']) {
    const t = obj['@type'];
    if (Array.isArray(t)) types.push(...t);
    else types.push(t);
  }
  for (const val of Object.values(obj)) {
    types.push(...collectSchemaTypes(val));
  }
  return types;
}

/**
 * Extract a minimal summary of a JSON-LD object (type + name/description).
 *
 * @param {object} obj
 * @returns {object}
 */
function summarizeSchema(obj) {
  if (Array.isArray(obj)) return obj.map(summarizeSchema);
  const summary = {};
  for (const key of ['@type', 'name', 'description', 'url', '@id']) {
    if (obj[key] !== undefined) summary[key] = obj[key];
  }
  return summary;
}

// ---------------------------------------------------------------------------
// Full-page analysis
// ---------------------------------------------------------------------------

/**
 * Analyze a single competitor URL.
 *
 * @param {{ name: string, url: string }} competitor
 * @returns {Promise<object>}
 */
async function analyzeCompetitor({ name, url }) {
  let html;
  try {
    html = await fetchUrl(url);
  } catch (err) {
    return {
      name,
      url,
      error: err.message,
      meta: null,
      headings: null,
      keywordFrequency: null,
      technicalSeo: null,
    };
  }

  const meta = extractMeta(html);
  const headings = extractHeadings(html);
  const visibleText = stripTags(html);
  const keywordFrequency = countKeywords(visibleText);
  const technicalSeo = extractTechnicalSeo(html, url);

  return {
    name,
    url,
    meta,
    headings,
    keywordFrequency,
    technicalSeo,
  };
}

// ---------------------------------------------------------------------------
// Keyword matrix + opportunity analysis
// ---------------------------------------------------------------------------

/**
 * Build a keyword frequency matrix from analyzed competitors.
 *
 * @param {object[]} results  Array of competitor analysis objects (no errors)
 * @returns {Record<string, Record<string, number>>}
 */
function buildKeywordMatrix(results) {
  const matrix = {};
  for (const term of KEYWORD_TERMS) {
    matrix[term] = {};
    for (const r of results) {
      if (r.keywordFrequency) {
        matrix[term][r.name] = r.keywordFrequency[term] ?? 0;
      }
    }
  }
  return matrix;
}

/**
 * Identify unique keyword opportunities: terms used by only 1-2 competitors.
 *
 * @param {Record<string, Record<string, number>>} matrix
 * @returns {object[]}
 */
function findUniqueOpportunities(matrix) {
  const opportunities = [];
  for (const [term, scores] of Object.entries(matrix)) {
    const users = Object.entries(scores)
      .filter(([, count]) => count > 0)
      .map(([name]) => name);
    if (users.length === 1) {
      opportunities.push({
        keyword: term,
        usedBy: users,
        opportunity: 'Very low competition — only 1 competitor targets this term',
      });
    } else if (users.length === 2) {
      opportunities.push({
        keyword: term,
        usedBy: users,
        opportunity: 'Low competition in peer group — only 2 competitors target this term',
      });
    }
  }
  return opportunities;
}

/**
 * Compute keyword overlap: for each pair of competitors, count shared non-zero terms.
 *
 * @param {Record<string, Record<string, number>>} matrix
 * @returns {object[]}
 */
function computeKeywordOverlap(matrix) {
  // Collect names
  const names = [
    ...new Set(Object.values(matrix).flatMap((scores) => Object.keys(scores))),
  ];

  const overlap = {};
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const a = names[i];
      const b = names[j];
      let shared = 0;
      for (const scores of Object.values(matrix)) {
        if ((scores[a] ?? 0) > 0 && (scores[b] ?? 0) > 0) shared++;
      }
      overlap[`${a} / ${b}`] = shared;
    }
  }
  return Object.entries(overlap)
    .sort(([, a], [, b]) => b - a)
    .map(([pair, sharedKeywords]) => ({ pair, sharedKeywords }));
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);

  // --help
  if (args.includes('--help') || args.includes('-h')) {
    console.log(HELP_TEXT);
    process.exit(0);
  }

  // Determine competitor list
  let competitors;
  if (args.length > 0) {
    // URLs supplied as CLI args — derive names from hostname
    competitors = args.map((url) => {
      let name;
      try {
        name = new URL(url).hostname.replace(/^www\./, '').split('.')[0];
        name = name.charAt(0).toUpperCase() + name.slice(1);
      } catch {
        name = url;
      }
      return { name, url };
    });
  } else {
    // Load from data/competitors.json
    const jsonPath = resolve(__dirname, '../data/competitors.json');
    let raw;
    try {
      raw = readFileSync(jsonPath, 'utf8');
    } catch (err) {
      process.stderr.write(`Error reading competitors.json: ${err.message}\n`);
      process.exit(1);
    }
    const data = JSON.parse(raw);
    competitors = (data.competitors ?? []).map(({ name, url }) => ({ name, url }));
  }

  if (competitors.length === 0) {
    process.stderr.write('No competitor URLs to scan.\n');
    process.exit(1);
  }

  // Fetch and analyze all URLs in parallel
  process.stderr.write(
    `Scanning ${competitors.length} competitor(s) with ${TIMEOUT_MS / 1000}s timeout each...\n`
  );

  const settled = await Promise.allSettled(
    competitors.map((c) => analyzeCompetitor(c))
  );

  const results = settled.map((s, i) => {
    if (s.status === 'fulfilled') return s.value;
    return {
      name: competitors[i].name,
      url: competitors[i].url,
      error: s.reason?.message ?? String(s.reason),
      meta: null,
      headings: null,
      keywordFrequency: null,
      technicalSeo: null,
    };
  });

  const successful = results.filter((r) => !r.error);

  // Build matrix and opportunities from successful scans
  const keywordMatrix = buildKeywordMatrix(successful);
  const uniqueOpportunities = findUniqueOpportunities(keywordMatrix);
  const keywordOverlap = computeKeywordOverlap(keywordMatrix);

  const output = {
    scanDate: SCAN_DATE,
    competitorCount: results.length,
    successCount: successful.length,
    errorCount: results.length - successful.length,
    competitors: results,
    keywordMatrix,
    keywordOverlap,
    uniqueOpportunities,
  };

  process.stdout.write(JSON.stringify(output, null, 2) + '\n');

  // Log per-URL status to stderr so it doesn't pollute JSON stdout
  for (const r of results) {
    if (r.error) {
      process.stderr.write(`  [FAIL] ${r.name} (${r.url}): ${r.error}\n`);
    } else {
      process.stderr.write(`  [ OK ] ${r.name} (${r.url})\n`);
    }
  }
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${err.stack ?? err.message}\n`);
  process.exit(1);
});
