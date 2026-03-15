#!/usr/bin/env node
/**
 * scan-landing-pages.js
 *
 * Scans competitor landing pages and extracts CTAs, promotions, hooks,
 * trust signals, and pricing visibility.
 *
 * Usage:
 *   node scripts/scan-landing-pages.js                   # all competitors from data file
 *   node scripts/scan-landing-pages.js <url> [url...]    # specific URLs
 *   node scripts/scan-landing-pages.js > report.json     # pipe to file
 *   node scripts/scan-landing-pages.js --help
 */

import https from 'https';
import http from 'http';
import { readFileSync } from 'fs';
import { URL } from 'url';
import { fileURLToPath } from 'url';
import path from 'path';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TIMEOUT_MS = 15_000;

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
  'AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/122.0.0.0 Safari/537.36';

const CTA_KEYWORDS = [
  'download', 'try free', 'try it free', 'get started', 'start free',
  'sign up', 'sign up free', 'create account', 'create free account',
  'buy now', 'purchase', 'order now', 'add to cart',
  'start trial', 'free trial', 'start your trial',
  'get the app', 'get app', 'install', 'install free',
  'learn more', 'see plans', 'view pricing', 'get pricing',
  'request demo', 'book demo', 'watch demo',
  'start for free', 'try for free', 'get for free',
  'upgrade', 'go pro', 'go premium',
  'join now', 'join free', 'join today',
  'claim offer', 'claim discount', 'get offer',
  'restore now', 'restore photo', 'enhance now',
];

const DISCOUNT_PATTERNS = [
  /\b\d{1,3}\s*%\s*off\b/i,
  /\bsave\s+\d+%/i,
  /\b(deal|deals|offer|sale|promo|discount|coupon)\b/i,
  /\b(special|exclusive)\s+(price|offer|deal|discount)\b/i,
  /\b(limited[- ]time|time[- ]limited)\s+(offer|deal|discount|price)\b/i,
  /\bflash\s+sale\b/i,
  /\b(today\s+only|this\s+week\s+only)\b/i,
];

const URGENCY_PATTERNS = [
  /\bcountdown\b/i,
  /\btimer\b/i,
  /\bexpires?\s+(soon|today|in\s+\d)/i,
  /\blimited\s+(time|spots?|seats?|availability)\b/i,
  /\bhurry\b/i,
  /\bending\s+soon\b/i,
  /\blast\s+(chance|day|hours?)\b/i,
  /\bonly\s+\d+\s+(left|remaining|spots?|seats?)\b/i,
  /\bdon['']t\s+miss\b/i,
  /\bact\s+now\b/i,
];

const FREE_TRIAL_PATTERNS = [
  /\b(\d+)[- ]day\s+(free\s+)?trial\b/i,
  /\bfree\s+trial\b/i,
  /\btry\s+(it\s+)?free(\s+for\s+\d+\s+days?)?\b/i,
  /\bno\s+(credit\s+card|cc)\s+required\b/i,
  /\bno\s+commitment\b/i,
  /\bcancel\s+anytime\b/i,
];

const MONEY_BACK_PATTERNS = [
  /\b\d+[- ]day\s+money[- ]back\b/i,
  /\bmoney[- ]back\s+guarantee\b/i,
  /\bfull\s+refund\b/i,
  /\bsatisfaction\s+guarantee\b/i,
];

const SOCIAL_PROOF_PATTERNS = [
  /\b(\d[\d,.]*[MKB]?\+?)\s*(users?|customers?|people|downloads?|installs?|members?)\b/i,
  /\b(trusted\s+by|used\s+by|loved\s+by)\b/i,
  /\b(\d[\d,.]*)\s*(ratings?|reviews?|stars?)\b/i,
  /\b\d+\.?\d*\s*\/\s*5\b/i,
  /\b(trustpilot|g2|capterra|app\s+store|google\s+play)\b/i,
  /\b\d+\s*(million|billion|M\b|B\b)\+?\s*(users?|customers?|downloads?)\b/i,
];

