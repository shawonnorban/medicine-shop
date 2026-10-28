import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import { Icon, Pager, useErr } from './ui';

type Row = { id: number; name: string; slug: string; drugClass: string | null; hasInfo: boolean; productCount: number };
type Form = { id?: number; name: string; drugClass: string; indications: string; dosage: string; sideEffects: string; contraindications: string; interactions: string; pregnancyNote: string; storageInfo: string };
const blank: Form = { name: '', drugClass: '', indications: '', dosage: '', sideEffects: '', contraindications: '', interactions: '', pregnancyNote: '', storageInfo: '' };
const SECTIONS: [keyof Form, string, string][] = [
  ['indications', 'Indications', 'What it is used for'], ['dosage', 'Dosage', 'Typical adult and child dosing'], ['sideEffects', 'Side effects', ''],
  ['contraindications', 'Contraindications', 'Who should not take it'], ['interactions', 'Interactions', 'Other medicines, food, alcohol'], ['pregnancyNote', 'Pregnancy & breastfeeding', ''], ['storageInfo', 'Storage', ''],
];

export function Generics({ canEdit }: { canEdit: boolean }) {
  const errText = useErr();
  const [rows, setRows] = useState<Row[]>([]); const [total, setTotal] = useState(0); const [page, setPage] = useState(1);
  const [q, setQ] = useState(''); const [empty, setEmpty] = useState(false);
  const [form, setForm] = useState<Form | null>(null); const [brands, setBrands] = useState<{ id: number; name: string; strength: string | null; company: string | null }[]>([]);
  const [err, setErr] = useState(''); const [flash, setFlash] = useState(''); const [busy, setBusy] = useState(false);
  const SIZE = 50;

  const load = useCallback(() => {
    const p = new URLSearchParams({ ...(q ? { q } : {}), ...(empty ? { empty: '1' } : {}), page: String(page), limit: String(SIZE) });
    api<{ items: Row[]; total: number }>('GET', `/generic-library?${p}`).then((r) => { setRows(r.items); setTotal(r.total); }).catch((e) => setErr(errText(e)));
  }, [q, empty, page]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setPage(1); }, [q, empty]);
  useEffect(() => { const id = setTimeout(load, 200); return () => clearTimeout(id); }, [load]);
  useEffect(() => { if (!flash) return; const id = setTimeout(() => setFlash(''), 2500); return () => clearTimeout(id); }, [flash]);

  async function open(id?: number) {
    setErr(''); setBrands([]);
    if (!id) return setForm({ ...blank });
    const g = await api<any>('GET', `/generic-library/${id}`);
    setForm({ id: g.id, name: g.name, drugClass: g.drugClass ?? '', indications: g.indications ?? '', dosage: g.dosage ?? '', sideEffects: g.sideEffects ?? '', contraindications: g.contraindications ?? '', interactions: g.interactions ?? '', pregnancyNote: g.pregnancyNote ?? '', storageInfo: g.storageInfo ?? '' });
    setBrands(g.brands);
  }
  async function save(e: React.FormEvent) {
    e.preventDefault(); if (!form) return; setErr(''); setBusy(true);
    const { id, ...body } = form;
    try { if (id) await api('PUT', `/generic-library/${id}`, body); else await api('POST', '/generic-library', body); setForm(null); setFlash('Saved'); load(); } catch (x) { setErr(errText(x)); }
    setBusy(false);
  }
  async function remove(r: Row) {
    if (!window.confirm(`Delete ${r.name}?`)) return;
    try { await api('DELETE', `/generic-library/${r.id}`); setFlash('Deleted'); load(); } catch (x) { setErr(errText(x)); }
  }
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => f && { ...f, [k]: e.target.value });

  return (
    <section>
      <header className="pagehead"><div><h1>Generic library</h1><p className="sub">One reference record per active ingredient. Medicines link to it, and its text shows on the website product page and the public generic page.</p></div>
        <div className="tools">
          <label className="searchbox"><Icon name="search" size={13} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Generic or drug class" aria-label="Search generics" /></label>
          <label className="swl"><input className="switch" type="checkbox" role="switch" checked={empty} onChange={(e) => setEmpty(e.target.checked)} />Missing info</label>
          {canEdit && <button className="btn primary" onClick={() => open()}><Icon name="plus" size={13} />Add generic</button>}
        </div></header>
      {flash && <div className="toast" role="status">{flash}</div>}
      {err && !form && <div className="notice err" role="alert">{err}</div>}
      <div className="panel"><table className="grid">
        <thead><tr><th>Generic</th><th>Drug class</th><th>Reference text</th><th className="r">Medicines</th><th className="act" /></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="click" onClick={() => open(r.id)}>
              <td className="strong">{r.name}</td><td>{r.drugClass ?? <span className="dim">—</span>}</td>
              <td><span className={`pill ${r.hasInfo ? 'ok' : 'warn'}`}>{r.hasInfo ? 'Complete' : 'Needs info'}</span></td><td className="num r">{r.productCount}</td>
              <td className="act" onClick={(e) => e.stopPropagation()}>{canEdit && <button className="icon danger" aria-label="Delete" title="Delete" onClick={() => remove(r)}><Icon name="trash" size={13} /></button>}</td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={5} className="empty">No generics found</td></tr>}
        </tbody>
      </table><Pager page={page} size={SIZE} total={total} onPage={setPage} noun="generics" /></div>

      {form && (
        <div className="overlay" role="dialog" aria-modal="true" onMouseDown={(e) => { if (e.target === e.currentTarget) setForm(null); }}>
          <form className="dialog xwide" onSubmit={save}>
            <div className="dhead"><h2>{form.id ? 'Edit generic' : 'Add generic'}</h2><button type="button" className="icon" aria-label="Close" onClick={() => setForm(null)}><Icon name="x" size={14} /></button></div>
            <div className="dbody">
              <div className="cols2">
                <div className="frow"><label htmlFor="gn">Generic name<i>*</i></label><input id="gn" required disabled={!canEdit} value={form.name} onChange={set('name')} /></div>
                <div className="frow"><label htmlFor="gc">Drug class</label><input id="gc" disabled={!canEdit} placeholder="e.g. Proton pump inhibitor" value={form.drugClass} onChange={set('drugClass')} /></div>
              </div>
              <div className="cols2">
                {SECTIONS.map(([k, label, hint]) => (
                  <div className="frow" key={k}><label htmlFor={`g-${k}`}>{label}</label><textarea id={`g-${k}`} rows={3} disabled={!canEdit} value={form[k] as string} onChange={set(k)} />{hint && <small>{hint}</small>}</div>
                ))}
              </div>
              {brands.length > 0 && <div className="frow"><label>Medicines using this generic ({brands.length})</label><div className="chips">{brands.map((b) => <span className="pill mute" key={b.id}>{b.name} {b.strength}{b.company ? ` · ${b.company}` : ''}</span>)}</div></div>}
              <p className="sub">General reference text only. Review clinical content with your pharmacist before publishing.</p>
              {err && <div className="notice err" role="alert">{err}</div>}
            </div>
            <div className="dfoot"><button type="button" className="btn" onClick={() => setForm(null)}>Close</button>{canEdit && <button className="btn primary" disabled={busy}>Save generic</button>}</div>
          </form>
        </div>
      )}
    </section>
  );
}
