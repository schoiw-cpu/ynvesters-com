import path from 'path';
import { mkdir } from 'fs/promises';
import { fileURLToPath } from 'url';

// Branded hero card generator — replaces Unsplash stock photos.
// Rationale: stock photos are reused by thousands of sites (zero originality —
// a factor in AdSense's "low value content" call), rarely match the topic, and
// carry attribution clutter. A rendered brand card costs $0 (local Chrome via
// Playwright), is 100% original, doubles as the OG share image (1200x630), and
// builds visual brand recognition across every post.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HERO_HTML = path.join(__dirname, '../brand/hero.html');
const IMAGES_DIR = path.join(__dirname, '../public/images');
const W = 1200, H = 630;

// "Writesonic Review 2026: I Tested the $20 Plan" →
//   highlight line: "Writesonic Review 2026", body line: "I Tested the $20 Plan"
function splitTitle(title) {
  const colon = title.split(/:\s+/);
  if (colon.length >= 2 && colon[0].length <= 60) {
    return { a: colon[0], b: colon.slice(1).join(': ') };
  }
  const dash = title.split(/\s+—\s+/);
  if (dash.length >= 2 && dash[0].length <= 60) {
    return { a: dash[0], b: dash.slice(1).join(' — ') };
  }
  return { a: title, b: '' };
}

export async function generateHero(title, slug, category = 'AI Tools') {
  let browser;
  try {
    const { chromium } = await import('playwright');
    await mkdir(IMAGES_DIR, { recursive: true });

    try {
      browser = await chromium.launch({ channel: 'chrome' }); // system Chrome — no download
    } catch {
      browser = await chromium.launch(); // fallback: playwright-managed chromium
    }

    const { a, b } = splitTitle(title);
    const params = new URLSearchParams({
      chip: `${category} · ${new Date().getFullYear()}`,
      a,
      b,
      sub: 'ynvesters.com · Hands-on AI tool verdicts',
    });

    const page = await browser.newPage({
      viewport: { width: W, height: H },
      deviceScaleFactor: 2,
    });
    await page.goto(`file://${HERO_HTML}?${params}`);
    await page.waitForTimeout(350); // font/render settle

    const outPath = path.join(IMAGES_DIR, `${slug}.png`);
    await page.screenshot({ path: outPath, clip: { x: 0, y: 0, width: W, height: H } });
    await browser.close();

    console.log(`[hero] Generated branded card: /images/${slug}.png`);
    return {
      localPath: `/images/${slug}.png`,
      alt: title,
      // no credit fields — self-generated, so the attribution caption is skipped
    };
  } catch (e) {
    if (browser) await browser.close().catch(() => {});
    console.warn(`[hero] Generation failed (${e.message}) — caller should fall back to stock photo.`);
    return null;
  }
}

// CLI: node scripts/generate-hero.mjs "Some Post Title: With a Subtitle"
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const title = process.argv[2] ?? 'Writesonic Review 2026: I Tested the $20 Plan So You Don\'t Have To';
  const result = await generateHero(title, 'hero-test');
  console.log(result);
}
