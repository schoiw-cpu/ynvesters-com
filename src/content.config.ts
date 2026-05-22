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
    author: z.string().default('AI Editorial Team'),
    wordCount: z.number().optional(),
    featured: z.boolean().default(false),
  }),
});

export const collections = { posts };
