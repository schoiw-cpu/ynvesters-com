import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync, readdirSync, readFileSync } from 'node:fs';

dotenv.config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), '../.env') });

const SIGNALS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../data/social-signals');

// Real Reddit user quotes, harvested in-session (see social-harvest.mjs) and
// committed as JSON. If the topic names a tool we have signals for, feed the
// verbatim quotes so the article can include a grounded "What Real Users Say"
// section. The generator may use ONLY these quotes — never invent sentiment.
function buildSocialBlock(title) {
  if (!existsSync(SIGNALS_DIR)) return '';
  const t = title.toLowerCase();
  const matched = [];
  for (const file of readdirSync(SIGNALS_DIR)) {
    if (!file.endsWith('.json')) continue;
    let data;
    try { data = JSON.parse(readFileSync(path.join(SIGNALS_DIR, file), 'utf-8')); } catch { continue; }
    const main = (data.tool ?? '').toLowerCase().replace(/\s*ai\s*$/, '').trim();
    if (main && t.includes(main)) matched.push(data);
  }
  if (matched.length === 0) return '';

  const lines = matched.flatMap((d) =>
    (d.quotes ?? []).slice(0, 4).map((q) => `- (${q.subreddit}, ${q.score} upvotes) "${q.text}"`)
  ).slice(0, 6);
  if (lines.length === 0) return '';

  return `
REAL REDDIT USER QUOTES (verbatim, from public discussions harvested for this article's tools):
${lines.join('\n')}

Use these to write a "## What Real Users Say" section (3–5 sentences). Quote or tightly
paraphrase 3–4 of them and attribute to the subreddit ("one r/cursor user notes…"). You may
use ONLY the quotes above — do NOT invent additional quotes, users, or sentiment. If a quote
is negative, include it: balance builds trust. Never use a Reddit username, only the subreddit.
`;
}

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

FACT DISCIPLINE — violations make the article worthless:
- Never invent specific numbers (prices, benchmark scores, user counts, dates). If you are not
  confident a number is real, describe it qualitatively and tell readers to check the official
  pricing page for current figures.
- Never fabricate quotes, case studies, or "studies show" claims.
- When comparing tools, only state differences you are confident about; frame uncertain points
  as "verify on their site" rather than guessing.
- Opinionated titles ("I canceled X", "X is overrated") are our editorial voice — deliver the
  verdict from the editorial "we" based on verifiable product facts (features, pricing, limits).
  Do NOT invent fake personal anecdotes with specific made-up numbers ("my invoice was $47.32",
  "I lost 3 clients"). A strong verdict argued from real product facts beats a fabricated story.

VOICE — every article takes a position:
- Write for one reader: a solo creator/freelancer paying $20–60/month for AI subscriptions,
  wondering every month whether they're worth it.
- End with a clear verdict: who should pay, who shouldn't, and what to do instead. Never
  conclude with "it depends on your needs" — that sentence is banned.

YEAR LABELS — avoid self-dating evergreen content:
- Concept / definition / how-to posts ("What is an AI agent", "How RAG works"): put NO year
  in the title. These are evergreen and a year only makes them look stale.
- Comparison / pricing / "best X" posts: a year in the title is fine and helps CTR — but
  write it so it reads as "current," and keep claims verifiable so it can be refreshed yearly.
- News / launch posts: year or date in the title is fine.
- The URL slug never contains a year (handled automatically) — so the title can carry the
  year without dating the permanent URL.

LEGAL SAFETY — strong verdicts, zero legal exposure. The rule: opinions are protected,
false statements of fact are not. So:
- Frame every verdict as editorial opinion grounded in true, verifiable facts:
  "At $39/month for features X offers at $20, we think it's overpriced" — legally safe.
  "X rips off its customers" — never write this.
- NEVER accuse a company of fraud, scams, lying, stealing, deception, or illegal conduct,
  and never characterize a company's INTENT ("they deliberately hide fees"). Describe the
  observable fact instead ("the fee appears only at checkout").
- Every negative factual claim must be verifiable from official sources (pricing pages,
  docs, changelogs) at publication time. If you can't verify it, don't state it.
- Signal opinion explicitly in verdicts: "our take", "we think", "in our testing" —
  these markers matter both editorially and legally.

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

// Templates honest for a product announced <48h ago (no hands-on access yet).
// "in-depth review" or "how-to tutorial" would force fabricated experience.
const GROUNDED_TEMPLATES = [
  'news analysis',
  'Q&A format',
  'pricing breakdown',
  'comparison guide (vs alternatives)',
];

