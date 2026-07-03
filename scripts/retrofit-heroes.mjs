import path from 'path';
import { readdir, readFile, writeFile, mkdir } from 'fs/promises';
import { fileURLToPath } from 'url';
import matter from 'gray-matter';

// One-off batch: replace Unsplash stock heroes on existing posts with branded
// cards. Stock photos are reused by thousands of sites (an originality problem
// AdSense flagged) — branded cards are 100% original and visually consistent.
// Skips noindexed (soft-retired) posts. Reuses one browser for all renders.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const POSTS_DIR = path.join(__dirname, '../src/content/posts');
const HERO_HTML = path.join(__dirname, '../brand/hero.html');
const IMAGES_DIR = path.join(__dirname, '../public/images');
const W = 1200, H = 630;

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

const { chromium } = await import('playwright');
let browser;
try {
  browser = await chromium.launch({ channel: 'chrome' });
} catch {
  browser = await chromium.launch();
}
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
await mkdir(IMAGES_DIR, { recursive: true });

const files = (await readdir(POSTS_DIR)).filter((f) => /\.mdx?$/.test(f));
let updated = 0, skipped = 0;

for (const file of files) {
  const filePath = path.join(POSTS_DIR, file);
  const slug = file.replace(/\.mdx?$/, '');
  const raw = await readFile(filePath, 'utf-8');
  const { data, content } = matter(raw);

  if (data.noindex) { skipped += 1; continue; } // soft-retired — not worth rendering

  const { a, b } = splitTitle(data.title);
  const params = new URLSearchParams({
    chip: `${data.category ?? 'AI Tools'} · ${new Date(data.pubDate).getFullYear()}`,
    a, b,
    sub: 'ynvesters.com · Hands-on AI tool verdicts',
  });
  await page.goto(`file://${HERO_HTML}?${params}`);
  await page.waitForTimeout(300);
  await page.screenshot({
    path: path.join(IMAGES_DIR, `${slug}.png`),
    clip: { x: 0, y: 0, width: W, height: H },
  });

  data.heroImage = `/images/${slug}.png`;
  data.heroImageAlt = data.title;
  delete data.heroImageCredit;
  delete data.heroImageUrl;

  await writeFile(filePath, matter.stringify(content, data), 'utf-8');
  updated += 1;
  console.log(`✅ ${slug}`);
}

await browser.close();
console.log(`\nDone: ${updated} updated, ${skipped} skipped (noindexed).`);
