import Link from 'next/link';
import { notFound } from 'next/navigation';
import { api, taka, type GenericPage } from '@/lib/api';

export const revalidate = 120;
type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params) {
  const { slug } = await params;
  const g = await api<GenericPage>(`/v1/generics/${encodeURIComponent(slug)}`);
  return g ? { title: `${g.name}: uses, dosage and brands`, description: g.indications ?? undefined } : {};
}

export default async function GenericDetail({ params }: Params) {
  const { slug } = await params;
  const g = await api<GenericPage>(`/v1/generics/${encodeURIComponent(slug)}`);
  if (!g) notFound();
  const rows: [string, string | null][] = [['Indications', g.indications], ['Dosage', g.dosage], ['Side effects', g.sideEffects], ['Do not use if', g.contraindications], ['Interactions', g.interactions], ['Pregnancy', g.pregnancyNote], ['Storage', g.storageInfo]];
  return (
    <main className="wrap" style={{ paddingBlock: 12 }}>
      <div className="crumb"><Link href="/">হোম</Link> › <Link href="/generics">জেনেরিক</Link> › <span className="en">{g.name}</span></div>
      <div className="pdp3">
        <div className="pdp3-main">
          <div className="infobox">
            <h1 style={{ textTransform: 'none' }}>{g.name}</h1>
            {g.drugClass && <div className="meta en">{g.drugClass}</div>}
          </div>
          <div className="ppanel" style={{ marginTop: 14, borderRadius: 6 }}>
            {rows.filter(([, v]) => v).map(([k, v]) => <div key={k} className="ginfo"><h2>{k}</h2><p>{v}</p></div>)}
            <small className="muted">General information only. It does not replace advice from your doctor or pharmacist.</small>
          </div>
        </div>
        <aside className="related" aria-label="Brands">
          <h2>Brands in stock ({g.brands.length})</h2>
          {g.brands.length ? (
            <ul>{g.brands.map((b) => (
              <li key={b.slug}><Link href={`/product/${b.slug}`}><span className="rtxt"><b className="en">{b.name} {b.strength}</b><small className="en">{[b.dosageForm, b.company].filter(Boolean).join(' · ')}</small><em className="en">{taka(b.price)} <small>{b.variantLabel}</small></em></span></Link></li>
            ))}</ul>
          ) : <p className="empty" style={{ padding: 16 }}>No brand in stock right now.</p>}
        </aside>
      </div>
    </main>
  );
}
