import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from './api';
import { useT, type Key } from './i18n';
import { Icon, useErr } from './ui';

export type Field = {
  key: string; label: Key; type?: 'text' | 'number' | 'bool' | 'select' | 'password';
  options?: [string, Key][]; required?: boolean; createOnly?: boolean; nullable?: boolean; hint?: Key; list?: boolean; mono?: boolean;
};
export type Row = Record<string, any>;

type Props = {
  title: Key; path: string; fields: Field[]; idKey?: string; canCreate?: boolean; canDelete?: boolean;
  defaults?: Row; note?: Key; addLabel?: Key;
};

/** One compact table + modal form: add, edit and delete for a settings list. */
export function Crud({ title, path, fields, idKey = 'id', canCreate = true, canDelete = true, defaults = {}, note, addLabel = 'common.add' }: Props) {
  const { t } = useT();
  const errText = useErr();
  const [rows, setRows] = useState<Row[]>([]);
  const [edit, setEdit] = useState<Row | 'new' | null>(null);
  const [form, setForm] = useState<Row>({});
  const [q, setQ] = useState('');
  const [err, setErr] = useState('');
  const [flash, setFlash] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => api<Row[]>('GET', path).then(setRows).catch((e) => setErr(errText(e))), [path]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (!flash) return; const id = setTimeout(() => setFlash(''), 2500); return () => clearTimeout(id); }, [flash]);

  function open(row: Row | 'new') { setErr(''); setEdit(row); setForm(row === 'new' ? { ...defaults } : { ...row, password: '' }); }

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
    e.preventDefault(); setErr(''); setBusy(true);
    try {
      if (edit === 'new') await api('POST', path, payload()); else await api('PUT', `${path}/${(edit as Row)[idKey]}`, payload());
      setEdit(null); setFlash(t('common.saved')); await load();
    } catch (x) { setErr(errText(x)); }
    setBusy(false);
  }

  async function remove(row: Row) {
    if (!window.confirm(t('common.confirmDelete'))) return;
    setErr('');
    try { await api('DELETE', `${path}/${row[idKey]}`); setFlash(t('common.deleted')); await load(); } catch (x) { setErr(errText(x)); }
  }

  const cols = fields.filter((f) => f.list !== false && f.type !== 'password');
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? rows.filter((r) => cols.some((f) => String(r[f.key] ?? '').toLowerCase().includes(s))) : rows;
  }, [rows, q]); // eslint-disable-line react-hooks/exhaustive-deps

  const cell = (f: Field, row: Row) => {
    const v = row[f.key];
    if (f.type === 'bool') return <span className={`pill ${v ? 'ok' : 'mute'}`}>{v ? t('common.on') : t('common.off')}</span>;
    if (f.type === 'select') { const o = f.options?.find(([k]) => k === v); return o ? t(o[1]) : String(v); }
    if (v == null || v === '') return <span className="dim">—</span>;
    return f.mono || f.type === 'number' ? <span className="num">{String(v)}</span> : String(v);
  };

  return (
    <section>
      <header className="pagehead">
        <div><h1>{t(title)}</h1>{note && <p className="sub">{t(note)}</p>}</div>
        <div className="tools">
          <label className="searchbox"><Icon name="search" size={13} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('common.search')} aria-label={t('common.search')} /></label>
          {canCreate && <button className="btn primary" onClick={() => open('new')}><Icon name="plus" size={13} />{t(addLabel)}</button>}
        </div>
      </header>
      {flash && <div className="toast" role="status">{flash}</div>}
      {err && !edit && <div className="notice err" role="alert">{err}</div>}

      <div className="panel"><table className="grid">
        <thead><tr>{cols.map((f) => <th key={f.key}>{t(f.label)}</th>)}<th className="act" /></tr></thead>
        <tbody>
          {shown.map((r) => (
            <tr key={r[idKey]}>
              {cols.map((f) => <td key={f.key}>{cell(f, r)}</td>)}
              <td className="act">
                <button className="icon" title={t('common.edit')} aria-label={t('common.edit')} onClick={() => open(r)}><Icon name="edit" size={13} /></button>
                {canDelete && <button className="icon danger" title={t('common.delete')} aria-label={t('common.delete')} onClick={() => remove(r)}><Icon name="trash" size={13} /></button>}
              </td>
            </tr>
          ))}
          {!shown.length && <tr><td colSpan={cols.length + 1} className="empty">{t('common.empty')}</td></tr>}
        </tbody>
      </table><footer className="tfoot">{shown.length} {t('common.rows')}</footer></div>

      {edit && (
        <div className="overlay" role="dialog" aria-modal="true" onMouseDown={(e) => { if (e.target === e.currentTarget) setEdit(null); }}>
          <form className="dialog" onSubmit={save}>
            <div className="dhead"><h2>{edit === 'new' ? t(addLabel) : t('common.edit')}</h2><button type="button" className="icon" aria-label={t('common.close')} onClick={() => setEdit(null)}><Icon name="x" size={14} /></button></div>
            <div className="dbody">
              {fields.map((f) => {
                const locked = f.createOnly && edit !== 'new';
                const id = `f-${f.key}`;
                if (f.type === 'bool') return (
                  <div key={f.key} className="frow switchrow">
                    <label htmlFor={id}>{t(f.label)}</label>
                    <input id={id} className="switch" type="checkbox" role="switch" checked={!!form[f.key]} onChange={(e) => setForm({ ...form, [f.key]: e.target.checked })} />
                    {f.hint && <small>{t(f.hint)}</small>}
                  </div>
                );
                return (
                  <div key={f.key} className="frow">
                    <label htmlFor={id}>{t(f.label)}{f.required && !(f.type === 'password' && edit !== 'new') && <i>*</i>}</label>
                    {f.type === 'select' ? (
                      <select id={id} value={form[f.key] ?? ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}>{f.options!.map(([k, l]) => <option key={k} value={k}>{t(l)}</option>)}</select>
                    ) : (
                      <input id={id} type={f.type === 'number' ? 'number' : f.type === 'password' ? 'password' : 'text'} step={f.type === 'number' ? 'any' : undefined}
                             required={f.required && !(f.type === 'password' && edit !== 'new')} disabled={locked} autoComplete={f.type === 'password' ? 'new-password' : 'off'}
                             value={form[f.key] ?? ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                             placeholder={f.type === 'password' && edit !== 'new' ? t('staff.password.keep') : undefined} />
                    )}
                    {f.hint && <small>{t(f.hint)}</small>}
                  </div>
                );
              })}
              {err && <div className="notice err" role="alert">{err}</div>}
            </div>
            <div className="dfoot"><button type="button" className="btn" onClick={() => setEdit(null)}>{t('common.cancel')}</button><button className="btn primary" disabled={busy}>{t('common.save')}</button></div>
          </form>
        </div>
      )}
    </section>
  );
}
