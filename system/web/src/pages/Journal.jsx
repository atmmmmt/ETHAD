import React, { useState } from 'react';
import { AccountPicker, api, Async, Confirm, CostCenterSelect, CurrencySelect, Field, Icon, Money, Page, SOURCE, STATUS, Status, fmt, fmtDate, today, useApi, useApp } from '../lib.jsx';

export default function Journal({ args }) {
  const [a0, a1] = args;
  if (a0 === 'new') return <Editor />;
  if (a0 && /^\d+$/.test(a0)) return a1 === 'edit' ? <EditExisting id={a0} /> : <View id={a0} />;
  return <List initialStatus={a0 === 'pending' ? 'SUBMITTED' : ''} />;
}

function List({ initialStatus }) {
  const { can } = useApp();
  const [f, setF] = useState({ status: initialStatus, q: '', from: '', to: '', source: '', page: 1 });
  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString();
  const q = useApi(`/journal?${qs}`);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value, page: 1 });
  return (
    <Page actions={<>
      {can('journal.create') && <a className="btn primary" href="#/journal/new"><Icon n="plus" />قيد جديد</a>}
    </>}>
      <div className="card filters">
        <Field label="بحث"><input className="inp" placeholder="رقم، بيان، مرجع، جهة" value={f.q} onChange={set('q')} /></Field>
        <Field label="الحالة"><select className="inp" value={f.status} onChange={set('status')}><option value="">الكل</option>{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v[0]}</option>)}</select></Field>
        <Field label="المصدر"><select className="inp" value={f.source} onChange={set('source')}><option value="">الكل</option>{Object.entries(SOURCE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        <Field label="من"><input type="date" className="inp" value={f.from} onChange={set('from')} /></Field>
        <Field label="إلى"><input type="date" className="inp" value={f.to} onChange={set('to')} /></Field>
      </div>
      <Async q={q}>{(d) => (
        <div className="card">
          <h3>القيود <small>{d.total} قيدًا</small></h3>
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>الرقم</th><th>التاريخ</th><th>البيان</th><th>المصدر</th><th>المرجع</th><th className="n">المبلغ</th><th>الحالة</th></tr></thead>
            <tbody>{d.items.map((e) => (
              <tr key={e.id} className="clickable" onClick={() => (location.hash = `#/journal/${e.id}`)}>
                <td className="num">{e.number ?? <span className="muted">—</span>}</td><td className="num">{fmtDate(e.date)}</td><td>{e.description}</td>
                <td><span className="muted">{SOURCE[e.source]}</span></td><td className="code">{e.reference}</td>
                <td className="n"><Money v={e.total} cur={e.currency} /></td><td><Status s={e.status} /></td>
              </tr>))}
              {!d.items.length && <tr><td colSpan={7} className="empty">لا قيود مطابقة</td></tr>}
            </tbody>
          </table></div>
          {d.total > d.size && <div className="row" style={{ marginTop: 12 }}>
            <button className="btn sm" disabled={f.page <= 1} onClick={() => setF({ ...f, page: f.page - 1 })}>السابق</button>
            <span className="muted">صفحة {d.page} من {Math.ceil(d.total / d.size)}</span>
            <button className="btn sm" disabled={d.page * d.size >= d.total} onClick={() => setF({ ...f, page: f.page + 1 })}>التالي</button>
          </div>}
        </div>
      )}</Async>
    </Page>
  );
}

const blank = () => ({ accountCode: '', debit: '', credit: '', costCenterId: null, memo: '' });

function EditExisting({ id }) {
  const q = useApi(`/journal/${id}`);
  return <Async q={q}>{(e) => <Editor initial={{ ...e, date: fmtDate(e.date), rate: Number(e.rate),
    lines: e.lines.map((l) => ({ accountCode: l.accountCode, debit: Number(l.debit) || '', credit: Number(l.credit) || '', costCenterId: l.costCenterId, memo: l.memo || '' })) }} />}</Async>;
}

