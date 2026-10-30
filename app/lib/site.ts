// Single source of truth for site identity, owner info, and category slugs.
// Every page imports from here so a change in one place updates everywhere.

export const SITE_URL = 'https://www.classactiondaily.com';
export const SITE_NAME = 'ClassActionDaily';
export const SITE_TAGLINE = 'Consumer Class Actions Filed in U.S. Federal Courts';
export const SITE_DESCRIPTION =
  'Plain-English summaries of every consumer class action filed in U.S. federal district courts, updated daily from CourtListener public records. Published by Access Law Group.';

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

export function formatDate(d: string | Date): string {
  return new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}
