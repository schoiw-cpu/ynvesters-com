import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';

export async function GET(context) {
  const posts = (await getCollection('posts')).filter(p => !p.data.noindex);
  return rss({
    title: 'Ynvesters – AI Tools Discovery & Comparison',
    description: 'Daily reviews, comparisons, and guides on the latest AI tools.',
    site: context.site,
    items: posts
      .sort((a, b) => b.data.pubDate.getTime() - a.data.pubDate.getTime())
      .slice(0, 20)
      .map((post) => ({
        title: post.data.title,
        pubDate: post.data.pubDate,
        description: post.data.description,
        link: `/posts/${post.id}/`,
      })),
    customData: '<language>en-us</language>',
  });
}
