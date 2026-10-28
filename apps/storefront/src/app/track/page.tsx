'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function Track() {
  const router = useRouter();
  const [no, setNo] = useState('');
  const [phone, setPhone] = useState('');
  return (
    <main className="wrap" style={{ paddingBlock: 20, maxWidth: 480 }}>
      <div className="sec-head"><h2>অর্ডার ট্র্যাক করুন</h2></div>
      <form className="co-box" onSubmit={(e) => { e.preventDefault(); router.push(`/order/${encodeURIComponent(no.trim().toUpperCase())}?phone=${encodeURIComponent(phone)}`); }}>
        <label htmlFor="no">অর্ডার নম্বর</label>
        <input id="no" required placeholder="ORD-100001" value={no} onChange={(e) => setNo(e.target.value)} />
        <label htmlFor="ph">মোবাইল নম্বর</label>
        <input id="ph" required inputMode="tel" placeholder="01XXXXXXXXX" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <button className="cta" type="submit" style={{ marginTop: 14 }}>খুঁজুন</button>
      </form>
    </main>
  );
}
