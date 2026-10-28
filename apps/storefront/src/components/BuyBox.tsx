'use client';
import { useState } from 'react';
import { useCart } from '@/lib/cart';
import { savePct, taka, type Variant } from '@/lib/api';

export function BuyBox({ slug, name, rx, variants }: { slug: string; name: string; rx: boolean; variants: Variant[] }) {
  const cart = useCart();
  const [vi, setVi] = useState(0);
  const [qty, setQty] = useState(1);
  const [done, setDone] = useState(false);
  const v = variants[vi];
  if (!v) return null;
  const save = savePct(v.price, v.mrp);

  function add() {
    cart.add({ variantId: v.id, slug, name, label: v.label, price: v.price }, qty);
    setDone(true);
    setTimeout(() => setDone(false), 1400);
  }

  return (
    <>
      {variants.length > 1 && <>
        <div className="lbl">প্যাক সাইজ</div>
        <div className="opts">
          {variants.map((x, i) => (
            <button key={x.id} type="button" aria-pressed={i === vi} onClick={() => { setVi(i); setQty(1); }}>{x.label}</button>
          ))}
        </div>
      </>}
      <div className="pbig"><b className="en">{taka(v.price)}</b>{v.mrp > v.price && <s className="en" style={{ color: 'var(--muted)' }}>{taka(v.mrp)}</s>}{save > 0 && <span className="badge b-off" style={{ position: 'static' }}>{save}% ছাড়</span>}</div>
      <div className="stock" style={v.stock > 0 ? undefined : { color: 'var(--alert)' }}>
        {v.stock > 0 ? `✓ স্টকে আছে${v.nearestExpiry ? ` · মেয়াদ: ${v.nearestExpiry}` : ''}` : 'স্টকে নেই'}
      </div>
      {rx && <p className="rxband" style={{ margin: '12px 0', fontSize: 14 }}>📄 এটি প্রেসক্রিপশন ঔষধ। অর্ডারের সময় প্রেসক্রিপশন আপলোড করতে হবে, ফার্মাসিস্ট যাচাই করে ডেলিভারি দেবেন।</p>}
      <div className="trustrow">
        <div><span className="ic">✓</span><span><b>১০০% অথেনটিক</b><small>ভেরিফাইড ঔষধ</small></span></div>
        <div><span className="ic">🚚</span><span><b>দ্রুত ডেলিভারি</b><small>দরজায় পৌঁছে</small></span></div>
        <div><span className="ic">↺</span><span><b>সহজ রিটার্ন</b><small>রিটার্ন পলিসি</small></span></div>
        <div><span className="ic">🔒</span><span><b>নিরাপদ পেমেন্ট</b><small>১০০% সুরক্ষিত</small></span></div>
      </div>
      <div className="addbar">
        <span className="u">{v.unit}</span>
        <div className="q">
          <button type="button" aria-label="কমান" onClick={() => setQty((q) => Math.max(1, q - 1))}>−</button>
          <span aria-live="polite">{qty}</span>
          <button type="button" aria-label="বাড়ান" onClick={() => setQty((q) => Math.min(Math.max(v.stock, 1), q + 1))}>+</button>
        </div>
        <button className="go" type="button" disabled={v.stock <= 0} onClick={add}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M1.3 2.6h3.4l2.6 13.8h12.8l2.4-10.2H5.4" /><circle cx="9.9" cy="20.9" r="2" /><circle cx="17.7" cy="20.9" r="2" /></svg>
          {done ? '✓ Added' : 'Add'}
        </button>
      </div>
    </>
  );
}
