import { taka } from './Orders';

export type SaleItem = { id: number; name: string; label: string; qty: number; pieces: number; unitPrice: number; mrp: number; returnedQty: number; batches: { batchNo: string; expiry: string; units: number }[] };
export type Sale = {
  id: number; invoiceNo: string; customerName: string | null; customerPhone: string | null; patientName: string | null; doctorName: string | null;
  subtotal: number; discount: number; total: number; paid: number; changeDue: number; status: 'completed' | 'voided'; note: string | null; createdAt: string; cashier: string;
  items: SaleItem[]; payments: { method: string; amount: number }[]; store: Record<string, string>;
};

const when = (s: string) => new Date(s).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
const exp = (d: string) => new Date(d).toLocaleDateString('en-GB', { month: '2-digit', year: '2-digit' });
const METHOD: Record<string, string> = { cash: 'Cash', card: 'Card', bkash: 'bKash', nagad: 'Nagad' };

/** 80 mm thermal receipt. The .receipt class is the only thing visible when printing (see styles). */
export function Receipt({ sale }: { sale: Sale }) {
  const st = sale.store;
  return (
    <div className="receipt" id="receipt">
      <div className="rc center">
        <b className="rname">{st.store_name}</b>
        {st.address && <div>{st.address}</div>}
        {st.phone && <div>Tel: {st.phone}</div>}
        {st.drug_license && <div>Drug licence: {st.drug_license}</div>}
        {st.pharmacist_name && <div>Pharmacist: {st.pharmacist_name}{st.pharmacist_reg ? ` (${st.pharmacist_reg})` : ''}</div>}
      </div>
      <div className="rline" />
      <div className="rrow"><span>Invoice</span><b>{sale.invoiceNo}</b></div>
      <div className="rrow"><span>Date</span><span>{when(sale.createdAt)}</span></div>
      <div className="rrow"><span>Cashier</span><span>{sale.cashier}</span></div>
      {sale.customerName && <div className="rrow"><span>Customer</span><span>{sale.customerName}{sale.customerPhone ? ` ${sale.customerPhone}` : ''}</span></div>}
      {sale.patientName && <div className="rrow"><span>Patient</span><span>{sale.patientName}</span></div>}
      {sale.doctorName && <div className="rrow"><span>Doctor</span><span>{sale.doctorName}</span></div>}
      {sale.status === 'voided' && <div className="rc center"><b>*** VOIDED ***</b></div>}
      <div className="rline" />
      {sale.items.map((i) => (
        <div key={i.id} className="ritem">
          <div>{i.name}</div>
          <div className="rrow small"><span>{i.qty} × {i.label} @ {taka(i.unitPrice)}</span><span>{taka(i.qty * i.unitPrice)}</span></div>
          {i.batches.length > 0 && <div className="small dimr">Batch {i.batches.map((b) => `${b.batchNo} exp ${exp(b.expiry)}`).join(', ')}</div>}
        </div>
      ))}
      <div className="rline" />
      <div className="rrow"><span>Subtotal</span><span>{taka(sale.subtotal)}</span></div>
      {sale.discount > 0 && <div className="rrow"><span>Discount</span><span>−{taka(sale.discount)}</span></div>}
      <div className="rrow big"><b>TOTAL</b><b>{taka(sale.total)}</b></div>
      {sale.payments.map((p, i) => <div key={i} className="rrow"><span>{METHOD[p.method] ?? p.method}</span><span>{taka(p.amount)}</span></div>)}
      {sale.changeDue > 0 && <div className="rrow"><span>Change</span><span>{taka(sale.changeDue)}</span></div>}
      <div className="rline" />
      <div className="rc center small">{st.receipt_footer}</div>
    </div>
  );
}
