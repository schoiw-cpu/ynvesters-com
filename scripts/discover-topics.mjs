import Parser from 'rss-parser';
import { readdir } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const POSTS_DIR = path.join(__dirname, '../src/content/posts');

const RSS_FEEDS = [
  'https://www.producthunt.com/feed',
  'https://techcrunch.com/category/artificial-intelligence/feed/',
  'https://feeds.feedburner.com/venturebeat/SZYF',
];

// Fallback pool: curated BOFU topics (buyer intent, low competition, high conversion)
// Updated 2026-06-22 — prioritize "is it worth it?", pricing, alternatives, specific use cases
const FALLBACK_TOPICS = [
  // High-conversion "worth it?" and pricing BOFU
  { title: 'ChatGPT Plus vs Claude Pro: Which $20/Month AI Subscription Is Worth It in 2026?', url: 'https://openai.com', source: 'fallback' },
  { title: 'Grammarly Premium Review 2026: Is $30/Month Worth It for Bloggers?', url: 'https://grammarly.com', source: 'fallback' },
  { title: 'Notion AI Pricing Explained: Is the $10/Month Add-On Worth It?', url: 'https://notion.so', source: 'fallback' },
  { title: 'Cursor AI Pro vs Free: Is the $20/Month Plan Worth It for Solo Developers?', url: 'https://cursor.sh', source: 'fallback' },
  { title: 'Perplexity AI Free vs Pro: What Do You Actually Get for $20/Month?', url: 'https://perplexity.ai', source: 'fallback' },
  { title: 'Jasper AI Pricing 2026: Is There a Cheaper Alternative That Does the Same Thing?', url: 'https://jasper.ai', source: 'fallback' },
  { title: 'ElevenLabs Free Plan Limits 2026: Exactly How Many Characters Per Month?', url: 'https://elevenlabs.io', source: 'fallback' },
  { title: 'Midjourney vs Adobe Firefly: Which AI Image Tool Is Worth Paying For in 2026?', url: 'https://midjourney.com', source: 'fallback' },
  { title: 'Opus Clip Review 2026: Is AI Video Repurposing Worth $29/Month?', url: 'https://opus.pro', source: 'fallback' },
  { title: 'HeyGen Free Trial Review: What Is Actually Included Before You Pay?', url: 'https://heygen.com', source: 'fallback' },
  // Head-to-heads not yet covered
  { title: 'Make vs Zapier vs n8n: Which AI Automation Platform Wins in 2026?', url: 'https://make.com', source: 'fallback' },
  { title: 'Copy.ai vs Writesonic: Which Is Better for Long-Form Blog Posts in 2026?', url: 'https://copy.ai', source: 'fallback' },
  { title: 'Superhuman AI vs HEY Email: Which AI Email Client Is Actually Faster?', url: 'https://superhuman.com', source: 'fallback' },
  { title: 'Notion AI vs Obsidian with AI Plugins: Best AI Note-Taking App for Researchers?', url: 'https://notion.so', source: 'fallback' },
  { title: 'Pika Labs vs Kling AI vs Luma: Best AI Video Tool for Social Media in 2026?', url: 'https://pika.art', source: 'fallback' },
  { title: 'Claude Artifacts vs ChatGPT Canvas: Which AI Coding Sandbox Is Better?', url: 'https://anthropic.com', source: 'fallback' },
  { title: 'Glean vs Microsoft Copilot for Enterprise: Best Workplace AI Search in 2026?', url: 'https://glean.com', source: 'fallback' },
  { title: 'Arc Browser AI vs Brave AI vs Chrome AI: Which Browser Uses AI Best in 2026?', url: 'https://arc.net', source: 'fallback' },
  { title: 'Otter.ai vs Fireflies vs Notion AI: Best AI Meeting Notetaker Compared 2026', url: 'https://otter.ai', source: 'fallback' },
  { title: 'GitHub Copilot vs Amazon Q Developer: Best AI Coding Assistant for AWS Users?', url: 'https://github.com', source: 'fallback' },
  // Niche/use-case BOFU (low competition)
  { title: 'Best AI Tools for Freelancers in 2026: Tested and Ranked by Category', url: 'https://ynvesters.com', source: 'fallback' },
  { title: 'Best AI Writing Tools for Non-Native English Speakers in 2026', url: 'https://ynvesters.com', source: 'fallback' },
  { title: 'Best AI Tools for YouTube Creators in 2026: Script, Edit, and Repurpose', url: 'https://ynvesters.com', source: 'fallback' },
  { title: 'Best AI Coding Assistants for Beginners 2026: No Experience Required', url: 'https://ynvesters.com', source: 'fallback' },
  { title: 'Best AI Tools for Solo Founders in 2026: Run a Business Without a Team', url: 'https://ynvesters.com', source: 'fallback' },
  { title: 'Claude API Pricing Explained: How Much Does It Cost to Build an AI App in 2026?', url: 'https://anthropic.com', source: 'fallback' },
  { title: 'OpenAI API vs Claude API vs Gemini API: Cheapest LLM for Production Apps in 2026', url: 'https://openai.com', source: 'fallback' },
  { title: 'Stable Diffusion vs Midjourney vs DALL-E 3: Which AI Art Tool for Commercial Use?', url: 'https://stability.ai', source: 'fallback' },
  { title: 'Descript vs Riverside FM vs Squadcast: Best AI Podcast Recording Tool 2026', url: 'https://descript.com', source: 'fallback' },
  { title: 'Gamma vs Beautiful.ai vs Tome: Best AI Presentation Tool Compared 2026', url: 'https://gamma.app', source: 'fallback' },
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
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
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

  // HN Show HN posts are excluded — they cover obscure micro-tools with near-zero
  // search volume. RSS feeds cover established products; fallback covers known brands.
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

  if (live.length > 0) {
    console.log(`[discover] RSS topics found: ${live.length}`);
    return live;
  }

  // RSS found nothing new — pick from curated fallback pool
  console.log('[discover] No RSS topics; using fallback pool.');
  const fallbackCandidates = FALLBACK_TOPICS.filter(t => {
    const slug = slugify(t.title);
    return !existingSlugs.has(slug);
  });

  if (fallbackCandidates.length === 0) {
    console.log('[discover] Fallback pool exhausted.');
    return [];
  }

  const picked = fallbackCandidates[Math.floor(Math.random() * fallbackCandidates.length)];
  console.log(`[discover] Fallback topic selected: "${picked.title}"`);
  return [{ ...picked, slug: slugify(picked.title) }];
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
