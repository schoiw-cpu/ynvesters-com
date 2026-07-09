import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';
import { readdir, readFile, writeFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

// One-off batch: add GEO frontmatter (keyTakeaways + faq) to existing posts that
// don't have it yet. Each is generated STRICTLY from the article's own text —
// the model is told to summarize only what's on the page and never invent
// figures — so retrofitted takeaways obey the same fact-discipline as the body.

dotenv.config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), '../.env') });
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const POSTS_DIR = path.join(__dirname, '../src/content/posts');

// YAML double-quoted scalar: neutralize quotes/newlines so injection never breaks.
const clean = (s) => String(s).replace(/[\r\n]+/g, ' ').replace(/"/g, "'").replace(/\s+/g, ' ').trim();

function toYaml(kt, faq) {
  const lines = ['keyTakeaways:'];
  for (const k of kt) lines.push(`  - "${clean(k)}"`);
  lines.push('faq:');
  for (const item of faq) {
    lines.push(`  - q: "${clean(item.q)}"`);
    lines.push(`    a: "${clean(item.a)}"`);
  }
  return lines.join('\n');
}

const PROMPT = (title, body) => `Below is a published article. Produce GEO metadata for it — a summary box and an FAQ — drawn STRICTLY from what the article already says.

HARD RULES:
- Use ONLY facts, figures, and verdicts that appear in the article text. Never introduce a number, price, or claim that isn't already there.
- keyTakeaways: 3–4 self-contained bullets stating the article's actual conclusion/verdict (not "this article covers X"). Each must stand alone with no context.
- faq: exactly 4 real buyer questions ("Is X worth it?", "X vs Y?", "How much does X cost?") with concise 1–3 sentence answers grounded in the article. If the article doesn't give a specific price, answer qualitatively (e.g., "check the official pricing page") rather than inventing one.

Output ONLY valid JSON, no prose, no code fences:
{"keyTakeaways":["...","..."],"faq":[{"q":"...","a":"..."},{"q":"...","a":"..."}]}

TITLE: ${title}

ARTICLE:
${body}`;

function parseJson(text) {
  let t = text.trim();
  const fence = t.match(/^```(?:json)?\s*\n([\s\S]*?)\n```\s*$/);
  if (fence) t = fence[1];
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start >= 0 && end > start) t = t.slice(start, end + 1);
  return JSON.parse(t);
}

const files = (await readdir(POSTS_DIR)).filter((f) => /\.mdx?$/.test(f)).sort();
let done = 0, skipped = 0, failed = 0;

for (const file of files) {
  const filePath = path.join(POSTS_DIR, file);
  const raw = await readFile(filePath, 'utf-8');
  if (/^---[\s\S]*?\bnoindex:\s*true/.test(raw)) { skipped++; continue; }
  if (/^---[\s\S]*?\bkeyTakeaways:/.test(raw)) { skipped++; continue; }

  const parts = raw.split('---');
  if (parts.length < 3) { console.warn(`⚠️  no frontmatter: ${file}`); failed++; continue; }
  const fm = parts[1];
  const body = parts.slice(2).join('---').trim();
  const title = (fm.match(/title:\s*(.+)/)?.[1] ?? file).replace(/^["'>|\-\s]+/, '').trim();

  try {
    const resp = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1200,
      messages: [{ role: 'user', content: PROMPT(title, body.slice(0, 12000)) }],
    });
    const data = parseJson(resp.content[0]?.text ?? '');
    const kt = (data.keyTakeaways ?? []).slice(0, 4);
    const faq = (data.faq ?? []).slice(0, 4).filter((x) => x && x.q && x.a);
    if (kt.length < 3 || faq.length < 3) throw new Error(`thin output (kt=${kt.length}, faq=${faq.length})`);

    const newFm = fm.replace(/\s*$/, '\n') + toYaml(kt, faq) + '\n';
    await writeFile(filePath, `---${newFm}---\n\n${body}\n`, 'utf-8');
    done++;
    console.log(`✅ ${file.replace('.mdx', '')}`);
  } catch (e) {
    failed++;
    console.warn(`❌ ${file}: ${e.message}`);
  }
}

console.log(`\nDone: ${done} retrofitted, ${skipped} skipped, ${failed} failed.`);
