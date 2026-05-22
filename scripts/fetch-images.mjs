import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { mkdir, writeFile } from 'fs/promises';

dotenv.config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), '../.env') });

const ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY;
const IMAGES_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../public/images');

export async function fetchImage(query, slug) {
  if (!ACCESS_KEY) {
    console.warn('[images] No Unsplash key, skipping image fetch.');
    return null;
  }

  try {
    await mkdir(IMAGES_DIR, { recursive: true });

    const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=5&orientation=landscape`;
    const res = await fetch(url, {
      headers: { Authorization: `Client-ID ${ACCESS_KEY}` },
    });

    if (!res.ok) {
      console.warn(`[images] Unsplash API error: ${res.status}`);
      return null;
    }

    const data = await res.json();
    let results = data.results ?? [];

    // Fallback to generic tech queries if specific tool name returns nothing
    if (results.length === 0) {
      const fallbacks = ['artificial intelligence technology', 'software productivity', 'computer technology'];
      for (const fallback of fallbacks) {
        const fbRes = await fetch(
          `https://api.unsplash.com/search/photos?query=${encodeURIComponent(fallback)}&per_page=10&orientation=landscape`,
          { headers: { Authorization: `Client-ID ${ACCESS_KEY}` } }
        );
        if (fbRes.ok) {
          const fbData = await fbRes.json();
          results = fbData.results ?? [];
          if (results.length > 0) break;
        }
      }
      if (results.length === 0) {
        console.warn(`[images] No results even with fallback for: "${query}"`);
        return null;
      }
    }

    // Pick a random one from top 5 (avoid repetition)
    const photo = results[Math.floor(Math.random() * results.length)];
    const imageUrl = photo.urls.regular;
    const ext = 'jpg';
    const filename = `${slug}.${ext}`;
    const localPath = path.join(IMAGES_DIR, filename);

    // Download and save
    const imgRes = await fetch(imageUrl);
    const buffer = Buffer.from(await imgRes.arrayBuffer());
    await writeFile(localPath, buffer);

    // Unsplash attribution requirement
    return {
      localPath: `/images/${filename}`,
      alt: photo.alt_description ?? query,
      credit: photo.user.name,
      creditUrl: photo.user.links.html + '?utm_source=ynvesters&utm_medium=referral',
      unsplashUrl: photo.links.html + '?utm_source=ynvesters&utm_medium=referral',
    };
  } catch (e) {
    console.warn('[images] Fetch failed:', e.message);
    return null;
  }
}
