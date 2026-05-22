#!/usr/bin/env node
import { discoverTopics } from './discover-topics.mjs';
import { generatePost } from './generate-post.mjs';
import { fetchImage } from './fetch-images.mjs';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const POSTS_DIR = path.join(__dirname, '../src/content/posts');
const DRY_RUN = process.argv.includes('--dry-run');
const FORCE_TOPIC = process.argv.find(a => a.startsWith('--topic='))?.split('=')[1];

const MIN_WORD_COUNT = 1200;
const MIN_QUALITY_SCORE = 7;

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}

async function assessQuality(content) {
  // Heuristic quality checks (no extra API call)
  const wordCount = content.split(/\s+/).length;
  if (wordCount < MIN_WORD_COUNT) return { pass: false, reason: `Too short: ${wordCount} words` };

  const hasConclusion = /##\s*conclusion/i.test(content);
  if (!hasConclusion) return { pass: false, reason: 'Missing conclusion section' };

  const externalLinks = (content.match(/https?:\/\//g) ?? []).length;
  if (externalLinks < 2) return { pass: false, reason: `Too few external links: ${externalLinks}` };

  const hasFrontmatter = content.trimStart().startsWith('---');
  if (!hasFrontmatter) return { pass: false, reason: 'Missing frontmatter' };

  // Simulate quality score (1-10): based on structure signals
  let score = 5;
  if (wordCount > 1500) score += 1;
  if (wordCount > 1800) score += 1;
  if (externalLinks >= 3) score += 1;
  if (/##\s*(pros|cons|comparison|pricing|features)/i.test(content)) score += 1;
  if (/\|.*\|.*\|/m.test(content)) score += 1; // has a table

  if (score < MIN_QUALITY_SCORE) return { pass: false, reason: `Quality score too low: ${score}/10` };

  return { pass: true, score, wordCount };
}

async function run() {
  console.log(`\n=== Ynvesters Content Pipeline ${DRY_RUN ? '[DRY RUN]' : ''} ===\n`);

  // 1. Discover topics
  let topic;
  if (FORCE_TOPIC) {
    topic = { title: FORCE_TOPIC, url: 'https://ynvesters.com', source: 'manual', slug: slugify(FORCE_TOPIC) };
    console.log(`[pipeline] Using forced topic: "${FORCE_TOPIC}"`);
  } else {
    console.log('[pipeline] Step 1: Discovering topics...');
    const topics = await discoverTopics(5);
    if (topics.length === 0) {
      console.log('[pipeline] No new topics found. Skipping today.');
      process.exit(0);
    }
    topic = topics[0];
    console.log(`[pipeline] Selected: "${topic.title}" (${topic.source})`);
  }

  // 2. Fetch image
  console.log('[pipeline] Step 2: Fetching image...');
  const imageData = DRY_RUN ? null : await fetchImage(topic.title, topic.slug);
  if (imageData) {
    console.log(`[pipeline] Image: ${imageData.localPath} (by ${imageData.credit})`);
  } else {
    console.log('[pipeline] No image fetched.');
  }

  // 3. Generate post (with retry)
  console.log('[pipeline] Step 3: Generating post...');
  let result = await generatePost(topic, imageData, DRY_RUN);

  if (DRY_RUN) {
    console.log('\n[pipeline] Dry run complete.');
    process.exit(0);
  }

  // 4. Quality gate (retry once)
  let quality = await assessQuality(result.content);
  if (!quality.pass) {
    console.warn(`[pipeline] Quality gate failed: ${quality.reason}. Retrying...`);
    result = await generatePost(topic, imageData, false);
    quality = await assessQuality(result.content);
    if (!quality.pass) {
      console.error(`[pipeline] Quality gate failed again: ${quality.reason}. Skipping today.`);
      process.exit(0);
    }
  }

  console.log(`[pipeline] Quality OK — score: ${quality.score}/10, words: ${quality.wordCount}`);

  // 5. Save MDX file
  await mkdir(POSTS_DIR, { recursive: true });
  const filename = `${topic.slug}.mdx`;
  const filepath = path.join(POSTS_DIR, filename);
  await writeFile(filepath, result.content, 'utf-8');
  console.log(`[pipeline] Saved: src/content/posts/${filename}`);
  console.log(`[pipeline] API usage: ${result.inputTokens} in / ${result.outputTokens} out tokens`);
  console.log('\n[pipeline] Done!');
}

run().catch(err => {
  console.error('[pipeline] Fatal error:', err);
  process.exit(1);
});
