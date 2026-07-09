import Parser from 'rss-parser';
import { readdir } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { detectBigTrend } from './trend-radar.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const POSTS_DIR = path.join(__dirname, '../src/content/posts');

const RSS_FEEDS = [
  'https://www.producthunt.com/feed',
  'https://techcrunch.com/category/artificial-intelligence/feed/',
  'https://feeds.feedburner.com/venturebeat/SZYF',
];

// Fallback pool: verdict-driven, money-angle topics for THE persona (2026-07-03):
// a solo creator/freelancer paying $20-60/mo for AI subscriptions, wondering
// monthly if they're worth it. Every title takes a clear position — balanced,
// reaction-free comparisons are banned. Affiliate-fit first (Writesonic,
// ElevenLabs, Murf, Gamma).
const FALLBACK_TOPICS = [
  // Approved-affiliate priority (Writesonic 20%, ElevenLabs 22%, Murf 20%, Gamma 30%)
  { title: 'Writesonic Review 2026: I Tested the $20 Plan So You Don\'t Have To', url: 'https://writesonic.com', source: 'fallback' },
  { title: 'ElevenLabs vs Murf AI: The Only Voice AI Comparison with a Straight Answer', url: 'https://elevenlabs.io', source: 'fallback' },
  { title: 'Gamma AI Is Underrated: Why I Stopped Making Slides the Old Way', url: 'https://gamma.app', source: 'fallback' },
  { title: 'Murf AI Review 2026: Worth It or Just Another TTS Tool? A Blunt Verdict', url: 'https://murf.ai', source: 'fallback' },
  { title: 'Don\'t Pay for Jasper: Writesonic Does 90% of It for Half the Price', url: 'https://writesonic.com', source: 'fallback' },
  { title: 'Copy.ai vs Writesonic in 2026: One Is Clearly Better for Solo Creators', url: 'https://writesonic.com', source: 'fallback' },
  { title: 'Selling AI Voiceovers in 2026: Can ElevenLabs Actually Make You Money?', url: 'https://elevenlabs.io', source: 'fallback' },
  { title: 'Freelancers Are Charging $300 per Deck with Gamma — Here\'s the Playbook', url: 'https://gamma.app', source: 'fallback' },
  // Money / stack-audit angle
  { title: 'My $200/Month AI Stack Is Now $45 — Here\'s Exactly What I Cut', url: 'https://ynvesters.com', source: 'fallback' },
  { title: 'The Only 3 AI Subscriptions Worth Paying For in 2026 (and 5 to Cancel)', url: 'https://ynvesters.com', source: 'fallback' },
  { title: 'I Canceled ChatGPT Plus After 18 Months — Here\'s What Replaced It', url: 'https://openai.com', source: 'fallback' },
  { title: 'ChatGPT Plus vs Claude Pro: Stop Paying for Both — How to Pick One', url: 'https://anthropic.com', source: 'fallback' },
  { title: 'Free AI Tools That Beat Their Paid Versions in 2026 (Tested)', url: 'https://ynvesters.com', source: 'fallback' },
  { title: 'Overrated: 5 AI Tools Everyone Recommends That Aren\'t Worth Your Money', url: 'https://ynvesters.com', source: 'fallback' },
  { title: 'Underrated: 5 AI Tools Nobody Talks About That Beat the Big Names', url: 'https://ynvesters.com', source: 'fallback' },
  { title: 'Midjourney Is Overpriced for Most People — Use These Instead', url: 'https://midjourney.com', source: 'fallback' },
  // Verdict head-to-heads (high search volume, clear winner declared)
  { title: 'Cursor vs GitHub Copilot: I Used Both for 3 Months — One Clear Winner', url: 'https://cursor.sh', source: 'fallback' },
  { title: 'Notion AI Isn\'t Worth $10/Month — Unless You\'re This Kind of User', url: 'https://notion.so', source: 'fallback' },
  { title: 'Perplexity Pro vs ChatGPT Plus: The $20 Question, Answered Bluntly', url: 'https://perplexity.ai', source: 'fallback' },
  { title: 'Grammarly Premium Is Too Expensive — Here\'s Exactly When It\'s Worth It', url: 'https://grammarly.com', source: 'fallback' },
  { title: 'Descript Review 2026: The Editor That Replaced 3 of My Subscriptions', url: 'https://descript.com', source: 'fallback' },
  { title: 'HeyGen vs Synthesia: Don\'t Buy Either Until You Read This', url: 'https://heygen.com', source: 'fallback' },
  { title: 'GPT-4o vs Claude for Freelance Writers: A Verdict After 100 Real Tasks', url: 'https://anthropic.com', source: 'fallback' },
  { title: 'Zapier Is Overkill for Most Solopreneurs — Make Is the Smarter Buy', url: 'https://make.com', source: 'fallback' },
  { title: 'Canva Pro vs Adobe Express: Which $120/Year Is the Better Spend?', url: 'https://canva.com', source: 'fallback' },
  // Money-making crossover (AI × income)
  { title: '5 AI Side Hustles That Actually Pay in 2026 (With Real Numbers)', url: 'https://ynvesters.com', source: 'fallback' },
  { title: 'How I\'d Build a One-Person Business with $50/Month of AI Tools', url: 'https://ynvesters.com', source: 'fallback' },
  { title: 'The Cheapest AI Stack for YouTube Creators in 2026 (Under $40/Month)', url: 'https://ynvesters.com', source: 'fallback' },
  { title: 'AI Tools for Freelancers in 2026: The Short List That Pays for Itself', url: 'https://ynvesters.com', source: 'fallback' },
  { title: 'Stop Buying AI Courses: The $0 Way to Learn Every Tool in This List', url: 'https://ynvesters.com', source: 'fallback' },
];

