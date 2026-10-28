'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useCart } from '@/lib/cart';
import { PUBLIC_API_URL, taka, type StoreConfig, type Zone } from '@/lib/api';
import { errText, post } from '@/lib/orders';

export default function Checkout() {
  const cart = useCart();
  const router = useRouter();
  const [f, setF] = useState({ name: '', phone: '', address: '', zone: '', note: '' });
  const [cfg, setCfg] = useState<StoreConfig | null>(null);
  useEffect(() => {
    fetch(`${PUBLIC_API_URL}/v1/config`).then((r) => r.json()).then((c: StoreConfig) => { setCfg(c); setF((x) => ({ ...x, zone: x.zone || c.zones[0]?.code || '' })); }).catch(() => setErr('সেটিংস লোড হয়নি, পেজ রিফ্রেশ করুন'));
  }, []);
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [devCode, setDevCode] = useState('');

  const zone: Zone | undefined = cfg?.zones.find((z) => z.code === f.zone);
  const fee = !zone ? 0 : zone.freeOver != null && cart.total >= zone.freeOver ? 0 : zone.fee;
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setF({ ...f, [k]: e.target.value });
    if (k === 'phone') { setToken(''); setSent(false); }
  };

  async function sendOtp() {
    setErr(''); setBusy(true);
    const r = await post<{ devCode?: string }>('/v1/otp/request', { phone: f.phone });
    setBusy(false);
    if (!r.ok) return setErr(errText(r.error));
    setSent(true); setDevCode(r.data.devCode ?? '');
  }
  async function verify() {
    setErr(''); setBusy(true);
    const r = await post<{ token: string }>('/v1/otp/verify', { phone: f.phone, code });
    setBusy(false);
    if (!r.ok) return setErr(errText(r.error));
    setToken(r.data.token);
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    if (!token) return setErr(errText('phone_not_verified'));
    setBusy(true);
    const r = await post<{ orderNo: string }>('/v1/orders', {
      token, ...f, note: f.note || undefined, items: cart.lines.map((l) => ({ variantId: l.variantId, qty: l.qty })),
    });
    setBusy(false);
    if (!r.ok) return setErr(errText(r.error));
    cart.clear();
    router.push(`/order/${r.data.orderNo}?phone=${encodeURIComponent(f.phone)}`);
  }

  if (!cart.lines.length) {
    return <main className="wrap" style={{ paddingBlock: 24 }}><p className="empty">কার্ট খালি। <Link href="/" style={{ color: 'var(--brand)' }}>কেনাকাটা শুরু করুন →</Link></p></main>;
  }

  return (
    <main className="wrap" style={{ paddingBlock: 20 }}>
      <div className="sec-head"><h2>চেকআউট</h2></div>
      <form className="co-grid" onSubmit={submit}>
        <div className="co-box">
          <h3>ডেলিভারির তথ্য</h3>
          <label htmlFor="name">নাম</label>
          <input id="name" required minLength={2} value={f.name} onChange={set('name')} autoComplete="name" />
          <label htmlFor="phone">মোবাইল নম্বর</label>
          <div className="row">
            <input id="phone" required inputMode="tel" placeholder="01XXXXXXXXX" value={f.phone} onChange={set('phone')} autoComplete="tel" disabled={!!token} />
            {!token && <button type="button" className="ghost" onClick={sendOtp} disabled={busy || f.phone.length < 11}>{sent ? 'আবার পাঠান' : 'কোড পাঠান'}</button>}
            {token && <span className="okchip">✓ ভেরিফায়েড</span>}
          </div>
          {sent && !token && (
            <div className="row">
              <input aria-label="ভেরিফিকেশন কোড" inputMode="numeric" maxLength={6} placeholder="৬ ডিজিটের কোড" value={code} onChange={(e) => setCode(e.target.value)} />
              <button type="button" className="ghost" onClick={verify} disabled={busy || code.length !== 6}>ভেরিফাই</button>
            </div>
          )}
          {devCode && !token && <small className="muted">ডেভ মোড: আপনার কোড {devCode}</small>}
          <label htmlFor="zone">এলাকা</label>
          <select id="zone" value={f.zone} onChange={set('zone')}>
            {cfg?.zones.map((z) => <option key={z.code} value={z.code}>{z.nameBn} (৳{z.fee}{z.eta ? ` · ${z.eta}` : ''})</option>)}
          </select>
          <label htmlFor="address">পূর্ণ ঠিকানা</label>
          <textarea id="address" required minLength={8} rows={3} value={f.address} onChange={set('address')} autoComplete="street-address" />
          <label htmlFor="note">নোট (ঐচ্ছিক)</label>
          <input id="note" value={f.note} onChange={set('note')} maxLength={300} />
          <h3 style={{ marginTop: 18 }}>পেমেন্ট</h3>
          {cfg?.payments.map((p) => (
            <div key={p.code}><label className="radio"><input type="radio" checked readOnly /> {p.nameBn}</label>{p.instructions && <small className="muted">{p.instructions}</small>}</div>
          ))}
        </div>

        <aside className="co-box">
          <h3>অর্ডার সারাংশ</h3>
          {cart.lines.map((l) => (
            <div key={l.variantId} className="sumline"><span>{l.name} <small className="muted">{l.label} × {l.qty}</small></span><b className="en">{taka(l.price * l.qty)}</b></div>
          ))}
          <div className="sumline"><span>সাবটোটাল</span><span className="en">{taka(cart.total)}</span></div>
          <div className="sumline"><span>ডেলিভারি চার্জ</span><span className="en">{fee ? taka(fee) : 'ফ্রি'}</span></div>
          {fee > 0 && zone?.freeOver != null && <small className="muted">৳{zone.freeOver}+ অর্ডারে ডেলিভারি ফ্রি</small>}
          <div className="sumline total"><span>মোট</span><b className="en">{taka(cart.total + fee)}</b></div>
          {err && <p role="alert" className="err">{err}</p>}
          <button className="cta" type="submit" disabled={busy || !token || !zone} style={{ width: '100%', justifyContent: 'center', borderRadius: 10 }}>
            {busy ? 'অপেক্ষা করুন…' : 'অর্ডার নিশ্চিত করুন'}
          </button>
          {!token && <small className="muted">অর্ডারের আগে মোবাইল নম্বর ভেরিফাই করুন।</small>}
        </aside>
      </form>
    </main>
  );
}
