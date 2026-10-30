import Anthropic from '@anthropic-ai/sdk';
import { put } from '@vercel/blob';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

// Which Replicate model renders the picture. Override with the
// REPLICATE_IMAGE_MODEL env var if you want to trade quality for cost:
//   black-forest-labs/flux-1.1-pro  ~ $0.040/image  photorealistic, best detail (default)
//   black-forest-labs/flux-dev      ~ $0.025/image  very good
//   black-forest-labs/flux-schnell  ~ $0.003/image  fast, flat, what the site used before
const IMAGE_MODEL = process.env.REPLICATE_IMAGE_MODEL || 'black-forest-labs/flux-1.1-pro';

// Appended to every prompt in code, so the style is consistent no matter what
// the prompt-writer produces. Flux has no negative prompts, so this is all
// positive description of the look we want.
const STYLE_SUFFIX =
  'Photorealistic editorial photograph for a serious news publication. Shot on a 35mm full-frame camera, 50mm lens, natural soft daylight, shallow depth of field, muted professional color palette, realistic textures and materials, high detail, clean composition with the subject slightly off-center. Documentary stock-photo realism, not an illustration.';

export type PromptContext = {
  /** Plain-English case summary. This is the main input for relevance. */
  summary?: string;
  /** Clean defendant name (used only to understand the industry; never depicted). */
  defendant?: string;
  /** Case caption, e.g. "Delacruz v. Da-Vinci Paint Company, Inc." */
  caseName?: string;
  category: string;
  allegation?: string;
  /** For investigations: the topic/title. */
  topic?: string;
};

/**
 * Turns case details into a concrete, scene-level image prompt that depicts the
 * subject matter of the case (the product, service, or setting) without naming
 * or implying anything about the specific company.
 */
export async function generateImagePrompt(ctx: PromptContext): Promise<string> {
  const facts = [
    ctx.caseName ? `Case: ${ctx.caseName}` : null,
    ctx.defendant ? `Company sued (for context only — do NOT depict its logo, trade dress, packaging, or anything identifying it): ${ctx.defendant}` : null,
    `Category: ${ctx.category}`,
    ctx.allegation ? `Type of claim: ${ctx.allegation}` : null,
    ctx.topic ? `Topic: ${ctx.topic}` : null,
    ctx.summary ? `What the case is about:\n${ctx.summary}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    messages: [
      {
        role: 'user',
        content: `You write image prompts for the photo that accompanies a legal news story. Read the case details and design ONE realistic photograph that a news photo editor would choose for this story.

${facts}

How to pick the scene:
1. Identify the concrete thing the case is actually about — the product, the service, the place, the activity. A paint company → paint cans and brushes. A mortgage lender → house keys on closing papers, or a suburban front door. A contact-lens retailer accused of wiretapping its website → a laptop showing a blurred storefront page beside a contact-lens case. A debt collector → an unopened envelope on a kitchen table. An ADA website case → hands on a keyboard with a screen reader visible, or a laptop beside an item the store sells. A securities case → a stock chart on a monitor in an office.
2. Show that thing in a neutral, everyday setting. Think "the product on a counter," "the service being used," "the place where this happens."
3. Keep it specific to THIS case. Do not fall back to generic "consumer" imagery such as receipts, shopping carts, gavels, scales of justice, courthouses, or piles of money unless the case is literally about those things.

Hard rules — the picture will be published next to the company's name, so:
- No brand names, logos, trademarks, slogans, recognizable packaging, store interiors, or product designs that identify a real company. Generic versions only.
- No readable text, numbers, labels, or signs anywhere in the image.
- No identifiable people: no faces. Hands, backs, silhouettes, or figures out of focus are fine.
- Neutral tone. Nothing that implies the company did something wrong or that anyone was harmed: no spills, injuries, broken products, angry people, warning symbols, or red flags. Just the subject matter, shown plainly.
- No courtroom, gavel, legal-document, or "justice" clichés.

Output: one paragraph, 40–70 words, describing only what is in the frame — subject, setting, arrangement, lighting. Start with the main subject. Do not mention the case, the company, or the law. Do not use the words "illustration," "cartoon," "vector," "flat," "icon," or "3D render." Respond with the prompt text only.`,
      },
    ],
  });

  const text = message.content[0].type === 'text' ? message.content[0].text.trim() : '';
  const scene = text.replace(/^["'`]+|["'`]+$/g, '').trim();
  if (!scene) throw new Error('Empty image prompt from model');
  return `${scene} ${STYLE_SUFFIX}`;
}

function buildInput(prompt: string) {
  const base: Record<string, unknown> = {
    prompt,
    aspect_ratio: '4:3',
    output_format: 'jpg',
    output_quality: 88,
  };
  if (IMAGE_MODEL.includes('flux-1.1-pro') || IMAGE_MODEL.includes('flux-pro')) {
    return { ...base, prompt_upsampling: false, safety_tolerance: 2 };
  }
  if (IMAGE_MODEL.includes('flux-dev')) {
    return { ...base, num_inference_steps: 28, guidance: 3, num_outputs: 1 };
  }
  // schnell or anything else
  return { ...base, num_inference_steps: 4, num_outputs: 1 };
}

/**
 * Renders the prompt with Replicate and stores the JPEG in Vercel Blob.
 * Returns the permanent public URL.
 */
export async function generateAndStoreImage(prompt: string, key: string): Promise<string> {
  const r = await fetch(`https://api.replicate.com/v1/models/${IMAGE_MODEL}/predictions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.REPLICATE_API_TOKEN}`,
      'Content-Type': 'application/json',
      Prefer: 'wait=60',
    },
    body: JSON.stringify({ input: buildInput(prompt) }),
  });

  if (!r.ok) {
    const detail = await r.text();
    throw new Error(`Replicate ${r.status}: ${detail.slice(0, 200)}`);
  }

  let result = await r.json();

  // If Replicate returned before the render finished, poll until it does.
  let polls = 0;
  while (result && (result.status === 'starting' || result.status === 'processing') && result.urls?.get && polls < 30) {
    await new Promise((res) => setTimeout(res, 2000));
    const p = await fetch(result.urls.get, {
      headers: { Authorization: `Bearer ${process.env.REPLICATE_API_TOKEN}` },
    });
    if (!p.ok) throw new Error(`Replicate poll ${p.status}`);
    result = await p.json();
    polls++;
  }
  if (result?.status === 'failed' || result?.status === 'canceled') {
    throw new Error(`Replicate ${result.status}: ${String(result.error ?? '').slice(0, 200)}`);
  }

  const replicateUrl = Array.isArray(result.output) ? result.output[0] : result.output;
  if (!replicateUrl) throw new Error(`No image URL in Replicate response: ${JSON.stringify(result).slice(0, 200)}`);

  const imgRes = await fetch(replicateUrl);
  if (!imgRes.ok) throw new Error(`Image download failed: ${imgRes.status}`);
  const buffer = await imgRes.arrayBuffer();

  const blob = await put(`${key}.jpg`, buffer, {
    access: 'public',
    contentType: 'image/jpeg',
    addRandomSuffix: false,
    allowOverwrite: true,
  });

  return blob.url;
}

/** Marker baked into regenerated image keys so the backfill knows what's done. */
export const IMAGE_VERSION = 'v2';