function pickTemplate(grounded = false) {
  const pool = grounded ? GROUNDED_TEMPLATES : STYLE_TEMPLATES;
  return pool[Math.floor(Math.random() * pool.length)];
}

function randomWordCount() {
  // 1500–2200 words, in 100-word steps
  return 1500 + Math.floor(Math.random() * 8) * 100;
}

export async function generatePost(topic, imageData = null, dryRun = false) {
  const template = pickTemplate(Boolean(topic.grounding));
  const targetWords = randomWordCount();

  const frontmatterNote = imageData
    ? `Hero image: path="${imageData.localPath}", alt="${imageData.alt}"${imageData.credit ? `, credit="${imageData.credit}", creditUrl="${imageData.creditUrl}"` : ' (self-generated branded card — no credit fields needed)'}`
    : 'No hero image available.';

  // Trend-radar topics cover just-announced products that are NOT in training
  // data — without grounding, the model would confidently invent specs/pricing.
  const groundingBlock = topic.grounding
    ? `
CRITICAL — THIS COVERS A JUST-ANNOUNCED PRODUCT (announced within the last 48 hours).
Your training data does NOT include it. Anti-hallucination rules for this article:
1. Every specific factual claim (features, specs, pricing, availability, dates) must come
   from the SOURCE EXCERPT below. Do not use "remembered" details about this product.
2. If a detail readers will want (e.g., pricing) is NOT in the excerpt, explicitly write that
   it has not been announced yet — that honesty is valuable content, not a weakness.
3. Attribute facts naturally: "according to the announcement", "the company says".
4. Link to the source announcement (${topic.url}) early in the article.
5. General background about the COMPANY or the CATEGORY from your knowledge is fine —
   just not unverified specifics about this new product.

SOURCE EXCERPT (announcement: "${topic.sourceTitle ?? topic.title}"):
"""
${topic.grounding}
"""
`
    : '';

  const socialBlock = buildSocialBlock(topic.title);

  const prompt = `Write a ${template} article about: "${topic.title}"
Source URL (use as reference, do not reproduce verbatim): ${topic.url}
${groundingBlock}${socialBlock}
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
   - author: "Ynvesters"
   ${imageData ? `- heroImage: "${imageData.localPath}"
   - heroImageAlt: "${imageData.alt}"${imageData.credit ? `
   - heroImageCredit: "${imageData.credit}"
   - heroImageUrl: "${imageData.creditUrl}"` : ''}` : ''}
   - keyTakeaways: a YAML list of 3–4 self-contained bullet strings that summarize
     the verdict/answer — each must make sense on its own with no surrounding context
     (this is the passage AI engines quote). State the actual conclusion, not "this
     article covers X". Example item: "Writesonic at $20/mo is the best value for solo
     creators; Jasper's $49 only pays off with a team behind it."
   - faq: a YAML list of 4 items, each "- q: ...\\n  a: ..." — real questions a buyer
     searches ("Is X worth it?", "X vs Y?", "How much does X cost?") with a concise,
     self-contained 1–3 sentence answer grounded in the article's facts.

2. After frontmatter, write the article body in Markdown. Do NOT repeat the
   keyTakeaways or the FAQ inside the body — they render automatically from
   frontmatter (a summary box near the top and an FAQ block at the end).
3. INTRODUCTION (first paragraph after frontmatter): Start with the reader's pain point or a vivid scenario — not a definition or statistic. Make them nod before you name the tool.
4. Include at least 3 external links to authoritative sources (official docs, GitHub, Wikipedia, etc.)
5. Include a comparison table if applicable.
6. End with a "## Conclusion" section with a clear recommendation.
7. Do NOT include any <script> tags or raw HTML.
8. Do NOT mention that the article was AI-generated.
9. INFO CARDS (include 1–2 where they fit): insert a card directive on its own line
   right after the paragraph that discusses the data. Formats (exact syntax):
   {/*CARD:stat|a=BIG NUMBER|b=short label|c=one-line context*/}
   {/*CARD:vs|t=comparison title|a=Winner name|b=winner one-liner|c=Runner-up name|d=runner-up one-liner*/}
   {/*CARD:verdict|a=one-sentence verdict|b=short qualifier*/}
   Rules: values must be facts ALREADY stated in your article; plain text only —
   no "|" or "*" characters inside values; keep each value under 60 characters.
   A stat card needs a genuinely striking number; a verdict card belongs near the conclusion.

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
