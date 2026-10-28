import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from './api';
import { Icon, Pager, useErr } from './ui';
import { taka } from './Orders';

type Opt = { id: number; name?: string; nameEn?: string };
type Variant = { id?: number; label: string; unit: string; barcode: string; mrp: string; price: string; pieces: string; sellOnline: boolean; sellPos: boolean; stock?: number };
type Form = {
  id?: number; needsReview?: boolean; name: string; baseUnit: string; generic: string; companyId: string; categoryId: string; dosageForm: string; strength: string; rx: string;
  description: string; usage: string; warnings: string; imageUrl: string; isActive: boolean; isFeatured: boolean; variants: Variant[];
};
type Row = { id: number; needsReview: boolean; baseUnit: string; name: string; strength: string | null; dosageForm: string | null; rx: string; isActive: boolean; generic: string | null; company: string | null; category: string | null; variants: number; stock: number; price: number };

const FORMS = ['Tablet', 'Capsule', 'Syrup', 'Suspension', 'Injection', 'Drops', 'Ointment', 'Cream', 'Gel', 'Inhaler', 'Powder', 'Sachet', 'Saline', 'Device', 'Other'];
const UNITS = ['Strip', 'Box', 'Bottle', 'Vial', 'Tube', 'Piece', 'Pack', 'Sachet'];
const newVariant = (): Variant => ({ label: '', unit: 'Strip', barcode: '', mrp: '', price: '', pieces: '10', sellOnline: true, sellPos: true });
const blank = (): Form => ({ name: '', baseUnit: 'Piece', generic: '', companyId: '', categoryId: '', dosageForm: 'Tablet', strength: '', rx: 'otc', description: '', usage: '', warnings: '', imageUrl: '', isActive: true, isFeatured: false, variants: [newVariant()] });
const nul = (s: string) => (s.trim() === '' ? null : s.trim());

