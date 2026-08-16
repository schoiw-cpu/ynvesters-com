# ynvesters.com

Source for **[ynvesters.com](https://ynvesters.com)** — AI tool reviews and pricing breakdowns written for solo creators and freelancers deciding whether a $20/month subscription is worth keeping.

Static site built with Astro, deployed on Cloudflare Pages, with a content pipeline that runs on GitHub Actions.

## Stack

| Layer | Choice |
|---|---|
| Site | Astro + MDX, static output |
| Hosting | Cloudflare Pages |
| Content generation | Claude API |
| Images | Locally rendered HTML → Chrome screenshot (no stock photos) |
| Scheduling | GitHub Actions cron |

## Content pipeline

`scripts/orchestrator.mjs` runs the whole chain:

1. **Topic discovery** (`discover-topics.mjs`) — a curated buyer-intent pool first, RSS feeds only as a fallback. Topics are deduped against published posts on a canonical key (year stripped, stopwords dropped, tokens sorted) rather than an exact slug match, so a reworded title can't ship the same article twice.
2. **Trend radar** (`trend-radar.mjs`) — when a frontier lab ships something or an AI story crosses 300 points on Hacker News, the day's post rides it. The topic carries a grounding excerpt from the announcement so the generator can't invent specs for a product outside its training data.
3. **Image generation** (`generate-hero.mjs`, `generate-cards.mjs`) — hero cards and in-article stat/comparison/verdict cards are rendered from HTML through local Chrome. Nothing is pulled from a stock library.
4. **Generation + quality gate** (`generate-post.mjs`) — drafts are rejected and retried below a word count and quality score floor.
5. **Sanitize** — imports of components that don't exist are stripped before the file is written. One invented import breaks the whole Astro build, which silently freezes deploys for every later post.
6. **Build verification** — CI builds the site *before* committing. Content that can't deploy never lands on `main`.

## Editorial rules encoded in the pipeline

- **No invented experience.** Posts state what a claim rests on — documented features, published pricing, reported user experience — rather than asserting hands-on testing that didn't happen. The handful of posts that do show screenshots are the ones where a tool was genuinely used.
- **Verdicts, not fence-sitting.** Every comparison names a winner and says who should skip both.
- **Evergreen URLs.** Slugs never carry a year; titles may, where the year is the point.
- **Real user voices** (`social-harvest.mjs`) — quotes come from actual Reddit threads, filtered so a tool name like "Gamma" can't pull in unrelated subreddits. Never fabricated.

## Local development

```bash
npm install
npm run dev            # local server
npm run build          # static build into dist/

node scripts/orchestrator.mjs --dry-run    # pipeline without writing
node scripts/orchestrator.mjs              # generate and save today's post
```

Environment variables live in `.env` (see `.env.example`).

## Status

The daily cron is currently paused. The bottleneck is discovery, not supply — most published pages sit in Search Console's "Discovered – currently not indexed" bucket, so adding posts lengthens a queue instead of shortening it.
