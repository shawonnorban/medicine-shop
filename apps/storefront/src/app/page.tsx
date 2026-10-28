import Link from 'next/link';
import { api, type Category, type ProductPage } from '@/lib/api';
import { ProductGrid } from '@/components/ProductGrid';

export const revalidate = 60;

export default async function Home() {
  const [cats, popular, offers] = await Promise.all([
    api<Category[]>('/v1/categories', 300),
    api<ProductPage>('/v1/products?limit=12&featured=1&rx=otc', 60),
    api<ProductPage>('/v1/products?limit=6&sort=discount', 60),
  ]);
  return (
    <main>
      <div className="hero"><div className="wrap">
        <div>
          <span className="pill">বিশ্বস্ত · নিরাপদ · স্বাস্থ্যকর</span>
          <h1>আপনার ঔষধ, দ্রুত আপনার দরজায়<span>লাইসেন্সপ্রাপ্ত ফার্মাসিস্ট দ্বারা যাচাইকৃত</span></h1>
          <p>হাজারো ঔষধ, হারবাল পণ্য, ভিটামিন ও স্বাস্থ্যসামগ্রী এক জায়গায়। প্রেসক্রিপশন আপলোড করুন, বাকিটা আমরা দেখছি।</p>
          <div className="trust3">
            <div><span className="ic">✓</span><span><b>আসল পণ্য</b><small>সরাসরি কোম্পানি থেকে</small></span></div>
            <div><span className="ic">⚡</span><span><b>দ্রুত ডেলিভারি</b><small>ঢাকায় ১–২ দিন</small></span></div>
            <div><span className="ic">☎</span><span><b>ফার্মাসিস্ট সাপোর্ট</b><small>সকাল ৯টা – রাত ১০টা</small></span></div>
          </div>
          <Link className="cta" href="/category/medicine">এখনই কিনুন →</Link>
        </div>
      </div></div>

      <div className="wrap">
        <section className="blk">
          <div className="cats">
            {cats?.map((c) => (
              <Link key={c.id} className="cat" href={`/category/${c.slug}`}>
                <div className="ci">{c.icon}</div><b>{c.nameBn}</b><small>{c.nameEn}</small>
              </Link>
            ))}
          </div>
        </section>

        <div className="rxband">
          <div><b>📄 প্রেসক্রিপশন আছে?</b><p>ছবি তুলে আপলোড করুন। আমাদের ফার্মাসিস্ট যাচাই করে আপনাকে কল করবেন।</p></div>
          <Link className="cta" href="/prescription">প্রেসক্রিপশন আপলোড</Link>
        </div>

        {offers && <section className="blk">
          <div className="sec-head"><h2>বিশেষ অফার</h2><Link href="/search?sort=discount">সব দেখুন →</Link></div>
          <ProductGrid data={{ ...offers, total: 0 }} basePath="/" />
        </section>}

        {popular && <section className="blk">
          <div className="sec-head"><h2>জনপ্রিয় পণ্যসমূহ</h2><Link href="/search">সব পণ্য দেখুন →</Link></div>
          <ProductGrid data={{ ...popular, total: 0 }} basePath="/" />
        </section>}
      </div>

      <div className="trust4"><div className="wrap">
        <div><span className="ic">🛡</span><span><b>নিরাপদ ও অথেনটিক</b><small>সরাসরি কোম্পানি থেকে সংগ্রহ</small></span></div>
        <div><span className="ic">🚚</span><span><b>দ্রুত ডেলিভারি</b><small>ঢাকায় ১–২ দিন, বাইরে ৩–৫ দিন</small></span></div>
        <div><span className="ic">৳</span><span><b>পেমেন্ট অপশন</b><small>COD · bKash · Nagad</small></span></div>
        <div><span className="ic">☎</span><span><b>গ্রাহক সহায়তা</b><small className="en">+880 1XXX-XXXXXX</small></span></div>
      </div></div>
    </main>
  );
}
