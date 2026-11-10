// Single source of truth for site identity, owner info, and category slugs.
// Every page imports from here so a change in one place updates everywhere.

export const SITE_URL = 'https://www.classactiondaily.com';
export const SITE_NAME = 'ClassActionDaily';
export const SITE_TAGLINE = 'Consumer Class Actions Filed in U.S. Courts';
export const SITE_DESCRIPTION =
  'Plain-English summaries of newly filed consumer class actions in U.S. courts, updated daily from CourtListener, state court filings, and other public sources. Published by Access Law Group.';

export const OWNER = {
  name: 'Bogdan Enica, Esq.',
  firm: 'Access Law Group',
  barFlorida: '101934',
  admissions: [
    'Florida (Bar No. 101934)',
    'New York',
    'New Jersey',
    'District of Columbia (inactive)',
  ],
  address: {
    street: '20283 State Road 7',
    city: 'Boca Raton',
    state: 'FL',
    zip: '33498',
    country: 'US',
  },
  email: 'bogdan@uscaclassaction.com',
  phoneDisplay: '(305) 306-4989',
  phoneE164: '+13053064989',
};

export const OWNER_ADDRESS_LINE = `${OWNER.address.street}, ${OWNER.address.city}, ${OWNER.address.state} ${OWNER.address.zip}`;

// The fixed set of categories the ingest job can assign. Keep in sync with
// the prompt in app/api/cron/ingest/route.ts.
export const CATEGORIES = [
  'Food & beverage',
  'Consumer electronics',
  'Subscription services',
  'Personal care',
  'Automotive',
  'Retail',
  'Apparel',
  'Financial products',
  'Home appliances',
  'Other',
] as const;

export type Category = (typeof CATEGORIES)[number];

export function categorySlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function categoryFromSlug(slug: string): Category | null {
  return (CATEGORIES.find((c) => categorySlug(c) === slug) as Category | undefined) ?? null;
}

// Trim a summary to a meta-description-sized snippet without cutting mid-word.
export function snippet(text: string | null | undefined, max = 155): string {
  if (!text) return '';
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > 80 ? cut.slice(0, lastSpace) : cut).trimEnd() + '…';
}

// --- Page titles -----------------------------------------------------------
// Search engines display roughly 60 to 65 characters of a <title>; Bing flags
// anything longer. The layout appends " | ClassActionDaily" (19 chars) via its
// title template, so a templated title body should stay under ~44 chars.
// When even the bare case name is longer than that, we drop the brand suffix
// (absolute title) and truncate at a word boundary instead.

export const TITLE_MAX = 63;
const BRAND_SUFFIX_LEN = ` | ${SITE_NAME}`.length;

function truncateWords(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const sp = cut.lastIndexOf(' ');
  return (sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,.;:–—-]+$/, '') + '…';
}

/**
 * Returns a Next.js `title` value: either a string (brand suffix added by the
 * layout template) or `{ absolute }` when the brand wouldn't fit.
 * Pass candidates from most to least descriptive.
 */
export function fitTitle(...candidates: (string | null | undefined)[]): string | { absolute: string } {
  const list = candidates.filter((c): c is string => Boolean(c && c.trim())).map((c) => c.trim());
  for (const c of list) {
    if (c.length + BRAND_SUFFIX_LEN <= TITLE_MAX) return c;
  }
  // Nothing fits with the brand; use the shortest candidate without it.
  const last = list[list.length - 1] ?? SITE_NAME;
  return { absolute: truncateWords(last, TITLE_MAX) };
}

export function caseTitle(caseName: string, defendant?: string | null) {
  return fitTitle(
    defendant ? `${caseName}: ${defendant} class action` : null,
    `${caseName} class action`,
    caseName,
  );
}

export function formatDate(d: string | Date): string {
  return new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}