const AUTHORITY_PATTERNS = [
  /\b(award|awarded|winner|winning)\b/i,
  /\bas\s+seen\s+in\b/i,
  /\bfeatured\s+(in|on|by)\b/i,
  /\b(editor['']s?\s+choice|editors?\s+pick)\b/i,
  /\b(press|media|coverage)\b/i,
  /\b(years?\s+in\s+business|years?\s+of\s+experience)\b/i,
  /\b(soc\s*2|iso\s*\d+|gdpr|hipaa)\b/i,
];

const TRUST_SIGNAL_PATTERNS = [
  /\b(secure|ssl|https|encrypted|encryption)\b/i,
  /\b(privacy|private|confidential)\b/i,
  /\b(certified|certification|compliance|compliant)\b/i,
  /\b(money[- ]back|guarantee|guaranteed)\b/i,
  /\b(trusted|verified|verified\s+by)\b/i,
  /\b(soc\s*2|iso\s*\d+|gdpr|hipaa|pci)\b/i,
  /\b(\d+\.?\d*\s*(?:\/\s*5|\s*stars?))\b/i,
  /\btrustp(?:ilot)?\b/i,
  /\bg2\s+(crowd|reviews?)\b/i,
];

const PRICING_PATTERNS = [
  /\$\d[\d,.]*\s*(?:\/\s*(?:mo|month|yr|year|annually))?\b/i,
  /\b(?:free|€\d|£\d|\d+\s*(?:usd|eur|gbp))\b/i,
  /\bper\s+(?:month|year|user)\b/i,
  /\bpricing\b/i,
  /\bplans?\b/i,
  /\bsubscription\b/i,
];

// ---------------------------------------------------------------------------
// Help text
// ---------------------------------------------------------------------------

const HELP = `
scan-landing-pages.js — Scan competitor landing pages for CTAs, promotions,
hooks, trust signals, and pricing visibility.

USAGE
  node scripts/scan-landing-pages.js [options] [url...]

OPTIONS
  --help      Show this help text and exit

ARGUMENTS
  url         One or more URLs to scan. If omitted, all URLs in
              ../data/competitors.json are scanned.

EXAMPLES
  # Scan all competitors from data file
  node scripts/scan-landing-pages.js

  # Scan specific URLs
  node scripts/scan-landing-pages.js https://skylum.com/ https://remini.ai/

  # Save output to a file
  node scripts/scan-landing-pages.js > landing-page-report.json
`.trim();

// ---------------------------------------------------------------------------
// HTTP fetch with timeout and redirect following
// ---------------------------------------------------------------------------

/**
 * Fetch a URL and return its body as a string.
 * Follows up to 5 redirects. Enforces a per-request timeout.
 *
 * @param {string} rawUrl
 * @param {number} [redirectsLeft=5]
 * @returns {Promise<{html: string, finalUrl: string, statusCode: number}>}
 */
function fetchUrl(rawUrl, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    let parsedUrl;
    try {
      parsedUrl = new URL(rawUrl);
    } catch {
      return reject(new Error(`Invalid URL: ${rawUrl}`));
    }

    const lib = parsedUrl.protocol === 'https:' ? https : http;

    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'GET',
      headers: {
        'User-Agent': USER_AGENT,
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'identity', // avoid gzip for simplicity
        Connection: 'close',
      },
    };

    const req = lib.request(options, (res) => {
      const { statusCode, headers } = res;

      // Follow redirects
      if (
        [301, 302, 303, 307, 308].includes(statusCode) &&
        headers.location &&
        redirectsLeft > 0
      ) {
        res.resume(); // discard body
        const redirectUrl = new URL(headers.location, rawUrl).toString();
        return resolve(fetchUrl(redirectUrl, redirectsLeft - 1));
      }

      const chunks = [];
      res.setEncoding('utf8');
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        resolve({
          html: chunks.join(''),
          finalUrl: rawUrl,
          statusCode,
        });
      });
      res.on('error', reject);
    });

    req.setTimeout(TIMEOUT_MS, () => {
      req.destroy(new Error(`Request timed out after ${TIMEOUT_MS}ms`));
    });

    req.on('error', reject);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// HTML utility helpers (no external parser — regex-based extraction)
