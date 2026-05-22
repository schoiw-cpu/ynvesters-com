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

const HN_SEARCH = 'https://hn.algolia.com/api/v1/search?tags=show_hn&query=AI+tool&hitsPerPage=10';

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
  try {
    const res = await fetch(HN_SEARCH);
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

  // Sort by score (HN points), then take top N
  return deduplicated
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(t => ({ ...t, slug: slugify(t.title) }));
}

// CLI usage: node scripts/discover-topics.mjs
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const topics = await discoverTopics(5);
  console.log('[discover] Found topics:');
  topics.forEach((t, i) => console.log(`  ${i + 1}. ${t.title} (${t.source})`));
  if (topics.length === 0) {
    console.log('  No new topics found.');
    process.exit(0);
  }
}
