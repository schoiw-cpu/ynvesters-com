#!/usr/bin/env node
/**
 * One-time seed script: generates 15 backdated posts for AdSense review readiness.
 * pubDates are spread over the past 30 days to simulate organic growth.
 */
import { generatePost } from './generate-post.mjs';
import { fetchImage } from './fetch-images.mjs';
import { writeFile, mkdir, readdir } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const POSTS_DIR = path.join(__dirname, '../src/content/posts');

const SEED_TOPICS = [
  { title: 'Cursor AI Code Editor: The Ultimate Review for Developers in 2026', slug: 'cursor-ai-code-editor-review-2026' },
  { title: 'Perplexity AI vs Google Search: Which Is Better for Research?', slug: 'perplexity-ai-vs-google-search-comparison' },
  { title: 'GitHub Copilot vs Cursor vs Codeium: Best AI Coding Assistant Compared', slug: 'github-copilot-vs-cursor-vs-codeium' },
  { title: 'ElevenLabs Voice AI: How to Clone Your Voice and Create Realistic Audio', slug: 'elevenlabs-voice-ai-review-tutorial' },
  { title: 'Midjourney v6 vs DALL-E 3 vs Stable Diffusion: Which AI Image Generator Wins?', slug: 'midjourney-v6-vs-dalle-3-vs-stable-diffusion' },
  { title: 'Notion AI Features: A Complete Guide to Automating Your Workflow', slug: 'notion-ai-features-complete-guide' },
  { title: 'Runway ML Gen-3: AI Video Generation for Beginners and Pros', slug: 'runway-ml-gen3-ai-video-generation-review' },
  { title: 'Gamma AI: Create Stunning Presentations in Minutes (Full Review)', slug: 'gamma-ai-presentation-tool-review' },
  { title: 'Otter.ai vs Fireflies.ai: Best AI Meeting Transcription Tool in 2026', slug: 'otter-ai-vs-fireflies-meeting-transcription' },
  { title: 'Claude API vs OpenAI API: Developer Guide to Choosing the Right LLM', slug: 'claude-api-vs-openai-api-developer-guide' },
  { title: 'Replit AI: Build and Deploy Apps Without a Backend in 2026', slug: 'replit-ai-build-deploy-apps-review' },
  { title: 'Canva AI Magic Studio: Every Feature Explained with Use Cases', slug: 'canva-ai-magic-studio-features-guide' },
  { title: 'Zapier AI: Automate Repetitive Tasks Without Writing Code', slug: 'zapier-ai-automation-guide-2026' },
  { title: 'Grammarly vs ProWritingAid vs Hemingway: Best AI Writing Assistant?', slug: 'grammarly-vs-prowritingaid-vs-hemingway-comparison' },
  { title: 'Perplexity AI Pages: How to Create AI-Powered Research Documents', slug: 'perplexity-ai-pages-research-documents-guide' },
];

// Generate backdated pubDates spread over past 30 days (not uniform — random gaps)
function generateBackdates(count) {
  const today = new Date('2026-05-22'); // yesterday as latest
  const startDate = new Date('2026-04-20'); // ~33 days ago
  const range = today - startDate;

  // Generate `count` random timestamps within the range, then sort ascending
  const timestamps = Array.from({ length: count }, () =>
    new Date(startDate.getTime() + Math.random() * range)
  ).sort((a, b) => a - b);

  return timestamps.map(d => d.toISOString().split('T')[0]);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getExistingSlugs() {
  try {
    const files = await readdir(POSTS_DIR);
    return new Set(files.map(f => f.replace(/\.mdx?$/, '')));
  } catch {
    return new Set();
  }
}

async function run() {
  console.log('\n=== Ynvesters Seed Script ===');
  console.log(`Generating ${SEED_TOPICS.length} backdated posts...\n`);

  await mkdir(POSTS_DIR, { recursive: true });
  const existingSlugs = await getExistingSlugs();
  const backdates = generateBackdates(SEED_TOPICS.length);

  let success = 0;
  let skipped = 0;

  for (let i = 0; i < SEED_TOPICS.length; i++) {
    const topic = SEED_TOPICS[i];
    const pubDate = backdates[i];

    if (existingSlugs.has(topic.slug)) {
      console.log(`[${i + 1}/${SEED_TOPICS.length}] SKIP (exists): ${topic.slug}`);
      skipped++;
      continue;
    }

    console.log(`[${i + 1}/${SEED_TOPICS.length}] Generating: "${topic.title}"`);
    console.log(`  pubDate: ${pubDate}`);

    try {
      // Fetch image with shorter query
      const imageQuery = topic.title.split(':')[0].replace(/vs/gi, '').trim();
      const imageData = await fetchImage(imageQuery, topic.slug);
      if (imageData) console.log(`  Image: ${imageData.localPath}`);

      // Generate post
      const result = await generatePost(
        { title: topic.title, url: 'https://ynvesters.com', source: 'seed' },
        imageData,
        false
      );

      if (!result.content) {
        console.warn(`  SKIP: No content returned`);
        skipped++;
        continue;
      }

      // Inject correct pubDate into frontmatter
      let content = result.content;
      content = content.replace(
        /^(pubDate:\s*).*$/m,
        `pubDate: ${pubDate}`
      );

      // Quality check
      const wordCount = content.split(/\s+/).length;
      const hasFrontmatter = content.trimStart().startsWith('---');
      const hasConclusion = /##\s*conclusion/i.test(content);

      if (!hasFrontmatter || wordCount < 1200) {
        console.warn(`  SKIP quality gate: frontmatter=${hasFrontmatter}, words=${wordCount}`);
        skipped++;
        continue;
      }

      const filename = `${topic.slug}.mdx`;
      await writeFile(path.join(POSTS_DIR, filename), content, 'utf-8');
      console.log(`  SAVED: ${filename} (~${wordCount} words)`);
      success++;

      // Delay between API calls (avoid rate limits)
      if (i < SEED_TOPICS.length - 1) {
        await sleep(3000);
      }
    } catch (e) {
      console.error(`  ERROR: ${e.message}`);
      skipped++;
    }
  }

  console.log(`\n=== Done: ${success} saved, ${skipped} skipped ===`);
  console.log('\nNext: git add src/content/posts/ public/images/ && git commit && git push');
}

run().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
