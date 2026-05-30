import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), '../.env') });

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const STYLE_TEMPLATES = [
  'in-depth review',
  'comparison guide (vs alternatives)',
  'how-to tutorial',
  'news analysis',
  'listicle (top features)',
  'Q&A format',
  'beginner getting-started guide',
  'expert use-case deep-dive',
  'pricing breakdown',
  'pros and cons analysis',
];

const SYSTEM_PROMPT = `You are a senior technology writer at Ynvesters, an AI tools review site.
Your writing is clear, specific, and evidence-based. You cite sources inline (links in markdown).
You never make up statistics. You always include real pricing, real features, and real limitations.
You write for busy professionals who want actionable information, not marketing copy.

INTRODUCTION STYLE — this is critical:
- Open with 1–2 sentences that name a specific, relatable pain point the reader has likely felt personally.
  Good: "If you've ever merged a PR only to realize the 'working' code was just verbose AI filler, you know the frustration."
  Good: "Spent hours debugging a tool that looked polished in the demo but fell apart the moment you strayed from the happy path?"
  Bad: "In today's rapidly evolving AI landscape..." (generic, no empathy)
  Bad: "Artificial intelligence is transforming the way we work." (news-article opener)
- The first paragraph should make the reader feel seen — like a colleague who hit the same wall is talking to them.
- Use "you" and "your" naturally. First-person ("I've", "we've") is fine when grounding a specific observation.
- Do NOT open with a definition of the tool. Do NOT open with industry statistics.

Output must be valid MDX (Markdown with JSX support) — no raw HTML tags outside of MDX components.
CRITICAL: Output ONLY the raw MDX content. Do NOT wrap in code fences (\`\`\`mdx or \`\`\`). Start directly with the --- frontmatter delimiter.`;

function pickTemplate() {
  return STYLE_TEMPLATES[Math.floor(Math.random() * STYLE_TEMPLATES.length)];
}

function randomWordCount() {
  // 1500–2200 words, in 100-word steps
  return 1500 + Math.floor(Math.random() * 8) * 100;
}

export async function generatePost(topic, imageData = null, dryRun = false) {
  const template = pickTemplate();
  const targetWords = randomWordCount();

  const frontmatterNote = imageData
    ? `Hero image: path="${imageData.localPath}", alt="${imageData.alt}", credit="${imageData.credit}", creditUrl="${imageData.creditUrl}"`
    : 'No hero image available.';

  const prompt = `Write a ${template} article about: "${topic.title}"
Source URL (use as reference, do not reproduce verbatim): ${topic.url}

Style: ${template}
Target length: ~${targetWords} words
${frontmatterNote}

Requirements:
1. Start with YAML frontmatter (between --- markers) with these exact fields:
   - title: (compelling, specific, SEO-friendly)
   - description: (150–160 chars, includes main keyword)
   - pubDate: ${new Date().toISOString().split('T')[0]}
   - category: "AI Tools"
   - tags: [array of 3–5 relevant tags]
   - author: "AI Editorial Team"
   ${imageData ? `- heroImage: "${imageData.localPath}"
   - heroImageAlt: "${imageData.alt}"
   - heroImageCredit: "${imageData.credit}"
   - heroImageUrl: "${imageData.creditUrl}"` : ''}

2. After frontmatter, write the article body in Markdown.
3. INTRODUCTION (first paragraph after frontmatter): Start with the reader's pain point or a vivid scenario — not a definition or statistic. Make them nod before you name the tool.
4. Include at least 3 external links to authoritative sources (official docs, GitHub, Wikipedia, etc.)
5. Include a comparison table if applicable.
6. End with a "## Conclusion" section with a clear recommendation.
7. Do NOT include any <script> tags or raw HTML.
8. Do NOT mention that the article was AI-generated.

Output ONLY the MDX content (frontmatter + body), nothing else.`;

  if (dryRun) {
    console.log('[generate] DRY RUN — prompt preview (first 500 chars):');
    console.log(prompt.slice(0, 500));
    return { dryRun: true, template, targetWords };
  }

  console.log(`[generate] Template: "${template}", ~${targetWords} words`);

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
    system: SYSTEM_PROMPT,
  });

  let content = response.content[0]?.text ?? '';

  // Strip markdown code fences if Claude wrapped output (e.g., ```mdx ... ```)
  const fenceMatch = content.match(/^```(?:mdx|markdown|md)?\s*\n([\s\S]*?)\n```\s*$/);
  if (fenceMatch) {
    content = fenceMatch[1];
  }

  const wordCount = content.split(/\s+/).length;

  console.log(`[generate] Generated ~${wordCount} words`);

  return { content, wordCount, template, inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens };
}
