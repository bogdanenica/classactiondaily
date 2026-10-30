'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

type Props = {
  categories: readonly string[];
  selected: string[]; // empty array = all categories
  days: '7' | '30' | 'all';
  basePath?: string; // defaults to "/"
};

// Client-side filter sidebar. It does NOT hold state; it just rewrites the URL
// and lets the server component re-render with the new searchParams.
export default function CaseFilters({ categories, selected, days, basePath = '/' }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function navigate(nextSelected: string[], nextDays: string) {
    const params = new URLSearchParams();
    // Only write "category" when it's a real subset; empty = all (cleaner URLs).
    if (nextSelected.length > 0 && nextSelected.length < categories.length) {
      for (const c of nextSelected) params.append('category', c);
    }
    if (nextDays !== 'all') params.set('days', nextDays);
    const qs = params.toString();
    startTransition(() => {
      router.push(qs ? `${basePath}?${qs}` : basePath, { scroll: false });
    });
  }

  const allChecked = selected.length === 0;

  function toggleCategory(cat: string) {
    const current = allChecked ? [...categories] : [...selected];
    const idx = current.indexOf(cat);
    if (idx >= 0) current.splice(idx, 1);
    else current.push(cat);
    // If the user unchecks everything, fall back to "all" rather than showing nothing.
    navigate(current.length === 0 ? [] : current, days);
  }

  function isChecked(cat: string) {
    return allChecked || selected.includes(cat);
  }

  return (
    <aside className="filters" aria-busy={isPending}>
      <div className="filter-group">
        <h3>Category</h3>
        {categories.map((cat) => (
          <label key={cat}>
            <input type="checkbox" checked={isChecked(cat)} onChange={() => toggleCategory(cat)} /> {cat}
          </label>
        ))}
        {!allChecked && (
          <button
            type="button"
            onClick={() => navigate([], days)}
            style={{ marginTop: 8, fontSize: 12, background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', padding: 0 }}
          >
            Reset categories
          </button>
        )}
      </div>
      <div className="filter-divider"></div>
      <div className="filter-group">
        <h3>Filed</h3>
        <label><input type="radio" name="date" checked={days === '7'} onChange={() => navigate(selected, '7')} /> Last 7 days</label>
        <label><input type="radio" name="date" checked={days === '30'} onChange={() => navigate(selected, '30')} /> Last 30 days</label>
        <label><input type="radio" name="date" checked={days === 'all'} onChange={() => navigate(selected, 'all')} /> All time</label>
      </div>
      {isPending && (
        <p style={{ fontSize: 11, color: 'var(--ink-muted)', marginTop: 8 }}>Updating…</p>
      )}
    </aside>
  );
}
