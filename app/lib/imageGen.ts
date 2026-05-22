import Anthropic from '@anthropic-ai/sdk';
import { put } from '@vercel/blob';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

type PromptContext = {
  category: string;
  allegation?: string;
  topic?: string;
};

export async function generateImagePrompt(ctx: PromptContext): Promise<string> {
  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 250,
    messages: [{
      role: 'user',
      content: `Write a concise image-generation prompt (under 60 words) for an editorial illustration accompanying a news article about consumer ${ctx.category} issues${ctx.allegation ? ` involving ${ctx.allegation}` : ''}${ctx.topic ? ` (topic: ${ctx.topic})` : ''}.

Strict requirements:
- Generic product or category imagery only — NO specific brand names, logos, or trademarked product designs
- NO recognizable real people; if people appear, they must be unidentifiable (shown from behind, hands only, silhouettes)
- Editorial stock-photo style, soft natural lighting, neutral background
- Suitable for a serious legal news context — no melodrama, no implied harm or accidents
- NO text, words, or numbers in the image
- Photorealistic or clean editorial illustration

Respond with ONLY the image prompt itself. No preamble, no explanation.`
    }],
  });

  const text = message.content[0].type === 'text' ? message.content[0].text : '';
  return text.trim();
}

export async function generateAndStoreImage(prompt: string, key: string): Promise<string> {
  // Call Replicate's Flux Schnell, synchronous mode
  const r = await fetch('https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.REPLICATE_API_TOKEN}`,
      'Content-Type': 'application/json',
      'Prefer': 'wait=60',
    },
    body: JSON.stringify({
      input: {
        prompt,
        aspect_ratio: '4:3',
        output_format: 'jpg',
        output_quality: 85,
        num_outputs: 1,
        num_inference_steps: 4,
      }
    }),
  });

  if (!r.ok) {
    const detail = await r.text();
    throw new Error(`Replicate ${r.status}: ${detail.slice(0, 200)}`);
  }

  const result = await r.json();
  const replicateUrl = Array.isArray(result.output) ? result.output[0] : result.output;
  if (!replicateUrl) throw new Error(`No image URL in Replicate response: ${JSON.stringify(result).slice(0, 200)}`);

  // Download the bytes
  const imgRes = await fetch(replicateUrl);
  if (!imgRes.ok) throw new Error(`Image download failed: ${imgRes.status}`);
  const buffer = await imgRes.arrayBuffer();

  // Persist to Vercel Blob (permanent URL)
  const blob = await put(`${key}.jpg`, buffer, {
    access: 'public',
    contentType: 'image/jpeg',
    addRandomSuffix: false,
    allowOverwrite: true,
  });

  return blob.url;
}