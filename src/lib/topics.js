// Shared topic taxonomy — the same clusters RelatedPosts uses, exposed so topic
// hub pages and related-links stay consistent. Each topic matches keyword
// fragments against a post's lowercased title + tags + slug (word-boundary).

export const TOPICS = {
  writing: ['writing', 'copywriting', 'copy.ai', 'jasper', 'writesonic', 'grammarly', 'hemingway', 'prowritingaid', 'blogging', 'blogger', 'content creation', 'content marketing', 'cold email', 'email outreach', 'gemini spark'],
  coding: ['code editor', 'coding', 'developer', 'cursor', 'copilot', 'codeium', 'windsurf', 'replit', 'github'],
  video: ['video', 'runway', 'luma', 'sora', 'synthesia', 'heygen', 'avatar', 'dubbing'],
  image: ['image generat', 'image upscal', 'midjourney', 'dall-e', 'dalle', 'ideogram', 'stable diffusion', 'krea', 'magnific', 'canva', 'figma', 'framer', 'photoroom', 'ai art', 'ai design'],
  audio: ['voice', 'audio', 'elevenlabs', 'playht', 'descript', 'podcast', 'music', 'suno', 'udio', 'transcription', 'otter', 'fireflies', 'speakz', 'text-to-speech', 'text to speech'],
  search: ['perplexity', 'ai search', 'ai overview', 'search comparison', 'search engine', 'chatgpt plus'],
  models: ['claude 3', 'gpt-4', 'gpt-4o', 'llm', 'ai model', 'sonnet', 'claude api', 'openai api', 'gemini 2'],
  productivity: ['notion', 'project management', 'linear', 'jira', 'clickup', 'zapier', 'workflow automation', 'airtable', 'task automation', 'business automation'],
  agents: ['ai agent', 'agentic', 'multi-agent', 'orchestration', 'sales automation', 'revenue ops'],
};

export const TOPIC_LABELS = {
  writing: 'AI Writing',
  coding: 'AI Coding',
  video: 'AI Video',
  image: 'AI Image & Design',
  audio: 'AI Voice & Audio',
  search: 'AI Search',
  models: 'AI Models & APIs',
  productivity: 'AI Productivity',
  agents: 'AI Agents',
};

const esc = (k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function textTopics(text) {
  const t = text.toLowerCase();
  const found = [];
  for (const [topic, keys] of Object.entries(TOPICS)) {
    if (keys.some((k) => new RegExp(`\\b${esc(k)}`).test(t))) found.push(topic);
  }
  return found;
}

// Topics a post belongs to (from its title + tags + slug).
export function postTopics(post) {
  const text = `${post.data.title} ${(post.data.tags ?? []).join(' ')} ${post.id}`;
  return textTopics(text);
}
