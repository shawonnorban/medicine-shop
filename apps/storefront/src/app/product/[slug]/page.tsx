import Link from 'next/link';
import { notFound } from 'next/navigation';
import { api, imgSrc, taka, type ProductDetail } from '@/lib/api';
import { BuyBox } from '@/components/BuyBox';
import { ProductTabs } from '@/components/ProductTabs';

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
  const title = [p.name, p.strength, p.dosageForm].filter(Boolean).join(' ');
  const cur = p.variants[0]?.price ?? 0;

  return (
    <main className="wrap">
      <div className="crumb"><Link href="/">হোম</Link> › {p.categorySlug && <Link href={`/category/${p.categorySlug}`}>{p.categoryNameBn}</Link>} › <span className="en">{p.name}</span></div>

      <div className="pdp3">
        <div className="pdp3-main">
          <div className="pdp">
            <div className="gal"><div className="thumb" style={{ background: '#F0F5F2' }}>
              {p.imageUrl
                ? <img src={imgSrc(p.imageUrl)!} alt={p.name} width={480} height={400} style={{ objectFit: 'contain', maxHeight: '100%' }} />
                : <div className="pk" style={{ background: '#1b6fb3', fontSize: 20 }}>{p.name}</div>}
            </div></div>
            <div className="infobox">
              <h1>{title}</h1>
              <a className="review-link" href="#reviews">✎ রিভিউ লিখুন</a>
              <div className="meta en"><b>Generic Name</b> : {p.generic ?? '—'}</div>
              <div className="meta en"><b>Company</b> : {p.company ?? '—'}</div>
              <BuyBox slug={p.slug} name={p.name} rx={rx} variants={p.variants} />
            </div>
          </div>

          <ProductTabs name={p.name} company={p.company} generic={p.generic} strength={p.strength} dosageForm={p.dosageForm}
                       category={p.categoryNameBn} price={cur} description={p.description} usage={p.usage} warnings={p.warnings} />

          {p.alternatives.length > 0 && (
            <section className="blk">
              <div className="sec-head"><h2>বিকল্প ঔষধ <small style={{ color: 'var(--muted)', fontWeight: 400 }}>(একই জেনেরিক: {p.generic})</small></h2></div>
              <div className="tbl-wrap"><table className="alt"><thead><tr><th>ব্র্যান্ড</th><th>কোম্পানি</th><th>স্ট্রেংথ</th><th>দাম</th></tr></thead><tbody>
                {p.alternatives.map((a) => (
                  <tr key={a.slug}>
                    <td className="en"><Link href={`/product/${a.slug}`}>{a.name}</Link></td><td className="en">{a.company}</td><td className="en">{a.strength}</td>
                    <td className="n">{taka(a.price)} <small>({a.variantLabel})</small>{a.price < cur && <span className="save"> সাশ্রয় {taka(cur - a.price)}</span>}</td>
                  </tr>
                ))}
              </tbody></table></div>
            </section>
          )}
        </div>

        {p.related.length > 0 && (
          <aside className="related" aria-label="সম্পর্কিত পণ্য">
            <h2>সম্পর্কিত পণ্য</h2>
            <ul>
              {p.related.map((r) => (
                <li key={r.slug}>
                  <Link href={`/product/${r.slug}`}>
                    <span className="rimg">{r.imageUrl ? <img src={imgSrc(r.imageUrl)!} alt="" loading="lazy" width={56} height={56} /> : <i>💊</i>}</span>
                    <span className="rtxt">
                      <b className="en">{r.name} {r.strength}</b>
                      <small className="en">{r.company}</small>
                      <em className="en">{taka(r.price)}</em>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </aside>
        )}
      </div>
    </main>
  );
}
