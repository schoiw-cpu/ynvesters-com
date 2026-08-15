#!/usr/bin/env node
import { discoverTopics } from './discover-topics.mjs';
import { generatePost } from './generate-post.mjs';
import { fetchImage } from './fetch-images.mjs';
import { generateHero } from './generate-hero.mjs';
import { processCardDirectives } from './generate-cards.mjs';
import { writeFile, mkdir, readdir, access } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const POSTS_DIR = path.join(__dirname, '../src/content/posts');
const COMPONENTS_DIR = path.join(__dirname, '../src/components');
const DRY_RUN = process.argv.includes('--dry-run');
const FORCE_TOPIC = process.argv.find(a => a.startsWith('--topic='))?.split('=')[1];

// 30개 이상이면 주말 스킵 (UTC 기준 토=6, 일=0)
const WEEKDAY_ONLY_THRESHOLD = 30;
async function shouldSkipWeekend() {
  const day = new Date().getUTCDay(); // 0=Sun, 6=Sat
  if (day !== 0 && day !== 6) return false;
  try {
    const files = await readdir(POSTS_DIR);
    const postCount = files.filter(f => f.endsWith('.md') || f.endsWith('.mdx')).length;
    if (postCount >= WEEKDAY_ONLY_THRESHOLD) {
      console.log(`[pipeline] ${postCount} posts reached — skipping weekend. (threshold: ${WEEKDAY_ONLY_THRESHOLD})`);
      return true;
    }
    console.log(`[pipeline] Weekend run: ${postCount}/${WEEKDAY_ONLY_THRESHOLD} posts — continuing until threshold.`);
  } catch {
    // posts dir doesn't exist yet, continue
  }
  return false;
}

// The generator occasionally invents a component import (e.g. HeroImage) that
// doesn't exist. MDX resolves imports at build time, so one such line breaks the
// whole Cloudflare Pages build and silently freezes deploys for every later post.
// Strip any import whose .astro file is missing, plus that component's tags.
async function stripPhantomComponents(content) {
  const importRe = /^import\s+(\w+)\s+from\s+['"]([^'"]+\.astro)['"];?\s*$/gm;
  const phantoms = [];
  for (const [line, name, spec] of content.matchAll(importRe)) {
    const file = path.join(COMPONENTS_DIR, path.basename(spec));
    try {
      await access(file);
    } catch {
      phantoms.push({ line, name });
    }
  }
  for (const { line, name } of phantoms) {
    console.warn(`[pipeline] Stripping phantom component <${name}> — src/components/${name}.astro does not exist.`);
    content = content
      .replace(line, '')
      .replace(new RegExp(`^\\s*<${name}\\b[^>]*/>\\s*$`, 'gm'), '')
      .replace(new RegExp(`^\\s*<${name}\\b[\\s\\S]*?</${name}>\\s*$`, 'gm'), '');
  }
  // collapse blank-line runs left behind by the removals
  return phantoms.length ? content.replace(/\n{3,}/g, '\n\n') : content;
}

const MIN_WORD_COUNT = 1200;
const MIN_QUALITY_SCORE = 7;

function slugify(str) {
  // Strip year labels so URLs stay evergreen (see discover-topics.mjs slugify).
  return str.toLowerCase().replace(/\b(in|for|of|by)\s+20[2-4][0-9]\b/g, '').replace(/\b20[2-4][0-9]\b/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80).replace(/-+$/g, '');
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

  if (!DRY_RUN && await shouldSkipWeekend()) process.exit(0);

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

  // 2. Hero image: branded card first (original, $0, doubles as OG image);
  //    Unsplash stock photo only as fallback if rendering fails.
  console.log('[pipeline] Step 2: Generating hero image...');
  let imageData = DRY_RUN ? null : await generateHero(topic.title, topic.slug);
  if (!imageData && !DRY_RUN) {
    console.log('[pipeline] Hero generation failed — falling back to Unsplash.');
    imageData = await fetchImage(topic.title, topic.slug);
  }
  if (imageData) {
    console.log(`[pipeline] Image: ${imageData.localPath}${imageData.credit ? ` (by ${imageData.credit})` : ' (branded card)'}`);
  } else {
    console.log('[pipeline] No image available.');
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

  // 4.5 Render in-article info cards (stat/vs/verdict) from directives the
  //     generator embedded; failed renders are stripped, never published raw.
  result.content = await processCardDirectives(result.content, topic.slug);

  // 4.6 Drop imports of components that don't exist — one breaks the whole build.
  result.content = await stripPhantomComponents(result.content);

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
