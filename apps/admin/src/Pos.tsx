import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api';
import { PosSales } from './PosSales';
import { Receipt, type Sale } from './Receipt';
import { Icon, useErr } from './ui';
import { taka } from './Orders';
import type { Staff } from './api';

type Pack = { variantId: number; label: string; unit: string; pieces: number; price: number; mrp: number; barcode: string | null; available: number };
type Found = { productId: number; name: string; strength: string | null; dosageForm: string | null; baseUnit: string; rx: string; generic: string | null; company: string | null; units: number; nearestExpiry: string | null; matchedVariantId: number | null; packs: Pack[] };
type Line = { productId: number; name: string; strength: string | null; rx: string; baseUnit: string; units: number; nearestExpiry: string | null; packs: Pack[]; variantId: number; qty: number };
type Alt = { productId: number; name: string; strength: string | null; company: string | null; variantId: number; label: string; price: number; available: number };
type Shift = { id: number; openedAt: string; openingCash: number };
type Report = { sales: number; total: number; discount: number; byMethod: Record<string, number>; refunds: number; returns: number; openingCash: number; expectedCash: number };
type Held = { id: number; label: string | null; payload: { lines: Line[]; discount: Disc; customerPhone: string }; createdAt: string };
type Disc = { type: 'percent' | 'amount'; value: string };
type Pay = { method: 'cash' | 'card' | 'bkash' | 'nagad'; amount: string };

const WARN_DAYS = 60;
const money = (n: number) => Math.round(n * 100) / 100;
const daysTo = (d: string) => Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
const expText = (d: string | null) => (d ? new Date(d).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) : '—');
const packOf = (l: Line) => l.packs.find((p) => p.variantId === l.variantId)!;

