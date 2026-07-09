import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const posts = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/posts' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    heroImage: z.string().optional(),
    heroImageAlt: z.string().optional(),
    heroImageCredit: z.string().optional(),
    heroImageUrl: z.string().optional(),
    category: z.string().default('AI Tools'),
    tags: z.array(z.string()).default([]),
    author: z.string().default('Ynvesters'),
    wordCount: z.number().optional(),
    featured: z.boolean().default(false),
    // Soft-retire low-value posts (zero search demand, no affiliate fit) without
    // deleting them: noindexed, hidden from listings and related links.
    noindex: z.boolean().default(false),
    // GEO (AI-citation) structure. keyTakeaways renders a self-contained summary
    // box near the top — the passage AI engines lift most readily. faq renders a
    // visible Q&A block AND emits FAQPage JSON-LD for rich results + extraction.
    keyTakeaways: z.array(z.string()).default([]),
    faq: z.array(z.object({ q: z.string(), a: z.string() })).default([]),
  }),
});

export const collections = { posts };
