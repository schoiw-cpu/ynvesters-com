import Parser from 'rss-parser';
import { fileURLToPath } from 'url';

// Trend radar: detect ONLY big, buzzing AI events worth riding same-day.
// High thresholds are the whole point — the old RSS pipeline published obscure
// micro-tools with zero search volume. A trend qualifies only if it comes from
// an official frontier-lab announcement or crossed a high Hacker News score.
// The BOFU companion post ("what it is / pricing / worth it?") is what people
// search for hours after reading the news, and big media doesn't write those.

const HN_MIN_POINTS = 300;
const MAX_AGE_HOURS = 48;

const LAB_FEEDS = [
  { name: 'OpenAI', url: 'https://openai.com/news/rss.xml' },
  { name: 'Google DeepMind', url: 'https://deepmind.google/blog/rss.xml' },
  { name: 'Google AI', url: 'https://blog.google/technology/ai/rss/' },
];

// Only product/model announcements qualify — not research papers or policy posts.
const LAUNCH_KEYWORDS = /introducing|announc|launch|new model|now available|available today|released?|unveil|meet\s/i;

// Roundups, recaps, and digests match launch keywords ("news we announced") but
// are worthless to ride — a BOFU companion needs ONE specific product.
const EXCLUDE_PATTERNS = /\b(news|updates?|recap|roundup|round-up|digest|highlights|this (week|month|year)|monthly|weekly|latest)\b/i;

function isFresh(dateStr) {
  const ts = new Date(dateStr ?? 0).getTime();
  if (!ts) return false;
  return Date.now() - ts < MAX_AGE_HOURS * 60 * 60 * 1000;
}

function isAiRelated(text) {
  const t = text.toLowerCase();
  return ['ai', 'gpt', 'llm', 'model', 'agent', 'claude', 'gemini', 'copilot', 'chatbot'].some(k => t.includes(k));
}

// "Introducing GPT-5.6" -> "GPT-5.6"
function extractSubject(title) {
  return title
    .replace(/^show hn:\s*/i, '')
    .replace(/^(introducing|announcing|meet|say hello to)\s+/i, '')
    .replace(/^["'"']|["'"']$/g, '')
    .trim();
}

function bofuTitle(sourceTitle) {
  const subject = extractSubject(sourceTitle);
  if (subject.length <= 55) {
    return `${subject}: What It Is, Key Features, and Is It Worth It?`;
  }
  return `${subject} — What It Means and Should You Care?`;
}

// Fetch the announcement page and extract readable text as grounding for the
// post generator. A just-announced product is not in the LLM's training data,
// so every specific claim must come from this excerpt or be marked unannounced.
async function fetchGrounding(url, fallbackText = '') {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; YnvestersBot/1.0)' },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&\w+;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (text.length > 500) return text.slice(0, 3500);
  } catch (e) {
    console.warn(`[radar] Grounding fetch failed (${url}): ${e.message}`);
  }
  return fallbackText.slice(0, 3500);
}

async function checkLabFeeds() {
  const parser = new Parser({ timeout: 12000 });
  const hits = [];
  for (const feed of LAB_FEEDS) {
    try {
      const parsed = await parser.parseURL(feed.url);
      for (const item of parsed.items ?? []) {
        const title = item.title ?? '';
        if (!isFresh(item.pubDate ?? item.isoDate)) continue;
        if (!LAUNCH_KEYWORDS.test(title)) continue;
        if (EXCLUDE_PATTERNS.test(title)) continue;
        if (!isAiRelated(title + ' ' + (item.contentSnippet ?? ''))) continue;
        hits.push({
          sourceTitle: title,
          url: item.link ?? feed.url,
          source: `lab:${feed.name}`,
          snippet: item.contentSnippet ?? '',
          score: 1000, // official lab launches outrank everything
        });
      }
    } catch (e) {
      console.warn(`[radar] Lab feed failed (${feed.name}): ${e.message}`);
    }
  }
  return hits;
}

async function checkHackerNews() {
  const cutoff = Math.floor(Date.now() / 1000) - MAX_AGE_HOURS * 3600;
  const url = `https://hn.algolia.com/api/v1/search?tags=story&hitsPerPage=30&numericFilters=points>=${HN_MIN_POINTS},created_at_i>${cutoff}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
    const data = await res.json();
    return (data.hits ?? [])
      .filter(h => isAiRelated(h.title ?? ''))
      // A 300-point essay/opinion piece can't take a "pricing / worth it?"
      // companion — only launch-shaped stories qualify.
      .filter(h => LAUNCH_KEYWORDS.test(h.title ?? ''))
      // Exclude "Show HN" — those are obscure micro-tools with near-zero search
      // volume and no persona fit (published Microsoft Flint, a niche dev tool).
      .filter(h => !/^show hn/i.test(h.title ?? ''))
      .filter(h => !EXCLUDE_PATTERNS.test(h.title ?? ''))
      .map(h => ({
        sourceTitle: h.title,
        url: h.url ?? `https://news.ycombinator.com/item?id=${h.objectID}`,
        source: 'hn-trending',
        snippet: h.story_text ?? '',
        score: h.points ?? 0,
      }));
  } catch (e) {
    console.warn(`[radar] HN check failed: ${e.message}`);
    return [];
  }
}

/**
 * Returns the single biggest qualifying trend as a topic object
 * ({ title, url, source, grounding }) or null on quiet days.
 */
export async function detectBigTrend() {
  const [labHits, hnHits] = await Promise.all([checkLabFeeds(), checkHackerNews()]);
  const all = [...labHits, ...hnHits].sort((a, b) => b.score - a.score);

  if (all.length === 0) {
    console.log('[radar] No big trend today — quiet day.');
    return null;
  }

  const top = all[0];
  console.log(`[radar] BIG TREND detected (${top.source}, score ${top.score}): "${top.sourceTitle}"`);

  const grounding = await fetchGrounding(top.url, top.snippet);

  return {
    title: bofuTitle(top.sourceTitle),
    url: top.url,
    source: top.source,
    grounding,
    sourceTitle: top.sourceTitle,
  };
}

// CLI: node scripts/trend-radar.mjs
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const trend = await detectBigTrend();
  if (trend) {
    console.log('\n[radar] Topic:', trend.title);
    console.log('[radar] Source:', trend.url);
    console.log('[radar] Grounding chars:', trend.grounding.length);
    console.log('[radar] Grounding preview:', trend.grounding.slice(0, 300));
  }
}
