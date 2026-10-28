import { useCallback, useEffect, useState } from 'react';
import { api } from './api';

export type Field = {
  key: string; label: string; type?: 'text' | 'number' | 'bool' | 'select' | 'password';
  options?: [string, string][]; required?: boolean; createOnly?: boolean; nullable?: boolean; hint?: string; list?: boolean;
  render?: (v: unknown, row: Row) => React.ReactNode;
};
export type Row = Record<string, any>;

type Props = {
  title: string; path: string; fields: Field[]; idKey?: string; canCreate?: boolean; canDelete?: boolean;
  defaults?: Row; note?: string; addLabel?: string;
};

/** One table + form that covers add, edit and delete for a settings list. */
export function Crud({ title, path, fields, idKey = 'id', canCreate = true, canDelete = true, defaults = {}, note, addLabel = 'যোগ করুন' }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [edit, setEdit] = useState<Row | 'new' | null>(null);
  const [form, setForm] = useState<Row>({});
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => api<Row[]>('GET', path).then(setRows).catch((e) => setErr(e.message)), [path]);
  useEffect(() => { load(); }, [load]);

  function open(row: Row | 'new') {
    setErr(''); setMsg('');
    setEdit(row);
    setForm(row === 'new' ? { ...defaults } : { ...row, password: '' });
  }

  function payload() {
    const out: Row = {};
    for (const f of fields) {
      if (f.createOnly && edit !== 'new') continue;
      let v = form[f.key];
      if (f.type === 'number') v = v === '' || v == null ? (f.nullable ? null : 0) : Number(v);
      else if (f.type === 'bool') v = !!v;
      else if (typeof v === 'string') { v = v.trim(); if (v === '' && (f.nullable || (f.type === 'password' && edit !== 'new'))) v = f.type === 'password' ? undefined : null; }
      if (v !== undefined) out[f.key] = v;
    }
    return out;
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      if (edit === 'new') await api('POST', path, payload());
      else await api('PUT', `${path}/${(edit as Row)[idKey]}`, payload());
      setEdit(null); setMsg('সংরক্ষিত হয়েছে'); await load();
    } catch (x) { setErr((x as Error).message); }
    setBusy(false);
  }

  async function remove(row: Row) {
    if (!window.confirm('মুছে ফেলতে চান?')) return;
    setErr(''); setMsg('');
    try { await api('DELETE', `${path}/${row[idKey]}`); setMsg('মুছে ফেলা হয়েছে'); await load(); }
    catch (x) { setErr((x as Error).message); }
  }

  const cols = fields.filter((f) => f.list !== false && f.type !== 'password');
  const show = (f: Field, row: Row) => {
    const v = row[f.key];
    if (f.render) return f.render(v, row);
    if (f.type === 'bool') return v ? <span className="chip ok">চালু</span> : <span className="chip off">বন্ধ</span>;
    if (f.type === 'select') return f.options?.find(([k]) => k === v)?.[1] ?? String(v);
    return v == null || v === '' ? '—' : String(v);
  };

  return (
    <section>
      <div className="bar"><h2>{title}</h2>{canCreate && <button className="btn" onClick={() => open('new')}>＋ {addLabel}</button>}</div>
      {note && <p className="muted">{note}</p>}
      {msg && <p className="okmsg" role="status">{msg}</p>}
      {err && !edit && <p className="errmsg" role="alert">{err}</p>}
      <div className="tablewrap"><table>
        <thead><tr>{cols.map((f) => <th key={f.key}>{f.label}</th>)}<th /></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r[idKey]}>
              {cols.map((f) => <td key={f.key}>{show(f, r)}</td>)}
              <td className="actions"><button className="link" onClick={() => open(r)}>এডিট</button>{canDelete && <button className="link danger" onClick={() => remove(r)}>মুছুন</button>}</td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={cols.length + 1} className="muted">কিছু নেই</td></tr>}
        </tbody>
      </table></div>

      {edit && (
        <div className="modal" role="dialog" aria-modal="true" onClick={(e) => { if (e.target === e.currentTarget) setEdit(null); }}>
          <form className="card" onSubmit={save}>
            <h3>{edit === 'new' ? addLabel : 'এডিট'}</h3>
            {fields.map((f) => {
              const locked = f.createOnly && edit !== 'new';
              const id = `f-${f.key}`;
              return (
                <div key={f.key} className="field">
                  {f.type === 'bool' ? (
                    <label className="check"><input id={id} type="checkbox" checked={!!form[f.key]} onChange={(e) => setForm({ ...form, [f.key]: e.target.checked })} /> {f.label}</label>
                  ) : (
                    <>
                      <label htmlFor={id}>{f.label}{f.required && ' *'}</label>
                      {f.type === 'select' ? (
                        <select id={id} value={form[f.key] ?? ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}>{f.options!.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
                      ) : (
                        <input id={id} type={f.type === 'number' ? 'number' : f.type === 'password' ? 'password' : 'text'} step={f.type === 'number' ? 'any' : undefined}
                               required={f.required && !(f.type === 'password' && edit !== 'new')} disabled={locked} autoComplete={f.type === 'password' ? 'new-password' : 'off'}
                               value={form[f.key] ?? ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                               placeholder={f.type === 'password' && edit !== 'new' ? 'বদলাতে চাইলে লিখুন' : undefined} />
                      )}
                    </>
                  )}
                  {f.hint && <small className="muted">{f.hint}</small>}
                </div>
              );
            })}
            {err && <p className="errmsg" role="alert">{err}</p>}
            <div className="row"><button className="btn" disabled={busy}>{busy ? '…' : 'সংরক্ষণ'}</button><button type="button" className="btn ghost" onClick={() => setEdit(null)}>বাতিল</button></div>
          </form>
        </div>
      )}
    </section>
  );
}
