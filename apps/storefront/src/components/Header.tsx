'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useCart } from '@/lib/cart';
import { PUBLIC_API_URL, type StoreConfig } from '@/lib/api';

type Sug = { slug: string; name: string; strength: string | null; dosageForm: string | null; generic: string | null };

function SearchBox() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [items, setItems] = useState<Sug[]>([]);
  const [open, setOpen] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setItems([]); return; }
    const id = ++seq.current;
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`${PUBLIC_API_URL}/v1/search/suggest?q=${encodeURIComponent(term)}`);
        const data: Sug[] = await r.json();
        if (id === seq.current) { setItems(data); setOpen(true); }
      } catch {}
    }, 150);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <form className="searchwrap" role="search" onSubmit={(e) => { e.preventDefault(); setOpen(false); if (q.trim()) router.push(`/search?q=${encodeURIComponent(q.trim())}`); }}>
      <div className="search">
        <input value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
               type="search" placeholder="ঔষধ, জেনেরিক বা ব্র্যান্ড খুঁজুন… (যেমন: Napa, Paracetamol)" aria-label="খুঁজুন" autoComplete="off" />
        <button type="submit">খুঁজুন</button>
      </div>
      {open && items.length > 0 && (
        <div className="sugg">
          {items.map((s) => (
            <Link key={s.slug} href={`/product/${s.slug}`}>
              {s.name} {s.strength} <small>{[s.dosageForm, s.generic].filter(Boolean).join(' · ')}</small>
            </Link>
          ))}
        </div>
      )}
    </form>
  );
}

export function Header({ store }: { store: StoreConfig['store'] }) {
  const cart = useCart();
  return (
    <>
      <div className="topbar"><div className="wrap">
        <div>{store.announcement && <span>🚚 {store.announcement}</span>}<span>🛡 ১০০% অথেনটিক পণ্য</span></div>
        <div>{store.phone && <span className="en">📞 {store.phone}</span>}<Link href="/track">অর্ডার ট্র্যাক</Link></div>
      </div></div>
      <header className="site"><div className="wrap">
        <Link className="logo" href="/"><i>+</i><span><b>{store.store_name}</b><small>{store.tagline}</small></span></Link>
        <SearchBox />
        <div className="hactions">
          <Link className="rx-btn" href="/prescription">📄 প্রেসক্রিপশন আপলোড</Link>
          <Link className="cart-btn" href="/cart" aria-label="কার্ট">🛒 ৳<span className="en">{cart.total.toLocaleString('en-US')}</span><em>{cart.count}</em></Link>
        </div>
      </div></header>
    </>
  );
}