async function getExistingSlugs() {
  try {
    const files = await readdir(POSTS_DIR);
    return new Set(files.map(f => f.replace(/\.mdx?$/, '')));
  } catch {
    return new Set();
  }
}

function slugify(str) {
  return str
    .toLowerCase()
    // Strip year labels so URLs stay evergreen — a title can show "2026" for
    // CTR, but the permanent URL must not date (a "-2026" slug turns an
    // otherwise-evergreen comparison into a page that looks stale next year).
    .replace(/\b(in|for|of|by)\s+20[2-4][0-9]\b/g, '')
    .replace(/\b20[2-4][0-9]\b/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
}

function isAiToolRelated(title, summary = '') {
  const text = (title + ' ' + summary).toLowerCase();
  const keywords = ['ai', 'gpt', 'llm', 'chatbot', 'copilot', 'automation', 'claude', 'gemini',
    'tool', 'app', 'platform', 'api', 'model', 'agent', 'assistant', 'generate', 'ml'];
  return keywords.some(k => text.includes(k));
}

async function fetchFromHN() {
  // Only look at posts from the last 3 days to avoid stale viral posts
  const threeDaysAgo = Math.floor(Date.now() / 1000) - 3 * 24 * 60 * 60;
  const url = `https://hn.algolia.com/api/v1/search?tags=show_hn&query=AI+tool&hitsPerPage=20&numericFilters=created_at_i>${threeDaysAgo}`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    return (data.hits ?? [])
      .filter(h => isAiToolRelated(h.title, h.story_text ?? ''))
      .map(h => ({
        title: h.title,
        url: h.url ?? `https://news.ycombinator.com/item?id=${h.objectID}`,
        source: 'hackernews',
        score: h.points ?? 0,
      }));
  } catch (e) {
    console.warn('[discover] HN fetch failed:', e.message);
    return [];
  }
}

async function fetchFromRss(feedUrl) {
  const parser = new Parser({ timeout: 10000 });
  try {
    const feed = await parser.parseURL(feedUrl);
    return (feed.items ?? [])
      .filter(item => isAiToolRelated(item.title ?? '', item.contentSnippet ?? ''))
      .slice(0, 5)
      .map(item => ({
        title: item.title ?? '',
        url: item.link ?? feedUrl,
        source: new URL(feedUrl).hostname,
        score: 0,
      }));
  } catch (e) {
    console.warn(`[discover] RSS fetch failed (${feedUrl}):`, e.message);
    return [];
  }
}

export async function discoverTopics(limit = 5) {
  const existingSlugs = await getExistingSlugs();

  // Priority 0 — trend radar: on days a frontier lab ships something big (or an
  // AI story crosses 300+ HN points), ride the wave with a same-day BOFU
  // companion post. Readers who saw the news search "X pricing / worth it?"
  // within hours, and big media doesn't write those. The topic carries a
  // `grounding` excerpt from the announcement so the generator can't hallucinate
  // specs for a product outside its training data.
  const trend = await detectBigTrend();
  if (trend) {
    const slug = slugify(trend.title);
    if (!existingSlugs.has(slug)) {
      return [{ ...trend, slug }];
    }
    console.log('[discover] Trend already covered; falling through to BOFU pool.');
  }

  // Curated BOFU pool takes priority: buyer-intent topics with search volume and
  // affiliate fit. RSS news topics (obscure launches, research projects) were getting
  // published for weeks with near-zero search volume and no monetization path —
  // RSS is now only a last resort when the curated pool runs dry.
  const fallbackCandidates = FALLBACK_TOPICS.filter(t => {
    const slug = slugify(t.title);
    return !existingSlugs.has(slug);
  });

  if (fallbackCandidates.length > 0) {
    const picked = fallbackCandidates[Math.floor(Math.random() * fallbackCandidates.length)];
    console.log(`[discover] BOFU topic selected (${fallbackCandidates.length} left in pool): "${picked.title}"`);
    return [{ ...picked, slug: slugify(picked.title) }];
  }

  console.log('[discover] BOFU pool exhausted; falling back to RSS.');
  const rssResults = await Promise.all(RSS_FEEDS.map(fetchFromRss));
  const allRssTopics = rssResults.flat();

  const deduplicated = allRssTopics.filter(topic => {
    const slug = slugify(topic.title);
    return !existingSlugs.has(slug);
  });

  const live = deduplicated
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(t => ({ ...t, slug: slugify(t.title) }));

  if (live.length === 0) {
    console.log('[discover] No topics found anywhere.');
    return [];
  }

  console.log(`[discover] RSS topics found: ${live.length}`);
  return live;
}

// CLI usage: node scripts/discover-topics.mjs
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const topics = await discoverTopics(5);
  console.log('[discover] Found topics:');
  topics.forEach((t, i) => console.log(`  ${i + 1}. [${t.source}] ${t.title}`));
  if (topics.length === 0) {
    console.log('  No new topics found.');
    process.exit(0);
  }
}
