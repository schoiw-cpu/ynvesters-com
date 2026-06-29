import { fetchImage } from './fetch-images.mjs';
import { readFile, writeFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const POSTS_DIR = path.join(__dirname, '../src/content/posts');

const missingImages = [
  { file: 'gamma-ai-presentation-tool-review.mdx', query: 'AI presentation slides design' },
  { file: 'elevenlabs-voice-ai-review-tutorial.mdx', query: 'voice cloning audio technology' },
  { file: 'notion-ai-features-complete-guide.mdx', query: 'productivity notes workspace' },
  { file: 'otter-ai-vs-fireflies-meeting-transcription.mdx', query: 'meeting transcription audio recording' },
  { file: 'perplexity-ai-vs-google-search-comparison.mdx', query: 'AI search engine technology' },
  { file: 'speakz-ai-ai-dubbing-tool-for-watching-foreign-language-videos.mdx', query: 'video dubbing language translation' },
  { file: 'perplexity-ai-pages-research-documents-guide.mdx', query: 'AI research documents knowledge' },
  { file: 'zapier-ai-automation-guide-2026.mdx', query: 'workflow automation technology' },
];

for (const { file, query } of missingImages) {
  const filePath = path.join(POSTS_DIR, file);
  const slug = file.replace('.mdx', '');

  console.log(`Processing: ${file}`);
  const image = await fetchImage(query, slug);

  if (!image) {
    console.warn(`  Skipped (no image found)`);
    continue;
  }

  let content = await readFile(filePath, 'utf-8');

  // Insert heroImage fields after the first '---' block opener
  const frontmatterEnd = content.indexOf('---', 3);
  const insertion = `heroImage: "${image.localPath}"
heroImageAlt: "${image.alt}"
heroImageCredit: "${image.credit}"
heroImageUrl: "${image.creditUrl}"
`;

  content =
    content.slice(0, frontmatterEnd) +
    insertion +
    content.slice(frontmatterEnd);

  await writeFile(filePath, content, 'utf-8');
  console.log(`  ✅ Added: ${image.localPath}`);
}

console.log('\nDone. All missing hero images processed.');