// ---------------------------------------------------------------------------

/** Strip HTML tags from a string, collapsing whitespace. */
function stripTags(html) {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/** Extract the inner HTML of a tag (first match). */
function extractInnerHtml(html, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const m = html.match(re);
  return m ? m[1] : '';
}

/** Extract all attribute values matching attrName from tags matching tagPattern. */
function extractAttributes(html, tagPattern, attrName) {
  const results = [];
  const tagRe = new RegExp(`<${tagPattern}[^>]*>`, 'gi');
  let tagMatch;
  while ((tagMatch = tagRe.exec(html)) !== null) {
    const tag = tagMatch[0];
    const attrRe = new RegExp(`${attrName}\\s*=\\s*["']([^"']*)["']`, 'i');
    const attrMatch = tag.match(attrRe);
    if (attrMatch) results.push(attrMatch[1]);
  }
  return results;
}

/**
 * Find all anchor (<a>) and button elements along with their text and href.
 *
 * Returns an array of { tag, text, href, rawTag }.
 */
function extractClickables(html) {
  const results = [];

  // Anchors
  const aRe = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = aRe.exec(html)) !== null) {
    const attrs = m[1];
    const inner = m[2];
    const hrefMatch = attrs.match(/href\s*=\s*["']([^"']*)["']/i);
    const href = hrefMatch ? hrefMatch[1] : '';
    const text = stripTags(inner).trim();
    if (text) results.push({ tag: 'a', text, href, rawTag: m[0] });
  }

  // Buttons (standalone, not inside <a>)
  const btnRe = /<button\b([^>]*)>([\s\S]*?)<\/button>/gi;
  while ((m = btnRe.exec(html)) !== null) {
    const inner = m[2];
    const text = stripTags(inner).trim();
    if (text) results.push({ tag: 'button', text, href: '', rawTag: m[0] });
  }

  // Input[type=submit]
  const inputRe = /<input\b([^>]*)\/?>/gi;
  while ((m = inputRe.exec(html)) !== null) {
    const attrs = m[1];
    const typeMatch = attrs.match(/type\s*=\s*["'](submit|button)["']/i);
    if (!typeMatch) continue;
    const valMatch = attrs.match(/value\s*=\s*["']([^"']*)["']/i);
    const text = valMatch ? valMatch[1].trim() : '';
    if (text) results.push({ tag: 'input', text, href: '', rawTag: m[0] });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Position detection helpers
// ---------------------------------------------------------------------------

/**
 * Determine the rough section of the page a raw HTML snippet appears in.
 * We walk the full page HTML and look at what structural landmark wraps it.
 *
 * Strategy: find the character offset of the element in the full HTML, then
 * scan backwards for the nearest opening landmark tag.
 *
 * @param {string} fullHtml
 * @param {string} rawElement   The raw HTML string of the element (e.g. '<a href…>…</a>')
 * @returns {'header'|'hero'|'nav'|'footer'|'pricing'|'cta'|'body'}
 */
function detectPosition(fullHtml, rawElement) {
  const idx = fullHtml.indexOf(rawElement);
  if (idx === -1) return 'body';

  // Look at the 3,000 characters of context before this element
  const context = fullHtml.slice(Math.max(0, idx - 3000), idx).toLowerCase();

  // Order matters — check most specific last so they override
  if (/(<footer|role\s*=\s*["']contentinfo["']|id\s*=\s*["'][^"']*footer[^"']*["']|class\s*=\s*["'][^"']*footer[^"']*["'])/.test(context)) return 'footer';
  if (/(<header|role\s*=\s*["']banner["']|id\s*=\s*["'][^"']*header[^"']*["']|class\s*=\s*["'][^"']*header[^"']*["'])/.test(context)) return 'header';
  if (/(<nav\b|role\s*=\s*["']navigation["'])/.test(context)) return 'nav';
  if (/(id\s*=\s*["'][^"']*pric[^"']*["']|class\s*=\s*["'][^"']*pric[^"']*["'])/.test(context)) return 'pricing';
  if (/(id\s*=\s*["'][^"']*hero[^"']*["']|class\s*=\s*["'][^"']*hero[^"']*["']|id\s*=\s*["'][^"']*banner[^"']*["']|class\s*=\s*["'][^"']*banner[^"']*["'])/.test(context)) return 'hero';
  if (/(id\s*=\s*["'][^"']*cta[^"']*["']|class\s*=\s*["'][^"']*cta[^"']*["'])/.test(context)) return 'cta';

  // Fallback: if it's in the first 20% of the document it's probably hero
  if (idx < fullHtml.length * 0.2) return 'hero';

  return 'body';
}

// ---------------------------------------------------------------------------
// Extraction logic
// ---------------------------------------------------------------------------

/**
 * Determine if a text string looks like a CTA.
 */
function isCTAText(text) {
  const lower = text.toLowerCase().trim();
  // Skip very long strings — they're probably paragraph text
  if (lower.length > 60) return false;
  // Skip pure navigation items that are too generic without action verbs
  return CTA_KEYWORDS.some((kw) => lower.includes(kw));
}

/**
 * Extract CTAs from HTML.
 *
 * @param {string} html
 * @returns {Array<{text: string, href: string, position: string, type: string}>}
 */
function extractCTAs(html) {
  const clickables = extractClickables(html);
  const seen = new Set();
  const ctas = [];

  for (const item of clickables) {
    if (!isCTAText(item.text)) continue;
    const key = `${item.text.toLowerCase()}::${item.href}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const position = detectPosition(html, item.rawTag);
    ctas.push({
      text: item.text,
      href: item.href || null,
      position,
      type: 'secondary', // will be upgraded below
    });
  }

  // Heuristic: the first hero/header CTA is the primary one
  const primaryIdx = ctas.findIndex(
    (c) => c.position === 'hero' || c.position === 'header'
  );
  if (primaryIdx !== -1) ctas[primaryIdx].type = 'primary';
  else if (ctas.length > 0) ctas[0].type = 'primary';

  return ctas;
}

/**
 * Extract promotions from the visible text of the page.
 */
function extractPromotions(text) {
  const promotions = [];
  const sentences = text.split(/[.!?\n]+/).map((s) => s.trim()).filter(Boolean);

  for (const sentence of sentences) {
    if (sentence.length > 200) continue;

    let matched = false;

    for (const pattern of DISCOUNT_PATTERNS) {
      if (pattern.test(sentence)) {
        const urgency = URGENCY_PATTERNS.some((p) => p.test(sentence));
        promotions.push({ text: sentence, type: 'discount', urgency });
        matched = true;
        break;
      }
    }
    if (matched) continue;

    for (const pattern of FREE_TRIAL_PATTERNS) {
      if (pattern.test(sentence)) {
        promotions.push({ text: sentence, type: 'free_trial', urgency: false });
        matched = true;
        break;
      }
    }
    if (matched) continue;

    for (const pattern of MONEY_BACK_PATTERNS) {
      if (pattern.test(sentence)) {
        promotions.push({ text: sentence, type: 'money_back', urgency: false });
        break;
      }
    }
  }

  // Deduplicate by text
  const seen = new Set();
  return promotions.filter((p) => {
    if (seen.has(p.text)) return false;
    seen.add(p.text);
    return true;
  });
}

/**
 * Extract hook signals: hero headline/subheadline, social proof, authority, urgency.
 */
function extractHooks(html, text) {
  const hooks = {
    heroHeadline: null,
    heroSubheadline: null,
    socialProof: [],
    authoritySignals: [],
    urgencyTriggers: [],
  };

  // Hero headline — look for <h1> inside a hero/banner section, fall back to first <h1>
  const heroSection = (() => {
    const heroRe = /(<(?:section|div|header)[^>]*(?:hero|banner|jumbotron)[^>]*>)([\s\S]*?)(<\/(?:section|div|header)>)/i;
    const m = html.match(heroRe);
    return m ? m[2] : html;
  })();

  const h1Match = heroSection.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1Match) hooks.heroHeadline = stripTags(h1Match[1]).trim() || null;

  // Fallback to first h1 in full doc
  if (!hooks.heroHeadline) {
    const anyH1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    if (anyH1) hooks.heroHeadline = stripTags(anyH1[1]).trim() || null;
  }

  // Hero subheadline — <h2> or <p> after the first <h1>
  const afterH1 = hooks.heroHeadline
    ? html.slice(html.indexOf(h1Match ? h1Match[0] : '') + 1)
    : html;

  const subMatch =
    afterH1.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i) ||
    afterH1.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
  if (subMatch) {
    const sub = stripTags(subMatch[1]).trim();
    if (sub && sub.length < 300) hooks.heroSubheadline = sub;
  }

  // Social proof — scan sentences
  const sentences = text.split(/[.!?\n]+/).map((s) => s.trim()).filter(Boolean);
  for (const s of sentences) {
    if (s.length > 150) continue;
    if (SOCIAL_PROOF_PATTERNS.some((p) => p.test(s))) {
      hooks.socialProof.push(s);
    }
  }
  hooks.socialProof = [...new Set(hooks.socialProof)].slice(0, 8);

  // Authority signals
  for (const s of sentences) {
    if (s.length > 150) continue;
    if (AUTHORITY_PATTERNS.some((p) => p.test(s))) {
      hooks.authoritySignals.push(s);
    }
  }
  hooks.authoritySignals = [...new Set(hooks.authoritySignals)].slice(0, 8);

  // Urgency triggers
  for (const s of sentences) {
    if (s.length > 150) continue;
    if (URGENCY_PATTERNS.some((p) => p.test(s))) {
      hooks.urgencyTriggers.push(s);
    }
  }
  hooks.urgencyTriggers = [...new Set(hooks.urgencyTriggers)].slice(0, 5);

  return hooks;
}

/**
 * Extract trust signals from visible text.
 */
function extractTrustSignals(text) {
  const signals = [];
  const sentences = text.split(/[.!?\n]+/).map((s) => s.trim()).filter(Boolean);

  for (const s of sentences) {
    if (s.length > 150) continue;
    if (TRUST_SIGNAL_PATTERNS.some((p) => p.test(s))) {
      signals.push(s);
    }
  }

  return [...new Set(signals)].slice(0, 10);
}

/**
 * Determine pricing visibility from the page.
 *
 * Returns one of:
 *   "visible on page"        — prices shown directly
 *   "linked (not on page)"  — pricing link exists but no prices shown inline
 *   "not found"              — no pricing indication
 */
function extractPricingVisibility(html, text) {
  const hasPriceNumbers = /\$\d[\d,.]*/.test(text) || /€\d[\d,.]*/.test(text) || /£\d[\d,.]*/.test(text);

  if (hasPriceNumbers) return 'visible on page';

  // Check for pricing links
  const clickables = extractClickables(html);
  const hasPricingLink = clickables.some((c) => {
    const lower = (c.text + ' ' + (c.href || '')).toLowerCase();
    return lower.includes('pric') || lower.includes('plan') || lower.includes('subscription');
  });

  if (hasPricingLink) return 'linked (not on page)';

  const hasPricingMention = PRICING_PATTERNS.some((p) => p.test(text));
  if (hasPricingMention) return 'mentioned but not shown';

  return 'not found';
}

// ---------------------------------------------------------------------------
// Per-URL scanner
// ---------------------------------------------------------------------------

/**
 * Scan a single URL and return a structured result object.
 *
 * @param {{name: string, url: string}} target
 * @returns {Promise<object>}
 */
async function scanUrl(target) {
  const { name, url } = target;
  const base = {
    name,
    url,
    status: 'error',
    error: null,
    ctas: [],
    promotions: [],
    hooks: {},
    trustSignals: [],
    pricingVisibility: 'not found',
  };

  try {
    const { html, statusCode } = await fetchUrl(url);

    if (statusCode >= 400) {
      base.error = `HTTP ${statusCode}`;
      return base;
    }

    // Strip scripts and style blocks before text extraction
    const cleanedHtml = html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '');

    const visibleText = stripTags(cleanedHtml);

    return {
      ...base,
      status: 'success',
      ctas: extractCTAs(cleanedHtml),
      promotions: extractPromotions(visibleText),
      hooks: extractHooks(cleanedHtml, visibleText),
      trustSignals: extractTrustSignals(visibleText),
      pricingVisibility: extractPricingVisibility(cleanedHtml, visibleText),
    };
  } catch (err) {
    base.error = err.message;
    return base;
  }
}

// ---------------------------------------------------------------------------
// Load targets
// ---------------------------------------------------------------------------

/**
 * Resolve the path to competitors.json relative to this script.
 */
function resolveCompetitorsPath() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  return path.resolve(__dirname, '../data/competitors.json');
}

/**
 * Load competitor targets from the data file.
 */
function loadCompetitors() {
  const filePath = resolveCompetitorsPath();
  try {
    const raw = readFileSync(filePath, 'utf8');
    const data = JSON.parse(raw);
    return (data.competitors || []).map((c) => ({ name: c.name, url: c.url }));
  } catch (err) {
    throw new Error(`Failed to load competitors.json: ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    process.stdout.write(HELP + '\n');
    process.exit(0);
  }

  // Build target list
  let targets;

  const urlArgs = args.filter((a) => !a.startsWith('--'));
  if (urlArgs.length > 0) {
    targets = urlArgs.map((url) => {
      try {
        const parsed = new URL(url);
        return { name: parsed.hostname, url };
      } catch {
        process.stderr.write(`Warning: skipping invalid URL: ${url}\n`);
        return null;
      }
    }).filter(Boolean);
  } else {
    targets = loadCompetitors();
  }

  if (targets.length === 0) {
    process.stderr.write('Error: no targets to scan.\n');
    process.exit(1);
  }

  process.stderr.write(
    `Scanning ${targets.length} URL(s) in parallel (timeout: ${TIMEOUT_MS / 1000}s each)...\n`
  );

  // Fetch all in parallel, never reject (errors captured per-result)
  const settled = await Promise.allSettled(targets.map((t) => scanUrl(t)));

  const results = settled.map((outcome, i) => {
    if (outcome.status === 'fulfilled') return outcome.value;
    // Promise itself rejected (should not happen given our try/catch, but just in case)
    return {
      name: targets[i].name,
      url: targets[i].url,
      status: 'error',
      error: outcome.reason?.message || String(outcome.reason),
      ctas: [],
      promotions: [],
      hooks: {},
      trustSignals: [],
      pricingVisibility: 'not found',
    };
  });

  const successCount = results.filter((r) => r.status === 'success').length;
  const errorCount = results.length - successCount;
  process.stderr.write(
    `Done. ${successCount} succeeded, ${errorCount} failed.\n`
  );

  const output = {
    scanDate: new Date().toISOString().split('T')[0],
    results,
  };

  process.stdout.write(JSON.stringify(output, null, 2) + '\n');
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${err.message}\n`);
  process.exit(1);
});