function Editor({ initial }) {
  const { base, run } = useApp();
  const [e, setE] = useState(initial || { date: today(), description: '', reference: '', party: '', currency: base, rate: '', lines: [blank(), blank()] });
  const [busy, setBusy] = useState(false);
  const setLine = (i, patch) => setE({ ...e, lines: e.lines.map((l, k) => (k === i ? { ...l, ...patch } : l)) });
  const dr = e.lines.reduce((s, l) => s + Math.round(Number(l.debit || 0) * 100), 0), cr = e.lines.reduce((s, l) => s + Math.round(Number(l.credit || 0) * 100), 0);
  const balanced = dr === cr && dr > 0;
  const save = async (submit) => {
    setBusy(true);
    const body = { ...e, rate: e.currency !== base && e.rate ? Number(e.rate) : undefined,
      lines: e.lines.filter((l) => l.accountCode).map((l) => ({ ...l, debit: Number(l.debit || 0), credit: Number(l.credit || 0) })) };
    const r = await run(async () => {
      const saved = initial ? await api(`/journal/${initial.id}`, { method: 'PUT', body }) : await api('/journal', { method: 'POST', body });
      return submit ? api(`/journal/${saved.id}/submit`, { method: 'POST' }) : saved;
    }, submit ? 'تم إرسال القيد' : 'تم حفظ المسودة');
    setBusy(false);
    if (r?.id) location.hash = `#/journal/${r.id}`;
  };
  return (
    <Page actions={<a className="btn" href="#/journal"><Icon n="left" />القيود</a>}>
      <div className="card">
        <h3>{initial ? `تعديل القيد (مسودة #${initial.id})` : 'قيد يومية جديد'}</h3>
        <div className="grid g4">
          <Field label="التاريخ"><input type="date" className="inp" value={e.date} onChange={(x) => setE({ ...e, date: x.target.value })} /></Field>
          <Field label="العملة"><CurrencySelect value={e.currency} onChange={(currency) => setE({ ...e, currency })} /></Field>
          {e.currency !== base && <Field label={`سعر الصرف (${base} لكل 1 ${e.currency})`} hint="اتركه فارغًا لاستخدام سعر اليوم المسجّل"><input className="inp n" value={e.rate} onChange={(x) => setE({ ...e, rate: x.target.value })} /></Field>}
          <Field label="المرجع / رقم المستند"><input className="inp" value={e.reference || ''} onChange={(x) => setE({ ...e, reference: x.target.value })} /></Field>
          <Field label="الجهة"><input className="inp" value={e.party || ''} onChange={(x) => setE({ ...e, party: x.target.value })} /></Field>
        </div>
        <div style={{ marginTop: 14 }}><Field label="البيان"><input className="inp" value={e.description} onChange={(x) => setE({ ...e, description: x.target.value })} /></Field></div>
      </div>
      <div className="card">
        <h3>الأسطر <small>كل سطر إما مدين أو دائن · الحسابات التجميعية لا تقبل الترحيل</small></h3>
        <div className="tbl-wrap" style={{ overflow: 'visible' }}><table className="tbl lines-tbl">
          <thead><tr><th>#</th><th style={{ width: 200 }}>الحساب</th><th className="n">مدين</th><th className="n">دائن</th><th>مركز الكلفة</th><th>شرح السطر</th><th></th></tr></thead>
          <tbody>{e.lines.map((l, i) => (
            <tr key={i}>
              <td className="muted">{i + 1}</td>
              <td><AccountPicker value={l.accountCode} onChange={(accountCode) => setLine(i, { accountCode })} /></td>
              <td><input className="inp sm n" value={l.debit} onChange={(x) => setLine(i, { debit: x.target.value, credit: x.target.value ? '' : l.credit })} /></td>
              <td><input className="inp sm n" value={l.credit} onChange={(x) => setLine(i, { credit: x.target.value, debit: x.target.value ? '' : l.debit })} /></td>
              <td><CostCenterSelect value={l.costCenterId} onChange={(costCenterId) => setLine(i, { costCenterId })} /></td>
              <td><input className="inp sm" value={l.memo} onChange={(x) => setLine(i, { memo: x.target.value })} /></td>
              <td><button className="btn sm" disabled={e.lines.length <= 2} onClick={() => setE({ ...e, lines: e.lines.filter((_, k) => k !== i) })}><Icon n="x" s={14} /></button></td>
            </tr>))}
          </tbody>
        </table></div>
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn sm" onClick={() => setE({ ...e, lines: [...e.lines, blank()] })}><Icon n="plus" s={14} />سطر</button>
          {dr !== cr && <button className="btn sm" onClick={() => { const i = e.lines.findIndex((l) => !l.debit && !l.credit); const diff = (dr - cr) / 100; const line = { [diff > 0 ? 'credit' : 'debit']: Math.abs(diff).toFixed(2) }; i >= 0 ? setLine(i, line) : setE({ ...e, lines: [...e.lines, { ...blank(), ...line }] }); }}>موازنة الفرق</button>}
        </div>
        <div className="totals-bar" style={{ marginTop: 12 }}>
          <span>مجموع المدين: <Money v={dr / 100} /></span><span>مجموع الدائن: <Money v={cr / 100} /></span>
          {balanced ? <span className="pill green"><Icon n="check" s={14} />متوازن</span> : <span className="pill red">الفرق: {fmt((dr - cr) / 100)}</span>}
        </div>
        <div className="row" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
          <button className="btn" disabled={busy || !e.description} onClick={() => save(false)}>حفظ كمسودة</button>
          <button className="btn primary" disabled={busy || !balanced || !e.description} onClick={() => save(true)}>حفظ وإرسال للترحيل</button>
        </div>
      </div>
    </Page>
  );
}

