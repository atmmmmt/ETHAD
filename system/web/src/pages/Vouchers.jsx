import React, { useState } from 'react';
import { AccountPicker, api, Async, CostCenterSelect, CurrencySelect, Field, Icon, Money, Page, fmtDate, today, useApi, useApp } from '../lib.jsx';

export default function Vouchers() {
  const { base, run } = useApp();
  const empty = { type: 'RECEIPT', date: today(), cashAccount: '', counterAccount: '', amount: '', currency: base, rate: '', description: '', party: '', reference: '', costCenterId: null };
  const [v, setV] = useState(empty);
  const [busy, setBusy] = useState(false);
  const recent = useApi('/journal?source=' + v.type + '&size=15');
  const set = (k) => (x) => setV({ ...v, [k]: x?.target ? x.target.value : x });
  const save = async () => {
    setBusy(true);
    const r = await run(() => api('/vouchers', { method: 'POST', body: { ...v, amount: Number(v.amount), rate: v.currency !== base && v.rate ? Number(v.rate) : undefined } }), 'تم ترحيل السند');
    setBusy(false);
    if (r) { setV({ ...empty, type: v.type, cashAccount: v.cashAccount }); recent.reload(); }
  };
  const receipt = v.type === 'RECEIPT';
  return (
    <Page>
      <div className="grid g2">
        <div className="card">
          <h3><span className="seg">
            <button className={receipt ? 'on' : ''} onClick={() => setV({ ...v, type: 'RECEIPT' })}>سند قبض</button>
            <button className={!receipt ? 'on' : ''} onClick={() => setV({ ...v, type: 'PAYMENT' })}>سند صرف</button>
          </span><small>يُرحَّل مباشرة برقم قيد</small></h3>
          <div className="grid g2">
            <Field label="التاريخ"><input type="date" className="inp" value={v.date} onChange={set('date')} /></Field>
            <Field label="المبلغ"><input className="inp n" value={v.amount} onChange={set('amount')} /></Field>
            <Field label="العملة"><CurrencySelect value={v.currency} onChange={set('currency')} /></Field>
            {v.currency !== base ? <Field label="سعر الصرف" hint="فارغ = سعر اليوم المسجّل"><input className="inp n" value={v.rate} onChange={set('rate')} /></Field> : <span />}
            <Field label={receipt ? 'الصندوق / البنك المستلم' : 'الصندوق / البنك الدافع'}><AccountPicker value={v.cashAccount} onChange={set('cashAccount')} placeholder="18…" /></Field>
            <Field label={receipt ? 'الحساب الدائن (مصدر المبلغ)' : 'الحساب المدين (وجه الصرف)'}><AccountPicker value={v.counterAccount} onChange={set('counterAccount')} /></Field>
            <Field label={receipt ? 'استلمنا من' : 'صُرف إلى'}><input className="inp" value={v.party} onChange={set('party')} /></Field>
            <Field label="مركز الكلفة"><CostCenterSelect value={v.costCenterId} onChange={set('costCenterId')} /></Field>
            <Field label="رقم الإيصال / المستند"><input className="inp" value={v.reference} onChange={set('reference')} /></Field>
          </div>
          <div style={{ marginTop: 12 }}><Field label="البيان"><input className="inp" value={v.description} onChange={set('description')} /></Field></div>
          <div className="row" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
            <button className="btn primary" disabled={busy || !v.cashAccount || !v.counterAccount || !(Number(v.amount) > 0) || !v.description} onClick={save}><Icon n="check" />ترحيل السند</button>
          </div>
        </div>
        <div className="card">
          <h3>آخر {receipt ? 'سندات القبض' : 'سندات الصرف'}</h3>
          <Async q={recent}>{(d) => <div className="list">{d.items.map((e) => (
            <a key={e.id} className="it" href={`#/journal/${e.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
              <div><div className="t">#{e.number} — {e.description}</div><div className="s">{fmtDate(e.date)} {e.party && '· ' + e.party}</div></div><b><Money v={e.total} cur={e.currency} /></b>
            </a>))}{!d.items.length && <div className="empty">لا سندات بعد</div>}</div>}</Async>
        </div>
      </div>
    </Page>
  );
}
