import React, { useRef, useState } from 'react';
import { api, Async, CurrencySelect, Field, Icon, Money, Page, fmtDate, useApi, useApp } from '../lib.jsx';

const KINDS = {
  accounts: ['دليل الحسابات', 'أعمدة: رمز الحساب، اسم الحساب. تُضاف الحسابات الجديدة فقط ويُكتشف الأب من الرمز.'],
  balances: ['الأرصدة الافتتاحية (ميزان المراجعة)', 'أعمدة: رمز الحساب، مدين، دائن (أو الرصيد). يُنشأ قيد افتتاحي واحد ويُقيَّد أي فرق على 220001.'],
  transactions: ['الحركات (القيود التاريخية)', 'أعمدة: التاريخ، رقم القيد، البيان، رمز الحساب، مدين، دائن، مركز الكلفة (اختياري)، العملة (اختياري). الأسطر بنفس رقم القيد تُجمَع في قيد واحد.'],
};

export default function Imports() {
  const { run, base } = useApp();
  const list = useApi('/imports');
  const [kind, setKind] = useState('accounts'), [date, setDate] = useState(`${new Date().getFullYear()}-01-01`), [currency, setCurrency] = useState(base);
  const [result, setResult] = useState(null), [rec, setRec] = useState(null), [busy, setBusy] = useState(false);
  const file = useRef();
  const validate = async (f) => {
    if (!f) return;
    const fd = new FormData(); fd.append('kind', kind); fd.append('date', date); fd.append('currency', currency); fd.append('file', f);
    setBusy(true); setRec(null);
    const r = await run(() => api('/imports/validate', { method: 'POST', form: fd }));
    setBusy(false); file.current.value = '';
    if (r) { setResult(r); list.reload(); }
  };
  const commit = async (id) => {
    setBusy(true);
    const r = await run(() => api(`/imports/${id}/commit`, { method: 'POST' }), 'تم الترحيل بنجاح');
    setBusy(false);
    if (r) { setResult(null); list.reload(); setRec(await api(`/imports/${id}/reconcile`)); }
  };
  return (
    <Page>
      <div className="alert warn"><Icon n="alert" />الترحيل يتم على خطوتين: <b>فحص</b> الملف (لا يمس الدفاتر) ثم <b>اعتماد</b> الدفعة كاملة أو لا شيء، ثم تقرير مطابقة. احفظ ملفات الراشد بصيغة xlsx.</div>
      <div className="grid g2">
        <div className="card">
          <h3>1 · رفع ملف وفحصه</h3>
          <div className="seg" style={{ marginBottom: 12 }}>{Object.entries(KINDS).map(([k, [n]]) => <button key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>{n.split(' ')[0]} {n.split(' ')[1]}</button>)}</div>
          <p className="muted" style={{ marginBottom: 12 }}>{KINDS[kind][1]}</p>
          {kind !== 'accounts' && <div className="grid g2" style={{ marginBottom: 12 }}>
            {kind === 'balances' && <Field label="تاريخ الأرصدة"><input type="date" className="inp" value={date} onChange={(e) => setDate(e.target.value)} /></Field>}
            <Field label="عملة الملف"><CurrencySelect value={currency} onChange={setCurrency} /></Field>
          </div>}
          <label className="drop"><input ref={file} type="file" accept=".xlsx,.csv" hidden onChange={(e) => validate(e.target.files[0])} />
            <Icon n="up" s={28} /><div>{busy ? 'جارٍ المعالجة…' : 'اضغط لاختيار ملف xlsx أو csv'}</div></label>
        </div>
        <div className="card">
          <h3>2 · نتيجة الفحص والاعتماد</h3>
          {!result && !rec && <div className="empty">ارفع ملفًا لعرض النتيجة</div>}
          {result && (<>
            <div className={'alert ' + (result.status === 'VALIDATED' ? 'ok' : 'bad')}><Icon n={result.status === 'VALIDATED' ? 'check' : 'alert'} />{result.status === 'VALIDATED' ? 'الملف سليم وجاهز للاعتماد' : 'في الملف أخطاء يجب تصحيحها ثم إعادة الرفع'}</div>
            <dl className="kv" style={{ margin: '12px 0' }}>{Object.entries(result.summary).map(([k, v]) => <React.Fragment key={k}><dt>{{ rows: 'عدد الأسطر', new: 'حسابات جديدة', existing: 'موجودة مسبقًا', accounts: 'عدد الحسابات', totalDebit: 'مجموع المدين', totalCredit: 'مجموع الدائن', difference: 'الفرق', entries: 'عدد القيود' }[k] || k}</dt><dd className="num">{typeof v === 'number' ? v.toLocaleString('en-US') : v}</dd></React.Fragment>)}</dl>
            {result.issues.length > 0 && <div className="tbl-wrap" style={{ maxHeight: 240 }}><table className="tbl"><thead><tr><th>السطر</th><th>النوع</th><th>الملاحظة</th></tr></thead>
              <tbody>{result.issues.map((i, k) => <tr key={k}><td className="num">{i.row || '—'}</td><td>{i.level === 'error' ? <span className="pill red">خطأ</span> : <span className="pill amber">تنبيه</span>}</td><td>{i.message}</td></tr>)}</tbody></table></div>}
            {result.status === 'VALIDATED' && <button className="btn primary block" style={{ marginTop: 12 }} disabled={busy} onClick={() => commit(result.id)}>اعتماد وترحيل الدفعة</button>}
          </>)}
          {rec && <Reconcile r={rec} />}
        </div>
      </div>
      <Async q={list}>{(rows) => (
        <div className="card"><h3>سجل دفعات الترحيل</h3><div className="tbl-wrap"><table className="tbl">
          <thead><tr><th>#</th><th>النوع</th><th>الملف</th><th>التاريخ</th><th>الحالة</th><th></th></tr></thead>
          <tbody>{rows.map((b) => <tr key={b.id}><td className="num">{b.id}</td><td>{KINDS[b.kind]?.[0]}</td><td>{b.fileName}</td><td className="num">{b.createdAt.slice(0, 16).replace('T', ' ')}</td>
            <td>{{ VALIDATED: <span className="pill amber">مفحوص</span>, COMMITTED: <span className="pill green">مُرحّل</span>, FAILED: <span className="pill red">فيه أخطاء</span> }[b.status]}</td>
            <td>{b.status === 'COMMITTED' && <button className="btn sm" onClick={async () => setRec(await api(`/imports/${b.id}/reconcile`))}>المطابقة</button>}
              {b.status === 'VALIDATED' && <button className="btn sm primary" onClick={() => commit(b.id)}>اعتماد</button>}</td></tr>)}</tbody>
        </table></div></div>
      )}</Async>
    </Page>
  );
}

function Reconcile({ r }) {
  if (r.kind === 'accounts') return <div className={'alert ' + (r.ok ? 'ok' : 'bad')}>مطابقة الدليل: {r.found} من {r.expected} حسابًا موجودة</div>;
  return (<>
    <div className={'alert ' + (r.ok ? 'ok' : 'bad')}><Icon n={r.ok ? 'check' : 'alert'} />تقرير المطابقة: {r.accounts} حسابًا — {r.mismatches ? `${r.mismatches} فروقات` : 'مطابق تمامًا بين الملف والدفاتر'}</div>
    <div className="tbl-wrap" style={{ maxHeight: 260, marginTop: 10 }}><table className="tbl"><thead><tr><th>الحساب</th><th className="n">في الملف</th><th className="n">في الدفاتر</th><th className="n">الفرق</th></tr></thead>
      <tbody>{r.rows.map((x) => <tr key={x.code}><td className="code">{x.code}</td><td className="n"><Money v={x.file} color /></td><td className="n"><Money v={x.ledger} color /></td><td className="n">{x.diff ? <span className="neg"><Money v={x.diff} /></span> : <Icon n="check" s={14} />}</td></tr>)}</tbody></table></div>
  </>);
}