function View({ id }) {
  const { can, me, run } = useApp();
  const q = useApi(`/journal/${id}`);
  const [dlg, setDlg] = useState(null);
  const act = (path, body, msg) => run(() => api(`/journal/${id}/${path}`, { method: 'POST', body }), msg).then((r) => { if (r) { q.reload(); if (r.id && r.id !== +id) location.hash = `#/journal/${r.id}`; } return r; });
  return (
    <Page actions={<><a className="btn" href="#/journal"><Icon n="left" />القيود</a><button className="btn" onClick={() => print()}><Icon n="print" />طباعة</button></>}>
      <Async q={q}>{(e) => {
        const editable = ['DRAFT', 'REJECTED'].includes(e.status) && (e.createdById === me.id || me.role.code === 'ADMIN');
        return (<>
          <div className="card">
            <h3><span>{e.number ? `القيد رقم ${e.number}` : `مسودة #${e.id}`} <Status s={e.status} /></span>
              <span className="row no-print">
                {editable && can('journal.create') && <><a className="btn sm" href={`#/journal/${e.id}/edit`}>تعديل</a>
                  <button className="btn sm dark" onClick={() => act('submit', undefined, 'تم الإرسال')}>إرسال للترحيل</button>
                  <button className="btn sm" onClick={() => setDlg({ title: 'حذف المسودة', text: 'سيُحذف القيد نهائيًا.', danger: true, onOk: () => run(() => api(`/journal/${id}`, { method: 'DELETE' }), 'تم الحذف').then((r) => { if (r) location.hash = '#/journal'; return r; }) })}>حذف</button></>}
                {e.status === 'SUBMITTED' && can('journal.approve') && <>
                  <button className="btn sm primary" onClick={() => act('approve', undefined, 'تم الاعتماد والترحيل')}><Icon n="check" s={14} />اعتماد وترحيل</button>
                  <button className="btn sm" onClick={() => setDlg({ title: 'رفض القيد', text: 'سيعود القيد لمنشئه للتعديل.', reason: 'سبب الرفض', onOk: (reason) => act('reject', { reason }, 'تم الرفض') })}>رفض</button></>}
                {e.status === 'POSTED' && !e.reversedBy && e.source !== 'REVERSAL' && can('journal.reverse') &&
                  <button className="btn sm" onClick={() => setDlg({ title: 'عكس القيد', text: 'القيود المرحّلة لا تُعدَّل ولا تُحذف. سيُنشأ قيد عكسي مرحّل يلغي أثر هذا القيد.', reason: 'سبب العكس', danger: true, onOk: (reason) => act('reverse', { reason }, 'تم عكس القيد') })}><Icon n="undo" s={14} />عكس</button>}
              </span>
            </h3>
            {e.rejectReason && e.status === 'REJECTED' && <div className="alert bad"><Icon n="alert" />سبب الرفض: {e.rejectReason}</div>}
            <dl className="kv" style={{ marginTop: 10 }}>
              <dt>التاريخ</dt><dd className="num">{fmtDate(e.date)}</dd>
              <dt>البيان</dt><dd>{e.description}</dd>
              {e.reference && <><dt>المرجع</dt><dd>{e.reference}</dd></>}
              {e.party && <><dt>الجهة</dt><dd>{e.party}</dd></>}
              <dt>المصدر</dt><dd>{SOURCE[e.source]}</dd>
              <dt>العملة</dt><dd>{e.currency}{Number(e.rate) !== 1 && <span className="muted"> · سعر الصرف {Number(e.rate)}</span>}</dd>
              <dt>أنشأه</dt><dd>{e.createdBy} <span className="muted num">{e.createdAt.slice(0, 16).replace('T', ' ')}</span></dd>
              {e.approvedBy && <><dt>رحّله</dt><dd>{e.approvedBy} <span className="muted num">{e.postedAt?.slice(0, 16).replace('T', ' ')}</span></dd></>}
              {e.reverses && <><dt>يعكس</dt><dd><a href={`#/journal/${e.reverses.id}`}>القيد رقم {e.reverses.number}</a></dd></>}
              {e.reversedBy && <><dt>عُكس بـ</dt><dd><a href={`#/journal/${e.reversedBy.id}`}>القيد رقم {e.reversedBy.number}</a></dd></>}
            </dl>
          </div>
          <div className="card"><div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>#</th><th>الحساب</th><th>مركز الكلفة</th><th>الشرح</th><th className="n">مدين</th><th className="n">دائن</th>{e.currency !== 'USD' || Number(e.rate) !== 1 ? <><th className="n">مدين (أساس)</th><th className="n">دائن (أساس)</th></> : null}</tr></thead>
            <tbody>{e.lines.map((l) => (
              <tr key={l.id}><td className="muted">{l.lineNo}</td><td><span className="code">{l.accountCode}</span> {l.account.name}</td><td>{l.costCenter?.name || <span className="muted">—</span>}</td><td>{l.memo}</td>
                <td className="n">{Number(l.debit) ? <Money v={l.debit} /> : ''}</td><td className="n">{Number(l.credit) ? <Money v={l.credit} /> : ''}</td>
                {e.currency !== 'USD' || Number(e.rate) !== 1 ? <><td className="n muted">{Number(l.debitBase) ? <Money v={l.debitBase} /> : ''}</td><td className="n muted">{Number(l.creditBase) ? <Money v={l.creditBase} /> : ''}</td></> : null}</tr>))}
            </tbody>
            <tfoot><tr><td colSpan={4}>المجموع</td><td className="n"><Money v={e.total} /></td><td className="n"><Money v={e.total} /></td>{e.currency !== 'USD' || Number(e.rate) !== 1 ? <td colSpan={2} /> : null}</tr></tfoot>
          </table></div></div>
        </>);
      }}</Async>
      {dlg && <Confirm {...dlg} onClose={() => setDlg(null)} />}
    </Page>
  );
}
