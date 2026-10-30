// Renders a schema.org JSON-LD block. Escapes "<" so a stray "</script>" in
// database text can never break out of the tag.
export default function JsonLd({ data }: { data: Record<string, unknown> }) {
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
