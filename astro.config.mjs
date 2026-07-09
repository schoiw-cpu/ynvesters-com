// @ts-check
import { defineConfig } from 'astro/config';
import { readdirSync, readFileSync } from 'node:fs';

import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';

// Keep soft-retired (noindex) posts out of the sitemap — advertising thin pages
// to Google/AdSense reviewers undercuts the "every page is valuable" signal.
const POSTS_DIR = new URL('./src/content/posts/', import.meta.url);
const noindexUrls = new Set(
  readdirSync(POSTS_DIR)
    .filter((f) => /\.mdx?$/.test(f))
    .filter((f) => /^---[\s\S]*?\bnoindex:\s*true/.test(readFileSync(new URL(f, POSTS_DIR), 'utf-8')))
    .map((f) => `https://ynvesters.com/posts/${f.replace(/\.mdx?$/, '')}/`)
);

export default defineConfig({
  site: 'https://ynvesters.com',
  integrations: [
    mdx(),
    sitemap({ filter: (page) => !noindexUrls.has(page) }),
  ],
});
