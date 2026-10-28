'use client';
import { useState } from 'react';
import Link from 'next/link';
import { taka, type GenericInfo } from '@/lib/api';

type Props = {
  name: string; company: string | null; generic: string | null; strength: string | null; dosageForm: string | null;
  category: string | null; price: number; description: string | null; usage: string | null; warnings: string | null;
  genericSlug?: string | null; genericInfo?: GenericInfo | null;
};

export function ProductTabs(p: Props) {
  const [tab, setTab] = useState<'details' | 'info' | 'reviews'>('details');
  const rows: [string, string | null][] = [
    ['নাম', p.name], ['কোম্পানি', p.company], ['জেনেরিক', p.generic], ['স্ট্রেংথ', p.strength],
    ['ধরন', p.dosageForm], ['ক্যাটাগরি', p.category], ['দাম', taka(p.price)],
  ];
  return (
    <div style={{ marginTop: 28 }}>
      <div className="ptabs" role="tablist">
        {([['details', 'বিবরণ'], ['info', 'তথ্য'], ['reviews', 'রিভিউ']] as const).map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      <div className="ppanel">
        {tab === 'details' && (
          <div style={{ maxWidth: '70ch' }}>
            {p.description && <><h2>বিবরণ</h2><p>{p.description}</p></>}
            {p.usage && <><h2>ব্যবহারবিধি</h2><p>{p.usage}</p></>}
            {p.warnings && <><h2>সতর্কতা</h2><p>{p.warnings}</p></>}
            {p.genericInfo && (
              <div className="ginfo">
                <h2>About {p.generic}{p.genericInfo.drugClass ? <small> · {p.genericInfo.drugClass}</small> : null}</h2>
                {([['Indications', p.genericInfo.indications], ['Dosage', p.genericInfo.dosage], ['Side effects', p.genericInfo.sideEffects], ['Do not use if', p.genericInfo.contraindications],
                   ['Interactions', p.genericInfo.interactions], ['Pregnancy', p.genericInfo.pregnancyNote], ['Storage', p.genericInfo.storageInfo]] as const).filter(([, v]) => v).map(([k, v]) => (
                  <p key={k}><b>{k}:</b> {v}</p>
                ))}
                {p.genericSlug && <Link href={`/generic/${p.genericSlug}`} className="more">All brands of {p.generic} →</Link>}
                <small className="muted">General information only. Ask your doctor or pharmacist before use.</small>
              </div>
            )}
            {!p.description && !p.usage && !p.warnings && !p.genericInfo && <p style={{ color: 'var(--muted)' }}>বিবরণ শীঘ্রই যোগ করা হবে।</p>}
          </div>
        )}
        {tab === 'info' && (
          <table className="info"><tbody>
            {rows.filter(([, v]) => v).map(([k, v]) => <tr key={k}><th>{k}</th><td className="en">{v}</td></tr>)}
          </tbody></table>
        )}
        {tab === 'reviews' && <p style={{ color: 'var(--muted)' }}>এখনো কোনো রিভিউ নেই। প্রথম রিভিউ আপনিই দিন (শীঘ্রই চালু হচ্ছে)।</p>}
      </div>
    </div>
  );
}