export function Pos({ staff, onExit }: { staff: Staff; onExit: () => void }) {
  const errText = useErr();
  const canVoid = staff.role !== 'cashier';
  const [shift, setShift] = useState<Shift | null | undefined>(undefined);
  const [report, setReport] = useState<Report | null>(null);
  const [q, setQ] = useState(''); const [found, setFound] = useState<Found[]>([]); const [hi, setHi] = useState(0);
  const [lines, setLines] = useState<Line[]>([]);
  const [disc, setDisc] = useState<Disc>({ type: 'percent', value: '' });
  const [phone, setPhone] = useState(''); const [custName, setCustName] = useState(''); const [patient, setPatient] = useState(''); const [doctor, setDoctor] = useState('');
  const [err, setErr] = useState(''); const [flash, setFlash] = useState('');
  const [payOpen, setPayOpen] = useState(false); const [pays, setPays] = useState<Pay[]>([]); const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<Sale | null>(null);
  const [heldOpen, setHeldOpen] = useState(false); const [held, setHeld] = useState<Held[]>([]);
  const [histOpen, setHistOpen] = useState(false); const [endOpen, setEndOpen] = useState(false);
  const [alts, setAlts] = useState<{ for: string; items: Alt[] } | null>(null);
  const [opening, setOpening] = useState('0'); const [counted, setCounted] = useState(''); const [closed, setClosed] = useState<{ difference: number; report: Report } | null>(null);
  const [autoPrint, setAutoPrint] = useState(() => { try { return localStorage.getItem('pos.autoprint') === '1'; } catch { return false; } });
  const searchRef = useRef<HTMLInputElement>(null); const discRef = useRef<HTMLInputElement>(null);

  const loadShift = useCallback(() => api<{ shift: Shift | null; report?: Report }>('GET', '/pos/shift').then((r) => { setShift(r.shift); setReport(r.report ?? null); }).catch((e) => setErr(errText(e))), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { loadShift(); }, [loadShift]);
  useEffect(() => { if (!flash) return; const id = setTimeout(() => setFlash(''), 3000); return () => clearTimeout(id); }, [flash]);
  useEffect(() => { searchRef.current?.focus(); }, [shift, payOpen, receipt]);

  // ---- search: runs while typing; a scanner types the barcode and presses Enter
  useEffect(() => {
    const t = q.trim();
    if (!t) { setFound([]); return; }
    const id = setTimeout(() => api<Found[]>('GET', `/pos/search?q=${encodeURIComponent(t)}`).then((r) => { setFound(r); setHi(0); }).catch(() => {}), 120);
    return () => clearTimeout(id);
  }, [q]);

  // ---- bill maths
  const subtotal = useMemo(() => money(lines.reduce((s, l) => s + packOf(l).price * l.qty, 0)), [lines]);
  const discount = useMemo(() => {
    const v = Number(disc.value) || 0;
    return Math.min(subtotal, disc.type === 'percent' ? money((subtotal * Math.min(v, 100)) / 100) : money(v));
  }, [disc, subtotal]);
  const total = money(subtotal - discount);
  const unitsUsed = (productId: number) => lines.filter((l) => l.productId === productId).reduce((s, l) => s + l.qty * packOf(l).pieces, 0);
  const over = (l: Line) => unitsUsed(l.productId) > l.units;
  const needsRx = lines.some((l) => l.rx !== 'otc');
  const hasOver = lines.some(over);

  function addPack(f: Found | Line, variantId?: number) {
    const pack = f.packs.find((p) => p.variantId === (variantId ?? ('variantId' in f ? f.variantId : f.packs[0].variantId))) ?? f.packs[0];
    setLines((ls) => {
      const hit = ls.find((l) => l.variantId === pack.variantId);
      if (hit) return ls.map((l) => (l === hit ? { ...l, qty: l.qty + 1 } : l));
      return [...ls, { productId: f.productId, name: f.name, strength: f.strength, rx: f.rx, baseUnit: f.baseUnit, units: f.units, nearestExpiry: f.nearestExpiry, packs: f.packs, variantId: pack.variantId, qty: 1 }];
    });
    setQ(''); setFound([]); setAlts(null); searchRef.current?.focus();
  }
  const setLine = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const removeLine = (i: number) => setLines((ls) => ls.filter((_, j) => j !== i));
  function clearBill() { setLines([]); setDisc({ type: 'percent', value: '' }); setPhone(''); setCustName(''); setPatient(''); setDoctor(''); setErr(''); }

  async function onSearchKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(h + 1, found.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const t = q.trim(); if (!t) return;
      // a scanner can press Enter before the debounced search lands, so ask directly
      const r = found.length && found.some((f) => f.matchedVariantId) ? found : await api<Found[]>('GET', `/pos/search?q=${encodeURIComponent(t)}`).catch(() => [] as Found[]);
      const exact = r.find((f) => f.matchedVariantId);
      if (exact) return addPack(exact, exact.matchedVariantId!);
      const pick = r[hi] ?? r[0];
      if (pick) addPack(pick, pick.packs.find((p) => p.available > 0)?.variantId);
    }
    else if (e.key === 'Escape') { setQ(''); setFound([]); }
  }

  async function showAlts(f: { productId: number; name: string }) {
    const items = await api<Alt[]>('GET', `/pos/alternatives/${f.productId}`).catch(() => []);
    setAlts({ for: f.name, items });
  }

  // ---- hold / recall
  async function hold() {
    if (!lines.length) return;
    try { await api('POST', '/pos/held', { label: lines[0].name, payload: { lines, discount: disc, customerPhone: phone } }); clearBill(); setFlash('Bill held'); } catch (x) { setErr(errText(x)); }
  }
  async function openHeld() { setHeld(await api<Held[]>('GET', '/pos/held').catch(() => [])); setHeldOpen(true); }
  async function recall(h: Held) {
    if (lines.length && !window.confirm('Replace the current bill?')) return;
    setLines(h.payload.lines); setDisc(h.payload.discount); setPhone(h.payload.customerPhone ?? '');
    await api('DELETE', `/pos/held/${h.id}`).catch(() => {}); setHeldOpen(false);
  }

  // ---- payment
  function openPay() {
    if (!lines.length) return;
    if (hasOver) return setErr('Not enough stock for a line (shown in red)');
    if (needsRx && (!patient.trim() || !doctor.trim())) return setErr('Prescription medicine: enter the patient and doctor name');
    setErr(''); setPays([{ method: 'cash', amount: String(total) }]); setPayOpen(true);
  }
  const given = money(pays.reduce((s, p) => s + (Number(p.amount) || 0), 0));
  const change = money(Math.max(0, given - total));
  const short = money(Math.max(0, total - given));

  async function complete() {
    setBusy(true); setErr('');
    try {
      const sale = await api<Sale>('POST', '/pos/sales', {
        items: lines.map((l) => ({ variantId: l.variantId, qty: l.qty })),
        discount: discount > 0 ? { type: disc.type, value: Number(disc.value) } : undefined,
        payments: pays.filter((p) => Number(p.amount) > 0).map((p) => ({ method: p.method, amount: Number(p.amount) })),
        customerName: custName || null, customerPhone: phone || null, patientName: patient || null, doctorName: doctor || null,
      });
      setPayOpen(false); setReceipt(sale); clearBill(); loadShift();
      if (autoPrint) setTimeout(() => window.print(), 250);
    } catch (x) { setErr(errText(x)); }
    setBusy(false);
  }

  async function openShift(e: React.FormEvent) {
    e.preventDefault(); setErr('');
    try { await api('POST', '/pos/shift/open', { openingCash: Number(opening) || 0 }); setClosed(null); await loadShift(); } catch (x) { setErr(errText(x)); }
  }
  async function endShift(e: React.FormEvent) {
    e.preventDefault(); setErr('');
    try { const r = await api<{ report: Report; difference: number }>('POST', '/pos/shift/close', { countedCash: Number(counted) || 0 }); setClosed(r); setEndOpen(false); setCounted(''); clearBill(); await loadShift(); } catch (x) { setErr(errText(x)); }
  }

  // ---- keyboard: F2 search, F4 hold, F8 discount, F9 pay, F7 clear, Esc closes dialogs
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (payOpen && e.key === 'Enter' && !busy && short === 0 && (e.target as HTMLElement).tagName !== 'BUTTON') { e.preventDefault(); complete(); return; }
      if (e.key === 'F2') { e.preventDefault(); searchRef.current?.focus(); searchRef.current?.select(); }
      else if (e.key === 'F4') { e.preventDefault(); hold(); }
      else if (e.key === 'F7') { e.preventDefault(); if (lines.length && window.confirm('Clear this bill?')) clearBill(); }
      else if (e.key === 'F8') { e.preventDefault(); discRef.current?.focus(); discRef.current?.select(); }
      else if (e.key === 'F9') { e.preventDefault(); if (!payOpen) openPay(); }
      else if (e.key === 'Escape') { setPayOpen(false); setHeldOpen(false); setAlts(null); setEndOpen(false); if (receipt) setReceipt(null); }
    };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }); // re-bound every render so handlers always see current state

  if (shift === undefined) return <p className="dim" style={{ padding: 20 }}>Loading…</p>;

  // ---- no open shift: ask for the opening cash
  if (!shift) return (
    <div className="pos"><div className="postop"><button className="btn" onClick={onExit}>← Admin</button><b>Point of sale</b><span className="dim">{staff.name}</span></div>
      <div className="posopen">
        <form className="dialog" onSubmit={openShift} style={{ width: 380 }}>
          <div className="dhead"><h2>Open shift</h2></div>
          <div className="dbody">
            {closed && (
              <div className="notice" style={{ background: 'var(--brand-wash)', color: 'var(--brand)' }}>
                Shift closed. Sales {taka(closed.report.total)} · expected cash {taka(closed.report.expectedCash)} ·{' '}
                <b>{closed.difference === 0 ? 'cash matches' : closed.difference > 0 ? `over by ${taka(closed.difference)}` : `short by ${taka(-closed.difference)}`}</b>
              </div>
            )}
            <div className="frow"><label htmlFor="oc">Cash in the drawer (৳)</label><input id="oc" type="number" min="0" step="any" autoFocus value={opening} onChange={(e) => setOpening(e.target.value)} /></div>
            {err && <div className="notice err" role="alert">{err}</div>}
          </div>
          <div className="dfoot"><button className="btn primary">Start shift</button></div>
        </form>
      </div></div>
  );

  return (
    <div className="pos">
      <div className="postop">
        <button className="btn" onClick={onExit}>← Admin</button><b>Point of sale</b>
        <span className="dim">Shift since {new Date(shift.openedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} · {report?.sales ?? 0} sales · {taka(report?.total ?? 0)}</span>
        <span className="sp" />
        <label className="swl small"><input className="switch" type="checkbox" role="switch" checked={autoPrint} onChange={(e) => { setAutoPrint(e.target.checked); try { localStorage.setItem('pos.autoprint', e.target.checked ? '1' : '0'); } catch { /* ignore */ } }} />Auto-print</label>
        <button className="btn" onClick={openHeld}>Held bills <kbd>F4</kbd></button>
        <button className="btn" onClick={() => setHistOpen(true)}>Sales history</button>
        <button className="btn" onClick={() => { setEndOpen(true); setErr(''); loadShift(); }}>End shift</button>
        <span className="dim">{staff.name}</span>
      </div>
      {flash && <div className="toast" role="status">{flash}</div>}

      <div className="posbody">
        <div className="posleft">
          <label className="possearch"><Icon name="search" size={16} />
            <input ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onSearchKey} placeholder="Scan barcode or type medicine / generic name   (F2)" aria-label="Search medicine" autoComplete="off" /></label>
          <div className="results">
            {found.map((f, idx) => {
              const d = f.nearestExpiry ? daysTo(f.nearestExpiry) : null;
              const first = f.packs[0];
              return (
                <div key={f.productId} className={`result ${idx === hi ? 'hi' : ''} ${f.units === 0 ? 'out' : ''}`} onMouseEnter={() => setHi(idx)}>
                  <div className="rmain">
                    <b>{f.name} {f.strength}</b> <span className="dim">{f.dosageForm}</span> {f.rx !== 'otc' && <span className="pill warn">{f.rx === 'controlled' ? 'Controlled' : 'Rx'}</span>}
                    <div className="dim small">{[f.generic, f.company].filter(Boolean).join(' · ')}</div>
                  </div>
                  <div className="rstock">
                    {f.units === 0 ? <span className="pill st-cancelled">Out of stock</span> : <><span className="num">{f.units} {f.baseUnit.toLowerCase()}s</span>{first.pieces > 1 && <div className="dim small">{Math.floor(f.units / first.pieces)} × {first.unit.toLowerCase()}</div>}</>}
                    {d !== null && <div className={`small ${d <= 0 ? 'badtext' : d <= WARN_DAYS ? 'warntext' : 'dim'}`}>exp {expText(f.nearestExpiry)}{d <= WARN_DAYS ? ` · ${d}d` : ''}</div>}
                  </div>
                  <div className="rpacks">
                    {f.packs.map((p) => <button key={p.variantId} className="btn packbtn" disabled={p.available < 1} onClick={() => addPack(f, p.variantId)} title={`${p.pieces} ${f.baseUnit.toLowerCase()}${p.pieces > 1 ? 's' : ''}`}>{p.unit} <b className="num">{taka(p.price)}</b></button>)}
                    <button className="btn" onClick={() => showAlts(f)} title="Same generic, other brands">Alt</button>
                  </div>
                </div>
              );
            })}
            {!found.length && q.trim() && <p className="dim" style={{ padding: 16 }}>No match. Check the spelling or scan again.</p>}
            {!q.trim() && <div className="poshint"><p><kbd>F2</kbd> search · <kbd>Enter</kbd> add · <kbd>↑</kbd><kbd>↓</kbd> choose · <kbd>F4</kbd> hold bill · <kbd>F8</kbd> discount · <kbd>F9</kbd> pay · <kbd>F7</kbd> clear</p>
              <p className="dim">Scan a barcode, or type a brand or generic name. Pick the pack (Strip, Piece, Box) with its button; Enter adds the first pack that is in stock.</p></div>}
          </div>
        </div>

        <div className="posright">
          <div className="billhead"><b>Current bill</b><span className="dim">{lines.reduce((s, l) => s + l.qty, 0)} items</span><span className="sp" />{lines.length > 0 && <button className="link" onClick={() => { if (window.confirm('Clear this bill?')) clearBill(); }}>Clear</button>}</div>
          <div className="billlines">
            {lines.map((l, i) => {
              const p = packOf(l), d = l.nearestExpiry ? daysTo(l.nearestExpiry) : null;
              return (
                <div key={l.variantId} className={`bline ${over(l) ? 'bad' : ''}`}>
                  <div className="bl1"><b>{l.name} {l.strength}</b>{l.rx !== 'otc' && <span className="pill warn">Rx</span>}<button className="icon danger" aria-label={`Remove ${l.name}`} onClick={() => removeLine(i)}><Icon name="x" size={12} /></button></div>
                  <div className="bl2">
                    <select aria-label="Pack" value={l.variantId} onChange={(e) => setLine(i, { variantId: Number(e.target.value) })}>{l.packs.map((k) => <option key={k.variantId} value={k.variantId}>{k.label} · {taka(k.price)}</option>)}</select>
                    <div className="qstep"><button aria-label="Less" onClick={() => l.qty > 1 ? setLine(i, { qty: l.qty - 1 }) : removeLine(i)}>−</button>
                      <input aria-label={`Quantity ${l.name}`} type="number" min="1" step="1" value={l.qty} onChange={(e) => setLine(i, { qty: Math.max(1, Math.floor(Number(e.target.value)) || 1) })} />
                      <button aria-label="More" onClick={() => setLine(i, { qty: l.qty + 1 })}>+</button></div>
                    <span className="num r bltotal">{taka(p.price * l.qty)}</span>
                  </div>
                  {over(l) && <div className="small badtext">Only {l.units} {l.baseUnit.toLowerCase()}s in stock</div>}
                  {!over(l) && d !== null && d <= WARN_DAYS && <div className="small warntext">Oldest batch expires {expText(l.nearestExpiry)}</div>}
                </div>
              );
            })}
            {!lines.length && <p className="dim" style={{ padding: 16 }}>Bill is empty. Scan or search to add medicines.</p>}
          </div>

          <div className="billfoot">
            {needsRx && (
              <div className="rxbox"><span className="pill warn">Prescription</span>
                <input aria-label="Patient name" placeholder="Patient name *" value={patient} onChange={(e) => setPatient(e.target.value)} />
                <input aria-label="Doctor name" placeholder="Doctor name *" value={doctor} onChange={(e) => setDoctor(e.target.value)} /></div>
            )}
            <div className="custrow"><input aria-label="Customer phone" placeholder="Customer phone (optional)" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
              <input aria-label="Customer name" placeholder="Name (optional)" value={custName} onChange={(e) => setCustName(e.target.value)} /></div>
            <div className="sumrow2"><span>Subtotal</span><span className="num">{taka(subtotal)}</span></div>
            <div className="sumrow2"><span>Discount <kbd>F8</kbd></span>
              <span className="discin"><input ref={discRef} aria-label="Discount" type="number" min="0" step="any" value={disc.value} onChange={(e) => setDisc({ ...disc, value: e.target.value })} />
                <select aria-label="Discount type" value={disc.type} onChange={(e) => setDisc({ ...disc, type: e.target.value as Disc['type'] })}><option value="percent">%</option><option value="amount">৳</option></select>
                <span className="num dim">−{taka(discount)}</span></span></div>
            <div className="totalrow"><span>Total</span><b className="num">{taka(total)}</b></div>
            {err && !payOpen && <div className="notice err" role="alert">{err}</div>}
            <button className="btn primary paybtn" disabled={!lines.length} onClick={openPay}>Pay <kbd>F9</kbd></button>
          </div>
        </div>
      </div>

      {alts && (
        <div className="overlay" role="dialog" aria-modal="true" onMouseDown={(e) => { if (e.target === e.currentTarget) setAlts(null); }}>
          <div className="dialog"><div className="dhead"><h2>Alternatives to {alts.for}</h2><button className="icon" aria-label="Close" onClick={() => setAlts(null)}><Icon name="x" size={14} /></button></div>
            <div className="dbody">
              {alts.items.map((a) => <button key={a.variantId} className="btn altrow" onClick={() => api<Found[]>('GET', `/pos/search?q=${encodeURIComponent(a.name)}`).then((r) => { const f = r.find((x) => x.productId === a.productId); if (f) addPack(f, a.variantId); })}>
                <span><b>{a.name} {a.strength}</b> <span className="dim">{a.company}</span></span><span className="num">{taka(a.price)} <span className="dim">· {a.label} · {a.available} left</span></span></button>)}
              {!alts.items.length && <p className="dim">No in-stock alternative with the same generic and strength.</p>}
            </div></div></div>
      )}

      {payOpen && (
        <div className="overlay" role="dialog" aria-modal="true">
          <form className="dialog" onSubmit={(e) => { e.preventDefault(); if (short === 0 && !busy) complete(); }} style={{ width: 440 }}>
            <div className="dhead"><h2>Payment</h2><button type="button" className="icon" aria-label="Close" onClick={() => setPayOpen(false)}><Icon name="x" size={14} /></button></div>
            <div className="dbody">
              <div className="paytotal"><span>Amount due</span><b className="num">{taka(total)}</b></div>
              {pays.map((p, i) => (
                <div key={i} className="payrow">
                  <select aria-label="Method" value={p.method} onChange={(e) => setPays(pays.map((x, j) => (j === i ? { ...x, method: e.target.value as Pay['method'] } : x)))}><option value="cash">Cash</option><option value="card">Card</option><option value="bkash">bKash</option><option value="nagad">Nagad</option></select>
                  <input aria-label="Amount" autoFocus={i === 0} type="number" min="0" step="any" value={p.amount} onChange={(e) => setPays(pays.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} />
                  {pays.length > 1 && <button type="button" className="icon danger" aria-label="Remove payment" onClick={() => setPays(pays.filter((_, j) => j !== i))}><Icon name="x" size={12} /></button>}
                </div>
              ))}
              <div className="quick">
                <button type="button" className="btn" onClick={() => setPays([{ method: 'cash', amount: String(total) }])}>Exact</button>
                {[50, 100, 500, 1000].map((n) => <button type="button" key={n} className="btn" onClick={() => setPays([{ method: 'cash', amount: String(n) }])}>{n}</button>)}
                {pays.length < 3 && <button type="button" className="btn" onClick={() => setPays([...pays, { method: 'bkash', amount: String(short) }])}>+ Split</button>}
              </div>
              <div className="paysum">{short > 0 ? <span className="badtext">Short {taka(short)}</span> : <span>Change <b className="num bigchange">{taka(change)}</b></span>}</div>
              {err && <div className="notice err" role="alert">{err}</div>}
            </div>
            <div className="dfoot"><button type="button" className="btn" onClick={() => setPayOpen(false)}>Back</button><button className="btn primary" disabled={busy || short > 0}>{busy ? '…' : 'Complete sale'} <kbd>Enter</kbd></button></div>
          </form>
        </div>
      )}

      {receipt && (
        <div className="overlay" role="dialog" aria-modal="true">
          <div className="dialog" style={{ width: 420 }}>
            <div className="dhead"><h2>Sale complete · <span className="num">{receipt.invoiceNo}</span></h2></div>
            <div className="dbody"><div className="changebox">Change <b className="num">{taka(receipt.changeDue)}</b></div><Receipt sale={receipt} /></div>
            <div className="dfoot"><button className="btn" onClick={() => window.print()}>Print receipt</button><button className="btn primary" autoFocus onClick={() => setReceipt(null)}>New sale <kbd>Esc</kbd></button></div>
          </div>
        </div>
      )}

      {heldOpen && (
        <div className="overlay" role="dialog" aria-modal="true" onMouseDown={(e) => { if (e.target === e.currentTarget) setHeldOpen(false); }}>
          <div className="dialog"><div className="dhead"><h2>Held bills</h2><button className="icon" aria-label="Close" onClick={() => setHeldOpen(false)}><Icon name="x" size={14} /></button></div>
            <div className="dbody">
              {held.map((h) => <div key={h.id} className="heldrow"><span><b>{h.label ?? 'Bill'}</b> <span className="dim">{h.payload.lines.length} lines · {new Date(h.createdAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span></span>
                <span><button className="btn primary" onClick={() => recall(h)}>Recall</button> <button className="icon danger" aria-label="Delete held bill" onClick={() => api('DELETE', `/pos/held/${h.id}`).then(() => setHeld(held.filter((x) => x.id !== h.id)))}><Icon name="trash" size={13} /></button></span></div>)}
              {!held.length && <p className="dim">No held bills.</p>}
            </div></div></div>
      )}

      {histOpen && <PosSales canVoid={canVoid} modal onClose={() => { setHistOpen(false); loadShift(); }} />}

      {endOpen && (
        <div className="overlay" role="dialog" aria-modal="true" onMouseDown={(e) => { if (e.target === e.currentTarget) setEndOpen(false); }}>
          <form className="dialog" onSubmit={endShift} style={{ width: 420 }}>
            <div className="dhead"><h2>End shift</h2><button type="button" className="icon" aria-label="Close" onClick={() => setEndOpen(false)}><Icon name="x" size={14} /></button></div>
            <div className="dbody">
              {report && <table className="grid flush"><tbody>
                <tr><td>Bills</td><td className="num r">{report.sales}</td></tr>
                <tr><td>Sales total</td><td className="num r">{taka(report.total)}</td></tr>
                {Object.entries(report.byMethod).map(([m, a]) => <tr key={m}><td className="dim">· {m}</td><td className="num r">{taka(a)}</td></tr>)}
                <tr><td>Discounts given</td><td className="num r">{taka(report.discount)}</td></tr>
                <tr><td>Refunds paid ({report.returns})</td><td className="num r">−{taka(report.refunds)}</td></tr>
                <tr><td>Opening cash</td><td className="num r">{taka(report.openingCash)}</td></tr>
                <tr className="sumrow"><td>Cash that should be in the drawer</td><td className="num r">{taka(report.expectedCash)}</td></tr>
              </tbody></table>}
              <div className="frow"><label htmlFor="cc">Cash counted (৳)</label><input id="cc" required type="number" min="0" step="any" autoFocus value={counted} onChange={(e) => setCounted(e.target.value)} /></div>
              {err && <div className="notice err" role="alert">{err}</div>}
            </div>
            <div className="dfoot"><button type="button" className="btn" onClick={() => setEndOpen(false)}>Cancel</button><button className="btn primary">Close shift</button></div>
          </form>
        </div>
      )}
    </div>
  );
}
