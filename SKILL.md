---
name: Photo Restoration Landscape
description: >
  Competitive intelligence across 8 AI photo restoration/enhancement companies.
  Tracks pricing, features, CTAs, SEO terms, and monitors landing page changes.
  Interactive analysis with dashboards, landing page scanning, and SEO comparison.
allowed-tools:
  - AskUserQuestion
  - Bash
  - WebFetch
  - Read
  - Write
---

# Photo Restoration Landscape — Competitive Intelligence

Last updated: 2026-03-14

## Competitors Tracked

| # | Company | Category | URL |
|---|---------|----------|-----|
| 1 | Skylum | Desktop Photo Editor | https://skylum.com/ |
| 2 | Dzine | AI Design Tool | https://www.dzine.ai/ |
| 3 | Lift | AI Photo Editor | https://liftapp.ai/ |
| 4 | Renew | Photo Restoration | https://renew-photo.com/ |
| 5 | Photomyne | Photo Scanning & Archival | https://photomyne.com/ |
| 6 | Photoroom | Product Photography | https://www.photoroom.com/ |
| 7 | Remini | Photo Enhancement | https://remini.ai/ |
| 8 | Picsart | All-in-One Creative | https://picsart.com/ |

---

## Entry Point

When this skill is invoked, ask the user what they want to do:

```
AskUserQuestion:
  Question: "What would you like to explore?"
  Header: "Analysis"
  Options:
    A) Full competitive overview — Open the interactive dashboard with all 8 competitors
    B) Compare specific competitors — Side-by-side deep dive on 2-3 companies
    C) Scan landing pages — Run the CTA/promotion/hooks scanner on all competitor sites
    D) SEO analysis — Analyze keyword targeting and on-page SEO across the peer group
```

---

## Option A: Full Competitive Overview

Open the dashboard:
```bash
open /Users/jeffdai/ClaudeSkills/source-skill/output/photo-restoration-landscape/dashboard.html
```

Then offer follow-up analysis:
```
AskUserQuestion:
  Question: "What dimension do you want to dig into?"
  Header: "Deep dive"
  Options:
    A) Pricing strategy — Compare pricing models, tiers, annual costs, free tier strategies
    B) Feature gaps — Which features does only 1-2 competitors offer? Where are the opportunities?
    C) Market positioning — How each company positions itself, target audience, messaging
    D) AI capabilities — Compare AI feature depth across all 8 products
```

### Pricing Analysis

Read competitor data and present:
```bash
cat /Users/jeffdai/ClaudeSkills/source-skill/output/photo-restoration-landscape/data/competitors.json | node -e "
  const data = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  data.competitors.forEach(c => {
    console.log(\`\${c.name}: \${c.pricing.model} — \${c.pricing.plans.map(p => p.name + ': ' + p.price).join(', ')}\`);
  });
"
```

Key insights to surface:
- **Cheapest entry**: Renew at $9.99 one-time
- **Most expensive**: Picsart Ultra at $210/yr
- **Perpetual vs subscription**: Skylum is the only perpetual license
- **Free tier leaders**: Picsart, Photoroom, Lift, Remini all have free tiers
- **No free tier**: Skylum (trial only), Photomyne (3-day trial only)

### Feature Gap Analysis

Cross-reference the feature matrix from competitors.json. Highlight:
- Features only 1 competitor has (e.g., photo scanning → Photomyne only)
- Features most competitors share (e.g., background removal → 6/8 have it)
- Emerging features with low adoption (e.g., video generation → only Picsart, Remini)

---

## Option B: Compare Specific Competitors

```
AskUserQuestion:
  Question: "Which competitors do you want to compare? (select 2-3)"
  Header: "Competitors"
  multiSelect: true
  Options:
    A) Skylum — Desktop photo editor, perpetual license
    B) Dzine — AI design tool, web-only
    C) Lift — AI photo editor, 13M+ downloads
    D) Renew — Photo restoration, $9.99 one-time
```

Then ask:
```
AskUserQuestion:
  Question: "Any more to add?"
  Options:
    A) Photomyne — Photo scanning, $59.99/yr
    B) Photoroom — Product photography, 300M+ downloads
    C) Remini — Photo enhancement, 100M MAU
    D) Picsart — All-in-one creative, 150M+ creators
```

For the selected competitors, generate a side-by-side comparison:
1. Read their data from competitors.json
2. Create a markdown comparison table
3. Highlight key differences and similarities
4. Identify competitive advantages of each

---

## Option C: Landing Page Scanner

Run the landing page scanner to get fresh CTA, promotion, and hooks data:

```bash
node /Users/jeffdai/ClaudeSkills/source-skill/output/photo-restoration-landscape/scripts/scan-landing-pages.js
```

This scans all 8 competitor landing pages and extracts:
- **CTAs**: Button text, placement, primary vs secondary
- **Promotions**: Discounts, limited-time offers, free trials
- **Hooks**: Hero headlines, social proof, authority signals, urgency triggers
- **Trust signals**: Certifications, review scores, customer logos
- **Pricing visibility**: On-page vs behind click

After the scan, present findings and ask:
```
AskUserQuestion:
  Question: "What do you want to focus on?"
  Header: "Landing page"
  Options:
    A) CTA comparison — What's working? Which CTAs are most aggressive/effective?
    B) Promotion tracking — Who's running discounts? What urgency tactics are used?
    C) Social proof audit — How does each competitor build trust?
    D) Full report — Show everything in a structured table
```

---

## Option D: SEO Analysis

Run the SEO scanner:

```bash
node /Users/jeffdai/ClaudeSkills/source-skill/output/photo-restoration-landscape/scripts/scan-seo.js
```

This analyzes on-page SEO across all competitors:
- **Meta tags**: Title, description, OG tags
- **Heading structure**: H1/H2/H3 hierarchy
- **Keyword frequency**: Which terms each competitor targets
- **Technical SEO**: Schema.org, hreflang, mobile viewport
- **Keyword matrix**: Overlap and unique opportunities

After the scan, present the keyword matrix and ask:
```
AskUserQuestion:
  Question: "What SEO dimension interests you?"
  Header: "SEO focus"
  Options:
    A) Keyword opportunities — Terms with low competition in this peer group
    B) Content gaps — Topics competitors cover that others don't
    C) Technical SEO audit — Schema, hreflang, structured data comparison
    D) Meta tag comparison — Title/description optimization across all 8
```

---

## Refresh & Monitoring

### Check for changes
```bash
node /Users/jeffdai/ClaudeSkills/source-skill/scripts/monitor.js --skill-dir /Users/jeffdai/ClaudeSkills/source-skill/output/photo-restoration-landscape
```

### Full refresh (re-scan all competitors)
```bash
# Re-scan landing pages
node scripts/scan-landing-pages.js > /tmp/landing-page-scan-$(date +%Y%m%d).json

# Re-scan SEO
node scripts/scan-seo.js > /tmp/seo-scan-$(date +%Y%m%d).json
```

### What triggers a refresh
- Any competitor changes their landing page (detected via content hash)
- Pricing changes
- New features announced
- New competitors enter the space

---

## Data Files

| File | Purpose |
|------|---------|
| `data/competitors.json` | Structured competitor data (features, pricing, metrics) |
| `dashboard.html` | Interactive Chart.js dashboard |
| `scripts/scan-landing-pages.js` | CTA/promotion/hooks scanner |
| `scripts/scan-seo.js` | SEO keyword and on-page analysis |
| `.source-state.json` | Monitor state for change detection |
