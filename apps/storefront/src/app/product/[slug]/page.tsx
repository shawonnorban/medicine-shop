import Link from 'next/link';
import { notFound } from 'next/navigation';
import { api, savePct, taka, type ProductDetail } from '@/lib/api';
import { BuyBox } from '@/components/BuyBox';

export const revalidate = 60;

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params) {
  const { slug } = await params;
  const p = await api<ProductDetail>(`/v1/products/${encodeURIComponent(slug)}`);
  if (!p) return {};
  return { title: `${p.name} ${p.strength ?? ''} ${p.dosageForm ?? ''}`.trim(), description: p.description ?? undefined };
}

export default async function ProductPage({ params }: Params) {
  const { slug } = await params;
  const p = await api<ProductDetail>(`/v1/products/${encodeURIComponent(slug)}`);
  if (!p) notFound();
  const rx = p.rx !== 'otc';

  return (
    <main className="wrap">
      <div className="crumb"><Link href="/">হোম</Link> › {p.categorySlug && <Link href={`/category/${p.categorySlug}`}>{p.categoryNameBn}</Link>} › <span className="en">{p.name}</span></div>
      <div className="pdp">
        <div className="gal"><div className="thumb" style={{ background: '#F0F5F2' }}>
          {p.imageUrl ? <img src={p.imageUrl} alt={p.name} width={480} height={400} style={{ objectFit: 'contain', maxHeight: '100%' }} /> : <div className="pk" style={{ background: '#1b6fb3', fontSize: 20 }}>{p.name}</div>}
        </div></div>
        <div>
          <h1>{p.name} {p.strength} {p.dosageForm}</h1>
          <div className="gen">{[p.generic, p.company].filter(Boolean).join(' · ')}</div>
          <BuyBox slug={p.slug} name={p.name} rx={rx} variants={p.variants} />
          <div className="lbl">ডেলিভারি: ঢাকায় ১–২ দিন · ক্যাশ অন ডেলিভারি</div>
        </div>
      </div>

      <div className="tabpanel" style={{ maxWidth: '70ch', marginTop: 24 }}>
        {p.description && <><h2 style={{ fontSize: 18 }}>বিবরণ</h2><p>{p.description}</p></>}
        {p.usage && <><h2 style={{ fontSize: 18 }}>ব্যবহারবিধি</h2><p>{p.usage}</p></>}
        {p.warnings && <><h2 style={{ fontSize: 18 }}>সতর্কতা</h2><p>{p.warnings}</p></>}
      </div>

      {p.alternatives.length > 0 && (
        <section className="blk">
          <div className="sec-head"><h2>বিকল্প ঔষধ <small style={{ color: 'var(--muted)', fontWeight: 400 }}>(একই জেনেরিক: {p.generic})</small></h2></div>
          <div className="tbl-wrap"><table className="alt"><thead><tr><th>ব্র্যান্ড</th><th>কোম্পানি</th><th>স্ট্রেংথ</th><th>দাম</th></tr></thead><tbody>
            {p.alternatives.map((a) => {
              const cur = p.variants[0]?.price ?? 0;
              return (
                <tr key={a.slug}>
                  <td className="en"><Link href={`/product/${a.slug}`}>{a.name}</Link></td><td className="en">{a.company}</td><td className="en">{a.strength}</td>
                  <td className="n">{taka(a.price)} <small>({a.variantLabel})</small>{a.price < cur && <span className="save"> সাশ্রয় {taka(cur - a.price)}</span>}{savePct(a.price, a.mrp) > 0 && ''}</td>
                </tr>
              );
            })}
          </tbody></table></div>
        </section>
      )}
    </main>
  );
}
