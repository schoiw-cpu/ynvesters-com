import { execFileSync } from 'node:child_process';
import { mkdir, writeFile, readFile, readdir } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'node:os';

// Harvest GENUINE user opinions from Reddit (via agent-reach's OpenCLI backend)
// and cache them for the CI generator to weave into posts. Runs where OpenCLI
// lives (a session / the Mac), NOT in CI — the daily pipeline only reads the
// committed JSON. Reddit is the right source: real "is X worth it" threads,
// unlike X where promo/growth spam dominates high-engagement results.
//
// Usage:
//   node scripts/social-harvest.mjs "Cursor" "Notion AI" "ElevenLabs"
//   node scripts/social-harvest.mjs --file tools.txt
// Freshness: skips a tool whose cache is < FRESH_DAYS old unless --force.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '../data/social-signals');
const FRESH_DAYS = 21;
const MAX_POSTS = 3;       // top posts to read per tool
const MAX_QUOTES = 8;      // genuine quotes kept per tool
const MIN_SCORE = 5;       // comment upvote floor

const PATH_EXT = `${process.env.HOME}/.npm-global/bin:${process.env.HOME}/.agent-reach-venv/bin:/opt/homebrew/bin:${process.env.PATH}`;
const force = process.argv.includes('--force');

function opencli(args) {
  const out = execFileSync('opencli', args, {
    encoding: 'utf-8',
    timeout: 90000,
    env: { ...process.env, PATH: PATH_EXT },
    maxBuffer: 20 * 1024 * 1024,
  });
  return JSON.parse(out);
}

const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const clean = (s) => String(s).replace(/\s+/g, ' ').trim();

// Reddit search is fuzzy — common-word tool names pull the wrong domain
// ("Runway" → r/flying, "Jasper" → r/EarthPorn, "Perplexity" → r/AmItheAsshole).
// A post is on-topic only if the tool name is in the title AND the subreddit is
// either named after the tool or a known AI/tech community. That subreddit gate
// is what blocks the wrong-domain contamination.
const AI_SUBS = /^(chatgpt|openai|claudeai|claudecode|anthropic|bard|googlegemini|gemini|perplexity|localllama|artificial|singularity|machinelearning|artificialinteligence|aitools|aivideo|aitubers|midjourney|dalle2|stablediffusion|sunoai|udio|notion|cursor|windsurf|githubcopilot|copilot|replit|webdev|programming|sideproject|saas|productivity|writingwithai|contentcreation|videoediting|texttospeech|voiceacting|elevenlabs|gammaapp|presentation)/i;

function relevantPost(tool, post) {
  const main = tool.toLowerCase().replace(/\s*ai\s*$/, '').trim();      // "notion", "runway ml", "perplexity"
  const compact = main.replace(/\s+/g, '');
  const title = (post.title ?? '').toLowerCase();
  const sub = (post.subreddit ?? '').toLowerCase();
  const nameInTitle = title.includes(main) || title.includes(compact);
  if (!nameInTitle) return false;
  // Subreddit must relate to the tool OR be a recognized AI/tech community.
  return sub.includes(compact) || sub.includes(main) || AI_SUBS.test(sub);
}

function goodQuote(text, score) {
  if (!text || text === '[deleted]' || text === '[removed]') return false;
  if (!Number.isInteger(score) || score < MIN_SCORE) return false;
  const len = text.length;
  if (len < 40 || len > 240) return false;
  if (/^https?:\/\//.test(text) || /\bhttps?:\/\/\S+\s*$/.test(text)) return false;
  return true;
}

async function harvestTool(tool) {
  const slug = slugify(tool);
  const outPath = path.join(OUT_DIR, `${slug}.json`);

  if (!force) {
    try {
      const prev = JSON.parse(await readFile(outPath, 'utf-8'));
      const ageDays = (Date.now() - new Date(prev.harvestedAt).getTime()) / 86400000;
      if (ageDays < FRESH_DAYS) { console.log(`⏭  ${tool} (cache ${ageDays.toFixed(0)}d old)`); return; }
    } catch { /* no cache yet */ }
  }

  let posts;
  try {
    posts = opencli(['reddit', 'search', `${tool} worth it`, '-f', 'json']);
  } catch (e) {
    console.warn(`❌ ${tool}: search failed (${e.message.split('\n')[0]})`);
    return;
  }
  if (!Array.isArray(posts) || posts.length === 0) { console.warn(`⚠️  ${tool}: no posts`); return; }

  const top = posts
    .filter((p) => p.id && relevantPost(tool, p))
    .sort((a, b) => (b.comments ?? 0) - (a.comments ?? 0))
    .slice(0, MAX_POSTS);
  if (top.length === 0) { console.warn(`⚠️  ${tool}: no on-topic posts`); return; }

  const quotes = [];
  const threads = [];
  const seen = new Set();
  for (const p of top) {
    threads.push({ title: clean(p.title), subreddit: p.subreddit, comments: p.comments ?? 0 });
    let thread;
    try { thread = opencli(['reddit', 'read', p.id, '-f', 'json']); } catch { continue; }
    if (!Array.isArray(thread)) continue;
    for (const c of thread.slice(1)) {
      const text = clean(c.text ?? '');
      const key = text.slice(0, 60).toLowerCase();
      if (goodQuote(text, c.score) && !seen.has(key)) {
        seen.add(key);
        quotes.push({ text, score: c.score, subreddit: p.subreddit });
      }
    }
  }
  quotes.sort((a, b) => b.score - a.score);

  if (quotes.length < 3) { console.warn(`⚠️  ${tool}: only ${quotes.length} quotes — skipping write`); return; }

  const data = {
    tool,
    slug,
    source: 'reddit',
    harvestedAt: new Date(HARVEST_TS).toISOString().split('T')[0],
    threads,
    quotes: quotes.slice(0, MAX_QUOTES),
  };
  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(outPath, JSON.stringify(data, null, 2), 'utf-8');
  console.log(`✅ ${tool}: ${data.quotes.length} quotes from ${threads.length} threads → data/social-signals/${slug}.json`);
}

// Date.now() is available in a plain node script (not the workflow sandbox).
const HARVEST_TS = Date.now();

let tools = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const fileArg = process.argv.indexOf('--file');
if (fileArg > -1 && process.argv[fileArg + 1]) {
  const raw = await readFile(process.argv[fileArg + 1], 'utf-8');
  tools = raw.split('\n').map((l) => l.trim()).filter(Boolean);
}
if (tools.length === 0) {
  console.log('Usage: node scripts/social-harvest.mjs "Cursor" "Notion AI" ...  [--force] [--file tools.txt]');
  process.exit(0);
}

for (const t of tools) {
  await harvestTool(t);
}
console.log('\nDone.');
