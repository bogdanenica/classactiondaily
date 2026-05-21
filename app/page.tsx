import { neon } from '@neondatabase/serverless';

export const revalidate = 3600; // re-render at most once per hour

const sql = neon(process.env.DATABASE_URL!);

export default async function Home() {
  const cases = await sql`
    SELECT id, case_name, defendant, court_name, docket_number,
           date_filed, category, allegation_type, summary
    FROM cases
    ORDER BY date_filed DESC
    LIMIT 20
  `;

  return (
    <main className="max-w-4xl mx-auto p-8">
      <h1 className="text-3xl font-serif mb-2">ClassActionDaily</h1>
      <p className="text-gray-600 mb-8">Latest consumer class actions filed in U.S. federal courts.</p>
      {cases.map((c: any) => (
        <article key={c.id} className="border border-gray-200 rounded-md p-5 mb-4">
          <div className="text-xs text-gray-500 mb-1">
            {c.category} · {c.allegation_type} · {new Date(c.date_filed).toLocaleDateString()}
          </div>
          <h2 className="text-xl font-serif">{c.case_name}</h2>
          <div className="text-sm text-gray-600 mb-2">Defendant: {c.defendant}</div>
          <p className="text-gray-800">{c.summary}</p>
          <div className="text-xs text-gray-500 mt-3">
            {c.court_name} · Case {c.docket_number}
          </div>
        </article>
      ))}
    </main>
  );
}