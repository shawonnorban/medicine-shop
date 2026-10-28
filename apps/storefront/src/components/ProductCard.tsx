'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useCart } from '@/lib/cart';
import { imgSrc, savePct, taka, type ProductCardData } from '@/lib/api';

const PALETTE = ['#1b6fb3', '#2e7d32', '#6a4bb5', '#6d4c41', '#c2185b', '#e08a00', '#00838f'];
const hue = (s: string) => PALETTE[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % PALETTE.length];

export function ProductCard({ p }: { p: ProductCardData }) {
  const cart = useCart();
  const [qty, setQty] = useState(1);
  const [done, setDone] = useState(false);
  const save = savePct(p.price, p.mrp);
  const rx = p.rx !== 'otc';
  const out = p.stock <= 0;

  function add() {
    cart.add({ variantId: p.variantId, slug: p.slug, name: p.name, label: p.variantLabel, price: p.price }, qty);
    setDone(true);
    setTimeout(() => setDone(false), 1200);
  }

  return (
    <article className="card">
      {rx && <span className="badge b-rx">Rx প্রেসক্রিপশন</span>}
      {save > 0 && <span className="ribbon">Save<br />{save}%</span>}
      <Link href={`/product/${p.slug}`} className="thumb" style={{ background: '#F0F5F2' }} aria-label={p.name}>
        {p.imageUrl
          ? <img src={imgSrc(p.imageUrl)!} alt={p.name} loading="lazy" decoding="async" width={200} height={170} style={{ objectFit: 'contain', maxHeight: '100%' }} />
          : <span className="pk" style={{ background: hue(p.name) }}>{p.name.split(' ')[0]}</span>}
      </Link>
      <h3><Link href={`/product/${p.slug}`}>{p.name}{p.strength ? ` ${p.strength}` : ''}</Link></h3>
      <div className="co">{[p.generic, p.company].filter(Boolean).join(' · ')}</div>
      <div className="price"><b>{taka(p.price)}</b>{p.mrp > p.price && <s>{taka(p.mrp)}</s>}</div>
      {out ? (
        <div className="atb"><button className="add" type="button" disabled style={{ flex: 1, opacity: .55 }}>স্টক নেই</button></div>
      ) : rx ? (
        <div className="atb"><Link className="add rx" href={`/product/${p.slug}`} style={{ flex: 1, textAlign: 'center' }}>📄 প্রেসক্রিপশন দিয়ে অর্ডার</Link></div>
      ) : (
        <div className="atb">
          <div className="qs">
            <button type="button" aria-label="কমান" onClick={() => setQty((q) => Math.max(1, q - 1))}>−</button>
            <span aria-live="polite">{qty}</span>
            <button type="button" aria-label="বাড়ান" onClick={() => setQty((q) => Math.min(p.stock, q + 1))}>+</button>
          </div>
          <button className="add" type="button" onClick={add}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M1.3 2.6h3.4l2.6 13.8h12.8l2.4-10.2H5.4" /><circle cx="9.9" cy="20.9" r="2" /><circle cx="17.7" cy="20.9" r="2" /></svg>
            <span>{done ? '✓ Added' : 'Add'}</span>
          </button>
        </div>
      )}
    </article>
  );
}
