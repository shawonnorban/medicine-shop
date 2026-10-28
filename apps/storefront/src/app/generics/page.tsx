import Link from 'next/link';
import { api, type GenericIndexItem } from '@/lib/api';

export const revalidate = 300;
export const metadata = { title: 'Generic medicine library', description: 'Look up a generic name, its uses, dosage and precautions, and see every brand available.' };

export default async function GenericsIndex() {
  const list = (await api<GenericIndexItem[]>('/v1/generics', 300)) ?? [];
  const groups = new Map<string, GenericIndexItem[]>();
  for (const g of list) { const k = g.name[0].toUpperCase(); groups.set(k, [...(groups.get(k) ?? []), g]); }
  return (
    <main className="wrap" style={{ paddingBlock: 20 }}>
      <div className="sec-head"><h2>Generic library <small className="muted en" style={{ fontWeight: 400 }}>({list.length})</small></h2></div>
      <p className="muted" style={{ maxWidth: '70ch' }}>Find a medicine by its generic (active ingredient) name, read general information, and compare the brands we stock.</p>
      <nav className="azbar" aria-label="A to Z">{[...groups.keys()].map((k) => <a key={k} href={`#l-${k}`}>{k}</a>)}</nav>
      {[...groups].map(([k, items]) => (
        <section key={k} id={`l-${k}`} className="azgroup">
          <h3>{k}</h3>
          <ul>{items.map((g) => <li key={g.slug}><Link href={`/generic/${g.slug}`}><b className="en">{g.name}</b>{g.drugClass && <small className="muted en"> · {g.drugClass}</small>}</Link><span className="chipn en">{g.brands} {g.brands === 1 ? 'brand' : 'brands'}</span></li>)}</ul>
        </section>
      ))}
      {!list.length && <p className="empty">No generics yet.</p>}
    </main>
  );
}
