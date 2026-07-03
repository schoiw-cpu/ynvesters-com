import path from 'path';
import { mkdir } from 'fs/promises';
import { fileURLToPath } from 'url';

// In-article info cards (stat / vs / verdict) — phase 2 of the branded image
// system. The post generator embeds MDX-safe directives like
//   {/*CARD:stat|a=42%|b=cheaper than Jasper|c=at $20/mo vs $39/mo*/}
// and this module renders each into a branded PNG and swaps the directive for
// a markdown image. Directives that fail to render are stripped, so the
// published MDX never contains raw markers (and an MDX comment is invisible
// anyway if one slips through).

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CARD_HTML = path.join(__dirname, '../brand/card.html');
const IMAGES_DIR = path.join(__dirname, '../public/images');
const W = 1080, H = 608;

const DIRECTIVE_RE = /\{\/\*\s*CARD:(stat|vs|verdict)\|([^*]*?)\s*\*\/\}/g;

function parseParams(raw) {
  const params = {};
  for (const pair of raw.split('|')) {
    const eq = pair.indexOf('=');
    if (eq > 0) params[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
  }
  return params;
}

function altFor(type, p) {
  if (type === 'stat') return `${p.a ?? ''} — ${p.b ?? ''}`.trim();
  if (type === 'vs') return `${p.t ?? 'Comparison'}: ${p.a ?? ''} vs ${p.c ?? ''}`.trim();
  return `Verdict: ${p.a ?? ''}`.trim();
}

async function launchBrowser() {
  const { chromium } = await import('playwright');
  try {
    return await chromium.launch({ channel: 'chrome' }); // system Chrome
  } catch {
    return await chromium.launch(); // playwright-managed chromium
  }
}

/**
 * Replaces every card directive in `content` with a rendered branded image.
 * Returns content unchanged (minus stripped directives) if rendering fails.
 */
export async function processCardDirectives(content, slug) {
  const matches = [...content.matchAll(DIRECTIVE_RE)];
  if (matches.length === 0) return content;

  let browser;
  try {
    browser = await launchBrowser();
    await mkdir(IMAGES_DIR, { recursive: true });

    const page = await browser.newPage({
      viewport: { width: W, height: H },
      deviceScaleFactor: 2,
    });

    let result = content;
    let n = 0;
    for (const m of matches) {
      n += 1;
      const [directive, type, raw] = m;
      const params = parseParams(raw);
      const filename = `${slug}-card-${n}.png`;
      try {
        const qs = new URLSearchParams({ type, ...params });
        await page.goto(`file://${CARD_HTML}?${qs}`);
        await page.waitForTimeout(300);
        await page.screenshot({
          path: path.join(IMAGES_DIR, filename),
          clip: { x: 0, y: 0, width: W, height: H },
        });
        result = result.replace(directive, `![${altFor(type, params)}](/images/${filename})`);
        console.log(`[cards] Rendered ${type} card: /images/${filename}`);
      } catch (e) {
        console.warn(`[cards] Card ${n} (${type}) failed: ${e.message} — stripping directive.`);
        result = result.replace(directive, '');
      }
    }

    await browser.close();
    return result;
  } catch (e) {
    if (browser) await browser.close().catch(() => {});
    console.warn(`[cards] Renderer unavailable (${e.message}) — stripping all directives.`);
    return content.replaceAll(DIRECTIVE_RE, '');
  }
}

// CLI smoke test: node scripts/generate-cards.mjs
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const sample = [
    'Intro paragraph about pricing.',
    '{/*CARD:stat|a=50%|b=cheaper than Jasper|c=Writesonic $20/mo vs Jasper $39/mo*/}',
    'Comparison discussion...',
    '{/*CARD:vs|t=Best for solo creators|a=Writesonic|b=SEO-native, $20/mo, web access|c=Jasper|d=Brand voice focus, $39/mo*/}',
    'Closing argument...',
    '{/*CARD:verdict|a=Skip Jasper unless brand voice is your whole job|b=For solo creators, Writesonic covers 90% at half the price*/}',
  ].join('\n\n');
  const out = await processCardDirectives(sample, 'card-test');
  console.log('\n--- processed content ---\n' + out);
}
