'use client';
import Link from 'next/link';
import { useCart } from '@/lib/cart';
import { taka } from '@/lib/api';

export default function CartPage() {
  const cart = useCart();
  return (
    <main className="wrap" style={{ paddingBlock: 20 }}>
      <div className="sec-head"><h2>আপনার কার্ট</h2></div>
      {!cart.lines.length ? (
        <p className="empty">কার্ট খালি। <Link href="/" style={{ color: 'var(--brand)' }}>কেনাকাটা শুরু করুন →</Link></p>
      ) : (
        <div style={{ maxWidth: 720 }}>
          {cart.lines.map((l) => (
            <div key={l.variantId} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 14, alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--line)' }}>
              <div><Link href={`/product/${l.slug}`}><b className="en">{l.name}</b></Link><div className="co" style={{ color: 'var(--muted)' }}>{l.label} · {taka(l.price)}</div></div>
              <div className="qty">
                <button type="button" aria-label="কমান" onClick={() => cart.setQty(l.variantId, l.qty - 1)}>−</button>
                <span>{l.qty}</span>
                <button type="button" aria-label="বাড়ান" onClick={() => cart.setQty(l.variantId, l.qty + 1)}>+</button>
              </div>
              <b className="en">{taka(l.price * l.qty)}</b>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '16px 0', fontSize: 20 }}><b>মোট</b><b className="en" style={{ color: 'var(--brand)' }}>{taka(cart.total)}</b></div>
          <button className="cta" type="button" disabled title="চেকআউট ধাপ ২-এ আসছে">অর্ডার করুন (শীঘ্রই)</button>
        </div>
      )}
    </main>
  );
}
