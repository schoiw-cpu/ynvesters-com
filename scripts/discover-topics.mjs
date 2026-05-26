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

// Fallback pool: curated topics written when live discovery finds nothing new
const FALLBACK_TOPICS = [
  { title: 'Claude 3.5 Sonnet vs GPT-4o: Which AI Model Wins in 2026?', url: 'https://anthropic.com', source: 'fallback' },
  { title: 'Perplexity AI Pro vs ChatGPT Plus: Which Search AI is Worth the Money?', url: 'https://perplexity.ai', source: 'fallback' },
  { title: 'Best AI Writing Tools for Bloggers in 2026', url: 'https://ynvesters.com', source: 'fallback' },
  { title: 'How to Use Claude API for Automated Content: A Developer Guide', url: 'https://anthropic.com', source: 'fallback' },
  { title: 'Suno AI vs Udio: Best AI Music Generator Compared', url: 'https://suno.com', source: 'fallback' },
  { title: 'Windsurf vs Cursor vs GitHub Copilot: AI Code Editor Showdown 2026', url: 'https://codeium.com', source: 'fallback' },
  { title: 'Gemini 2.0 Flash vs GPT-4o Mini: Best Budget AI Model?', url: 'https://deepmind.google', source: 'fallback' },
  { title: 'Descript vs Adobe Podcast: Best AI Audio Editor for Creators', url: 'https://descript.com', source: 'fallback' },
  { title: 'Luma Dream Machine vs Sora: AI Video Generation in 2026', url: 'https://lumalabs.ai', source: 'fallback' },
  { title: 'Figma AI vs Framer AI: Best AI Design Tool for Non-Designers', url: 'https://figma.com', source: 'fallback' },
  { title: 'Krea AI vs Magnific: Best AI Image Upscaling Tool', url: 'https://krea.ai', source: 'fallback' },
  { title: 'Linear vs Jira with AI: Which Project Management Tool is Smarter?', url: 'https://linear.app', source: 'fallback' },
  { title: 'ElevenLabs vs PlayHT: Best AI Voice Cloning Tool Compared', url: 'https://elevenlabs.io', source: 'fallback' },
  { title: 'Airtable AI vs Notion AI: Best AI Database for Teams', url: 'https://airtable.com', source: 'fallback' },
  { title: 'Superhuman AI vs HEY: Best AI Email Client in 2026', url: 'https://superhuman.com', source: 'fallback' },
  { title: 'Synthesia vs HeyGen: Best AI Avatar Video Platform', url: 'https://synthesia.io', source: 'fallback' },
  { title: 'Jasper AI vs Copy.ai vs Writesonic: Best AI Copywriting Tool', url: 'https://jasper.ai', source: 'fallback' },
  { title: 'Claude Artifacts vs ChatGPT Canvas: Best AI Code Sandbox?', url: 'https://anthropic.com', source: 'fallback' },
  { title: 'Opus Clip vs Descript: Best AI Short Video Creator for YouTube', url: 'https://opus.pro', source: 'fallback' },
  { title: 'Make vs Zapier in 2026: Which AI Automation Platform Wins?', url: 'https://make.com', source: 'fallback' },
  { title: 'Ideogram 2.0 vs Midjourney v7: Best AI Image Generator', url: 'https://ideogram.ai', source: 'fallback' },
  { title: 'Notion AI vs Obsidian AI: Best AI Note-Taking App for Researchers', url: 'https://notion.so', source: 'fallback' },
  { title: 'Pika Labs vs Kling AI: Best AI Video Tool for Social Media', url: 'https://pika.art', source: 'fallback' },
  { title: 'Arc Browser AI vs Brave AI: Smartest AI-Powered Browser', url: 'https://arc.net', source: 'fallback' },
  { title: 'Glean vs Microsoft Copilot for Enterprise: Best Workplace AI', url: 'https://glean.com', source: 'fallback' },
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

  const [hnTopics, ...rssResults] = await Promise.all([
    fetchFromHN(),
    ...RSS_FEEDS.map(fetchFromRss),
  ]);

  const allTopics = [...hnTopics, ...rssResults.flat()];

  const deduplicated = allTopics.filter(topic => {
    const slug = slugify(topic.title);
    return !existingSlugs.has(slug);
  });

  const live = deduplicated
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(t => ({ ...t, slug: slugify(t.title) }));

  if (live.length > 0) {
    console.log(`[discover] Live topics found: ${live.length}`);
    return live;
  }

  // No live topics — pick from fallback pool, excluding already-published slugs
  console.log('[discover] No live topics; using fallback pool.');
  const fallbackCandidates = FALLBACK_TOPICS.filter(t => {
    const slug = slugify(t.title);
    return !existingSlugs.has(slug);
  });

  if (fallbackCandidates.length === 0) {
    console.log('[discover] Fallback pool exhausted.');
    return [];
  }

  // Pick one at random from the fallback pool
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
