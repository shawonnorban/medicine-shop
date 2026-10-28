'use client';
import Link from 'next/link';
import { use, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { PUBLIC_API_URL, taka } from '@/lib/api';
import { errText, post, STATUS_BN } from '@/lib/orders';

type Order = {
  orderNo: string; name: string; phone: string; address: string; zone: string; subtotal: number; deliveryFee: number; total: number;
  paymentMethod: string; status: string; createdAt: string; items: { name: string; label: string; qty: number; unitPrice: number }[];
};

export default function OrderPage({ params }: { params: Promise<{ orderNo: string }> }) {
  const { orderNo } = use(params);
  const phone = useSearchParams().get('phone') ?? '';
  const [o, setO] = useState<Order | null>(null);
  const [state, setState] = useState<'loading' | 'missing' | 'ready'>('loading');
  const [msg, setMsg] = useState('');

  async function load() {
    try {
      const r = await fetch(`${PUBLIC_API_URL}/v1/orders/${encodeURIComponent(orderNo)}?phone=${encodeURIComponent(phone)}`, { cache: 'no-store' });
      if (!r.ok) return setState('missing');
      setO(await r.json()); setState('ready');
    } catch { setState('missing'); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [orderNo, phone]);

  async function cancel() {
    const r = await post(`/v1/orders/${encodeURIComponent(orderNo)}/cancel`, { phone });
    setMsg(r.ok ? 'অর্ডার বাতিল করা হয়েছে।' : errText(r.error));
    load();
  }

  if (state === 'loading') return <main className="wrap" style={{ paddingBlock: 24 }}><p className="empty">লোড হচ্ছে…</p></main>;
  if (state === 'missing' || !o) return <main className="wrap" style={{ paddingBlock: 24 }}><p className="empty">অর্ডার পাওয়া যায়নি। নম্বর ও মোবাইল নম্বর মিলিয়ে দেখুন। <Link href="/track" style={{ color: 'var(--brand)' }}>অর্ডার ট্র্যাক করুন →</Link></p></main>;

  return (
    <main className="wrap" style={{ paddingBlock: 20, maxWidth: 760 }}>
      {o.status === 'pending' && <div className="okbanner">✓ আপনার অর্ডার গ্রহণ করা হয়েছে। আমাদের ফার্মাসিস্ট শীঘ্রই কল করে নিশ্চিত করবেন।</div>}
      <div className="sec-head"><h2>অর্ডার <span className="en">{o.orderNo}</span></h2><span className="okchip">{STATUS_BN[o.status] ?? o.status}</span></div>
      <div className="co-box">
        {o.items.map((i, k) => <div key={k} className="sumline"><span>{i.name} <small className="muted">{i.label} × {i.qty}</small></span><b className="en">{taka(i.unitPrice * i.qty)}</b></div>)}
        <div className="sumline"><span>সাবটোটাল</span><span className="en">{taka(o.subtotal)}</span></div>
        <div className="sumline"><span>ডেলিভারি চার্জ</span><span className="en">{o.deliveryFee ? taka(o.deliveryFee) : 'ফ্রি'}</span></div>
        <div className="sumline total"><span>মোট (ক্যাশ অন ডেলিভারি)</span><b className="en">{taka(o.total)}</b></div>
        <p style={{ margin: '12px 0 0' }}><b>{o.name}</b> · <span className="en">{o.phone}</span><br /><span className="muted">{o.address}</span></p>
      </div>
      {msg && <p role="status" className="okbanner" style={{ marginTop: 12 }}>{msg}</p>}
      {o.status === 'pending' && <button type="button" className="ghost" style={{ marginTop: 14 }} onClick={cancel}>অর্ডার বাতিল করুন</button>}
      <p style={{ marginTop: 18 }}><Link href="/" style={{ color: 'var(--brand)' }}>← কেনাকাটা চালিয়ে যান</Link></p>
    </main>
  );
}