export function Products({ canEdit }: { canEdit: boolean }) {
  const errText = useErr();
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const SIZE = 50;
  const [q, setQ] = useState(''); const [cat, setCat] = useState(''); const [rx, setRx] = useState(''); const [review, setReview] = useState(false);
  const [cats, setCats] = useState<Opt[]>([]); const [cos, setCos] = useState<Opt[]>([]);
  const [form, setForm] = useState<Form | null>(null);
  const [err, setErr] = useState(''); const [flash, setFlash] = useState(''); const [busy, setBusy] = useState(false);
  const [generics, setGenerics] = useState<string[]>([]);

  useEffect(() => { api<Opt[]>('GET', '/categories').then(setCats).catch(() => {}); api<Opt[]>('GET', '/companies').then(setCos).catch(() => {}); }, []);
  const load = useCallback(() => {
    const p = new URLSearchParams({ ...(q ? { q } : {}), ...(cat ? { category: cat } : {}), ...(rx ? { rx } : {}), ...(review ? { review: '1' } : {}), limit: String(SIZE), page: String(page) });
    api<{ items: Row[]; total: number }>('GET', `/products?${p}`).then((r) => { setRows(r.items); setTotal(r.total); }).catch((e) => setErr(errText(e)));
  }, [q, cat, rx, review, page]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setPage(1); }, [q, cat, rx, review]);
  useEffect(() => { const id = setTimeout(load, 200); return () => clearTimeout(id); }, [load]);
  useEffect(() => { if (!flash) return; const id = setTimeout(() => setFlash(''), 2500); return () => clearTimeout(id); }, [flash]);

  async function open(id?: number) {
    setErr('');
    if (!id) return setForm(blank());
    const p = await api<any>('GET', `/products/${id}`);
    setForm({
      id: p.id, needsReview: p.needsReview, name: p.name, baseUnit: p.baseUnit ?? 'Piece', generic: p.generic ?? '', companyId: p.companyId ? String(p.companyId) : '', categoryId: p.categoryId ? String(p.categoryId) : '',
      dosageForm: p.dosageForm ?? '', strength: p.strength ?? '', rx: p.rx, description: p.description ?? '', usage: p.usage ?? '', warnings: p.warnings ?? '',
      imageUrl: p.imageUrl ?? '', isActive: p.isActive, isFeatured: p.isFeatured,
      variants: p.variants.map((v: any) => ({ id: v.id, label: v.label, unit: v.unit, barcode: v.barcode ?? '', mrp: String(v.mrp), price: String(v.price), pieces: String(v.pieces), sellOnline: v.sellOnline, sellPos: v.sellPos, stock: v.stock })),
    });
  }
  async function suggestGenerics(v: string) {
    if (v.length < 2) return setGenerics([]);
    api<{ name: string }[]>('GET', `/generics?q=${encodeURIComponent(v)}`).then((r) => setGenerics(r.map((g) => g.name))).catch(() => {});
  }

  async function save(e: React.FormEvent) {
    e.preventDefault(); if (!form) return; setErr(''); setBusy(true);
    const body = {
      name: form.name.trim(), baseUnit: form.baseUnit, generic: nul(form.generic), companyId: form.companyId ? Number(form.companyId) : null, categoryId: form.categoryId ? Number(form.categoryId) : null,
      dosageForm: nul(form.dosageForm), strength: nul(form.strength), rx: form.rx, description: nul(form.description), usage: nul(form.usage), warnings: nul(form.warnings),
      imageUrl: nul(form.imageUrl), isActive: form.isActive, isFeatured: form.isFeatured,
      variants: form.variants.map((v) => ({ ...(v.id ? { id: v.id } : {}), label: v.label.trim(), unit: v.unit, barcode: nul(v.barcode), mrp: Number(v.mrp), price: Number(v.price), pieces: Number(v.pieces) || 1, sellOnline: v.sellOnline, sellPos: v.sellPos })),
    };
    try {
      if (form.id) await api('PUT', `/products/${form.id}`, body); else await api('POST', '/products', body);
      setForm(null); setFlash('Saved'); load();
    } catch (x) { setErr(errText(x)); }
    setBusy(false);
  }
  async function remove(r: Row) {
    if (!window.confirm(`Delete ${r.name}?`)) return;
    try { await api('DELETE', `/products/${r.id}`); setFlash('Deleted'); load(); } catch (x) { setErr(errText(x)); }
  }
  async function upload(file: File) {
    setErr('');
    const fd = new FormData(); fd.append('file', file);
    const r = await fetch('/api/admin/uploads', { method: 'POST', credentials: 'include', headers: { 'x-requested-with': 'medshop-admin' }, body: fd });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return setErr(errText(new ApiError(r.status, j.error ?? 'error')));
    setForm((f) => f && { ...f, imageUrl: j.url });
  }
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm((f) => f && { ...f, [k]: e.target.value });
  const setVar = (i: number, k: keyof Variant, v: string) => setForm((f) => f && { ...f, variants: f.variants.map((x, j) => (j === i ? { ...x, [k]: v } : x)) });
  async function fillFromLibrary() {
    if (!form?.generic.trim()) return;
    setErr('');
    try {
      const hits = await api<{ items: { id: number; name: string }[] }>('GET', `/generic-library?q=${encodeURIComponent(form.generic.trim())}&limit=5`);
      const hit = hits.items.find((g) => g.name.toLowerCase() === form.generic.trim().toLowerCase());
      if (!hit) return setErr('Not in the generic library yet. Add it under Generic library.');
      const g = await api<any>('GET', `/generic-library/${hit.id}`);
      setForm((f) => f && ({
        ...f, description: f.description || g.indications || '', usage: f.usage || g.dosage || '',
        warnings: f.warnings || [g.contraindications, g.sideEffects].filter(Boolean).join(' ') || '',
      }));
    } catch (x) { setErr(errText(x)); }
  }
  /** Adds a single-piece pack, priced from the first pack's MRP per piece, sold at the counter only. */
  function addLoose() {
    setForm((f) => {
      if (!f) return f;
      const base = f.variants[0], pcs = Number(base?.pieces) || 1;
      const mrp = base?.mrp ? (Number(base.mrp) / pcs).toFixed(2) : '', price = base?.price ? (Number(base.price) / pcs).toFixed(2) : mrp;
      return { ...f, variants: [...f.variants, { ...newVariant(), label: 'Piece', unit: 'Piece', pieces: '1', mrp, price: Number(price) > Number(mrp) ? mrp : price, sellOnline: false }] };
    });
  }
  const fileRef = useRef<HTMLInputElement>(null);
  const stockPill = (n: number) => <span className={`pill ${n === 0 ? 'st-cancelled' : n <= 10 ? 'warn' : 'ok'}`}>{n}</span>;

  return (
    <section>
      <header className="pagehead"><div><h1>Medicines</h1><p className="sub">Enter medicines here. They appear on the website once stock is received under Purchases.</p></div>
        <div className="tools">
          <label className="searchbox"><Icon name="search" size={13} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, generic or barcode" aria-label="Search medicines" /></label>
          <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category" style={{ width: 150 }}><option value="">All categories</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.nameEn}</option>)}</select>
          <select value={rx} onChange={(e) => setRx(e.target.value)} aria-label="Type" style={{ width: 130 }}><option value="">All types</option><option value="otc">OTC</option><option value="prescription">Prescription</option><option value="controlled">Controlled</option></select>
          <label className="swl"><input className="switch" type="checkbox" role="switch" checked={review} onChange={(e) => setReview(e.target.checked)} />Needs review</label>
          {canEdit && <button className="btn primary" onClick={() => open()}><Icon name="plus" size={13} />Add medicine</button>}
        </div></header>
      {flash && <div className="toast" role="status">{flash}</div>}
      {err && !form && <div className="notice err" role="alert">{err}</div>}
      <div className="panel"><table className="grid">
        <thead><tr><th>Medicine</th><th>Generic</th><th>Company</th><th>Category</th><th>Type</th><th className="r">Packs</th><th className="r">Price</th><th className="r">Stock</th><th>Status</th><th className="act" /></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className={canEdit ? 'click' : ''} onClick={() => canEdit && open(r.id)}>
              <td className="strong">{r.name} <span className="dim">{[r.strength, r.dosageForm].filter(Boolean).join(' · ')}</span></td>
              <td>{r.generic ?? <span className="dim">—</span>}</td><td>{r.company ?? <span className="dim">—</span>}</td><td>{r.category ?? <span className="dim">—</span>}</td>
              <td>{r.rx === 'otc' ? <span className="pill mute">OTC</span> : <span className="pill warn">{r.rx === 'prescription' ? 'Rx' : 'Controlled'}</span>}</td>
              <td className="num r">{r.variants}</td><td className="num r">{taka(r.price)}</td><td className="r nowrap">{stockPill(r.stock)} <span className="dim">{r.baseUnit.toLowerCase()}s</span></td>
              <td className="nowrap"><span className={`pill ${r.isActive ? 'ok' : 'mute'}`}>{r.isActive ? 'Active' : 'Inactive'}</span> {r.needsReview && <span className="pill warn" title="Starter data: confirm price, pack and manufacturer">Review</span>}</td>
              <td className="act" onClick={(e) => e.stopPropagation()}>{canEdit && <button className="icon danger" aria-label="Delete" title="Delete" onClick={() => remove(r)}><Icon name="trash" size={13} /></button>}</td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={10} className="empty">No medicines yet. Add your first one.</td></tr>}
        </tbody>
      </table><Pager page={page} size={SIZE} total={total} onPage={setPage} noun="medicines" /></div>

      {form && (
        <div className="overlay" role="dialog" aria-modal="true" onMouseDown={(e) => { if (e.target === e.currentTarget) setForm(null); }}>
          <form className="dialog xwide" onSubmit={save}>
            <div className="dhead"><h2>{form.id ? 'Edit medicine' : 'Add medicine'}</h2><button type="button" className="icon" aria-label="Close" onClick={() => setForm(null)}><Icon name="x" size={14} /></button></div>
            <div className="dbody">
              {form.needsReview && <div className="notice" style={{ background: 'var(--warn-bg)', color: 'var(--warn)' }}>Starter data. Check the price, pack size and manufacturer against the pack or supplier invoice, then save to mark it reviewed.</div>}
              <div className="cols3">
                <div className="frow span2"><label htmlFor="pn">Brand name<i>*</i></label><input id="pn" required value={form.name} onChange={set('name')} /></div>
                <div className="frow"><label htmlFor="ps">Strength</label><input id="ps" placeholder="500 mg" value={form.strength} onChange={set('strength')} /></div>
                <div className="frow span2"><label htmlFor="pg">Generic name <button type="button" className="link" onClick={fillFromLibrary}>fill empty text from library</button></label><input id="pg" list="glist" value={form.generic} onChange={(e) => { set('generic')(e); suggestGenerics(e.target.value); }} /><datalist id="glist">{generics.map((g) => <option key={g} value={g} />)}</datalist></div>
                <div className="frow"><label htmlFor="pf">Dosage form</label><select id="pf" value={form.dosageForm} onChange={set('dosageForm')}><option value="">—</option>{FORMS.map((f) => <option key={f}>{f}</option>)}</select></div>
                <div className="frow"><label htmlFor="pbu">Stock counted in</label><select id="pbu" value={form.baseUnit} onChange={set('baseUnit')}>{['Piece', 'ml', 'Bottle', 'Vial', 'Tube', 'Sachet', 'Gram'].map((u) => <option key={u}>{u}</option>)}</select></div>
                <div className="frow"><label htmlFor="pc">Company</label><select id="pc" value={form.companyId} onChange={set('companyId')}><option value="">—</option>{cos.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
                <div className="frow"><label htmlFor="pk">Category</label><select id="pk" value={form.categoryId} onChange={set('categoryId')}><option value="">—</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.nameEn}</option>)}</select></div>
                <div className="frow"><label htmlFor="pr">Sale type</label><select id="pr" value={form.rx} onChange={set('rx')}><option value="otc">OTC (over the counter)</option><option value="prescription">Prescription only</option><option value="controlled">Controlled</option></select></div>
              </div>

              <div className="vhead"><b>Packs &amp; prices</b><span className="tools">
                <button type="button" className="btn" title="Sell single pieces at the counter from the same stock" onClick={() => addLoose()}>+ Loose piece</button>
                <button type="button" className="btn" onClick={() => setForm({ ...form, variants: [...form.variants, { ...newVariant(), unit: 'Box', pieces: '100' }] })}><Icon name="plus" size={12} />Add pack</button></span></div>
              <p className="sub">All packs of a medicine share one stock, counted in {form.baseUnit.toLowerCase()}s. &ldquo;{form.baseUnit}s in pack&rdquo; says how many a strip or box contains; a single piece is 1.</p>
              <table className="grid flush vtable"><thead><tr><th>Pack label</th><th>Unit</th><th className="r">{form.baseUnit}s in pack</th><th>Barcode</th><th className="r">MRP ৳</th><th className="r">Price ৳</th><th>Online</th><th>Counter</th><th className="r">Packs in stock</th><th className="act" /></tr></thead><tbody>
                {form.variants.map((v, i) => (
                  <tr key={i}>
                    <td><input aria-label="Pack label" required placeholder="Strip of 10" value={v.label} onChange={(e) => setVar(i, 'label', e.target.value)} /></td>
                    <td><select aria-label="Unit" value={v.unit} onChange={(e) => setVar(i, 'unit', e.target.value)}>{UNITS.map((u) => <option key={u}>{u}</option>)}</select></td>
                    <td><input aria-label="Pieces in pack" required type="number" min="1" step="1" className="r" style={{ width: 70 }} value={v.pieces} onChange={(e) => setVar(i, 'pieces', e.target.value)} /></td>
                    <td><input aria-label="Barcode" className="mono" value={v.barcode} onChange={(e) => setVar(i, 'barcode', e.target.value)} /></td>
                    <td><input aria-label="MRP" required type="number" step="any" min="0.01" className="r" value={v.mrp} onChange={(e) => setVar(i, 'mrp', e.target.value)} /></td>
                    <td><input aria-label="Price" required type="number" step="any" min="0.01" className="r" value={v.price} onChange={(e) => setVar(i, 'price', e.target.value)} /></td>
                    <td><input aria-label="Sell online" type="checkbox" className="switch" checked={v.sellOnline} onChange={(e) => setForm((f) => f && { ...f, variants: f.variants.map((x, j) => (j === i ? { ...x, sellOnline: e.target.checked } : x)) })} /></td>
                    <td><input aria-label="Sell at counter" type="checkbox" className="switch" checked={v.sellPos} onChange={(e) => setForm((f) => f && { ...f, variants: f.variants.map((x, j) => (j === i ? { ...x, sellPos: e.target.checked } : x)) })} /></td>
                    <td className="num r">{v.stock ?? '—'}</td>
                    <td className="act">{form.variants.length > 1 && <button type="button" className="icon danger" aria-label="Remove pack" onClick={() => setForm({ ...form, variants: form.variants.filter((_, j) => j !== i) })}><Icon name="x" size={12} /></button>}</td>
                  </tr>
                ))}
              </tbody></table>

              <div className="cols2">
                <div className="frow"><label htmlFor="pd">Description</label><textarea id="pd" rows={2} value={form.description} onChange={set('description')} /></div>
                <div className="frow"><label htmlFor="pu">How to use</label><textarea id="pu" rows={2} value={form.usage} onChange={set('usage')} /></div>
                <div className="frow"><label htmlFor="pw">Warnings</label><textarea id="pw" rows={2} value={form.warnings} onChange={set('warnings')} /></div>
                <div className="frow"><label>Image</label>
                  <div className="imgrow">
                    {form.imageUrl ? <img src={form.imageUrl.startsWith('/uploads') ? `/api${form.imageUrl}` : form.imageUrl} alt="" /> : <span className="imgph">No image</span>}
                    <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ''; }} />
                    <button type="button" className="btn" onClick={() => fileRef.current?.click()}>Upload</button>
                    {form.imageUrl && <button type="button" className="btn" onClick={() => setForm({ ...form, imageUrl: '' })}>Remove</button>}
                  </div>
                </div>
              </div>
              <div className="switches">
                <label className="swl"><input className="switch" type="checkbox" role="switch" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />Active on website</label>
                <label className="swl"><input className="switch" type="checkbox" role="switch" checked={form.isFeatured} onChange={(e) => setForm({ ...form, isFeatured: e.target.checked })} />Featured on home page</label>
              </div>
              {err && <div className="notice err" role="alert">{err}</div>}
            </div>
            <div className="dfoot"><button type="button" className="btn" onClick={() => setForm(null)}>Cancel</button><button className="btn primary" disabled={busy}>Save medicine</button></div>
          </form>
        </div>
      )}
    </section>
  );
}
