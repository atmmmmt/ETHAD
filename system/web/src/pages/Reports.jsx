import React, { useState } from 'react';
import { AccountPicker, Async, CostCenterSelect, Field, Icon, Money, Page, download, fmtDate, useApi, useApp } from '../lib.jsx';

const TABS = [['tb', 'ميزان المراجعة'], ['is', 'قائمة الدخل'], ['bs', 'الميزانية العمومية'], ['ledger', 'كشف حساب'], ['cc', 'مراكز الكلفة']];
const y = new Date().getFullYear();

export default function Reports({ args }) {
  const [tab, setTab] = useState(args[0] && TABS.find((t) => t[0] === args[0]) ? args[0] : 'tb');
  const [f, setF] = useState({ from: `${y}-01-01`, to: `${y}-12-31`, level: '2', account: args[1] || '', costCenterId: null });
  const { run, base } = useApp();
  const paths = {
    tb: `/reports/trial-balance?from=${f.from}&to=${f.to}&level=${f.level}`,
    is: `/reports/income-statement?from=${f.from}&to=${f.to}&level=${f.level}${f.costCenterId ? '&costCenterId=' + f.costCenterId : ''}`,
    bs: `/reports/balance-sheet?to=${f.to}&level=${f.level}`,
    ledger: f.account ? `/reports/ledger?account=${f.account}&from=${f.from}&to=${f.to}${f.costCenterId ? '&costCenterId=' + f.costCenterId : ''}` : null,
    cc: `/reports/cost-centers?from=${f.from}&to=${f.to}`,
  };
  const q = useApi(paths[tab]);
  return (
    <Page>
      <div className="tabs no-print">{TABS.map(([k, n]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{n}</button>)}</div>
      <div className="card filters no-print">
        {tab !== 'bs' && <Field label="من"><input type="date" className="inp" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></Field>}
        <Field label={tab === 'bs' ? 'حتى تاريخ' : 'إلى'}><input type="date" className="inp" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></Field>
        {['tb', 'is', 'bs'].includes(tab) && <Field label="المستوى"><select className="inp" value={f.level} onChange={(e) => setF({ ...f, level: e.target.value })}>{[1, 2, 3, 4, 5].map((l) => <option key={l} value={l}>{l}</option>)}<option value="99">تفصيلي</option></select></Field>}
        {tab === 'ledger' && <Field label="الحساب (أو حساب تجميعي)"><AccountPicker posting={false} value={f.account} onChange={(account) => setF({ ...f, account })} /></Field>}
        {['is', 'ledger'].includes(tab) && <Field label="مركز الكلفة"><CostCenterSelect all value={f.costCenterId} onChange={(costCenterId) => setF({ ...f, costCenterId })} /></Field>}
        <span style={{ flex: 1 }} />
        <button className="btn" onClick={() => print()}><Icon n="print" />طباعة</button>
        {paths[tab] && <button className="btn dark" onClick={() => run(() => download(paths[tab]))}><Icon n="dl" />Excel</button>}
      </div>
      {!paths[tab] ? <div className="empty">اختر حسابًا لعرض كشفه</div> : <Async q={q}>{(d) => (
        <div className="card">
          <p className="muted" style={{ marginBottom: 10 }}>نادي الأهلي · الاتحاد الحلبي — {TABS.find((t) => t[0] === tab)[1]} — {tab === 'bs' ? `حتى ${f.to}` : `من ${f.from} إلى ${f.to}`} — بعملة {base}</p>
          {tab === 'tb' && <TB d={d} />}{tab === 'is' && <IS d={d} />}{tab === 'bs' && <BS d={d} />}{tab === 'ledger' && <Ledger d={d} />}{tab === 'cc' && <CC d={d} />}
        </div>
      )}</Async>}
    </Page>
  );
}

const M = ({ v }) => (Number(v) ? <Money v={v} /> : <span className="muted">—</span>);

function TB({ d }) {
  return (<>
    {!d.balanced && <div className="alert bad"><Icon n="alert" />الميزان غير متوازن — راجع مدير النظام</div>}
    <div className="tbl-wrap" style={{ maxHeight: '65vh' }}><table className="tbl">
      <thead><tr><th>الرمز</th><th>الحساب</th><th className="n">افتتاحي مدين</th><th className="n">افتتاحي دائن</th><th className="n">حركة مدين</th><th className="n">حركة دائن</th><th className="n">رصيد مدين</th><th className="n">رصيد دائن</th></tr></thead>
      <tbody>{d.rows.map((r) => <tr key={r.code} className="clickable" onClick={() => (location.hash = `#/reports/ledger/${r.code}`)}><td className="code">{r.code}</td><td>{r.name}</td>
        <td className="n"><M v={r.openDebit} /></td><td className="n"><M v={r.openCredit} /></td><td className="n"><M v={r.debit} /></td><td className="n"><M v={r.credit} /></td><td className="n"><M v={r.closeDebit} /></td><td className="n"><M v={r.closeCredit} /></td></tr>)}</tbody>
      <tfoot><tr><td colSpan={2}>المجموع {d.balanced && <span className="pill green">متوازن</span>}</td>{['openDebit', 'openCredit', 'debit', 'credit', 'closeDebit', 'closeCredit'].map((k) => <td key={k} className="n"><Money v={d.totals[k]} /></td>)}</tr></tfoot>
    </table></div>
  </>);
}

const Section = ({ title, rows, total, totalLabel }) => (<>
  <div className="rep-h"><span>{title}</span></div>
  <table className="tbl"><tbody>{rows.map((r) => <tr key={r.code}><td className="code" style={{ width: 100 }}>{r.code}</td><td>{r.name}</td><td className="n"><Money v={r.amount} color /></td></tr>)}
    {!rows.length && <tr><td colSpan={3} className="muted">لا حركات</td></tr>}</tbody>
    <tfoot><tr><td colSpan={2}>{totalLabel}</td><td className="n"><Money v={total} color /></td></tr></tfoot></table>
</>);

function IS({ d }) {
  return (<>
    <Section title="الإيرادات" rows={d.revenues} total={d.totalRevenue} totalLabel="مجموع الإيرادات" />
    <Section title="النفقات" rows={d.expenses} total={d.totalExpense} totalLabel="مجموع النفقات" />
    <div className="totals-bar" style={{ marginTop: 12, justifyContent: 'space-between', background: 'var(--ink)', color: '#fff' }}><span>{d.net >= 0 ? 'فائض الفترة' : 'عجز الفترة'}</span><b><Money v={d.net} /></b></div>
  </>);
}

function BS({ d }) {
  return (<>
    {!d.balanced && <div className="alert bad"><Icon n="alert" />الميزانية غير متوازنة</div>}
    <div className="grid g2">
      <div><Section title="الأصول" rows={d.assets} total={d.totalAssets} totalLabel="مجموع الأصول" /></div>
      <div><Section title="الخصوم وحقوق النادي" rows={[...d.liabilities, { code: '', name: 'نتيجة الفترة (فائض / عجز)', amount: d.result }]} total={d.totalLiabilities} totalLabel="المجموع" /></div>
    </div>
  </>);
}

function Ledger({ d }) {
  return (
    <div className="tbl-wrap" style={{ maxHeight: '65vh' }}><table className="tbl">
      <thead><tr><th>التاريخ</th><th>القيد</th><th>الحساب</th><th>البيان</th><th>مركز الكلفة</th><th className="n">مدين</th><th className="n">دائن</th><th className="n">الرصيد</th></tr></thead>
      <tbody>
        <tr><td colSpan={7}><b>رصيد أول المدة</b></td><td className="n"><b><Money v={d.opening} color /></b></td></tr>
        {d.rows.map((r, i) => <tr key={i} className="clickable" onClick={() => (location.hash = `#/journal/${r.entryId}`)}>
          <td className="num">{fmtDate(r.date)}</td><td className="num">{r.number}</td><td className="code">{r.account}</td><td>{r.description}{r.currency !== 'USD' && r.debitFx + r.creditFx ? <small className="muted"> ({(r.debitFx || r.creditFx).toLocaleString('en-US')} {r.currency})</small> : null}</td>
          <td>{r.costCenter}</td><td className="n"><M v={r.debit} /></td><td className="n"><M v={r.credit} /></td><td className="n"><Money v={r.balance} color /></td></tr>)}
      </tbody>
      <tfoot><tr><td colSpan={5}>المجموع والرصيد الختامي</td><td className="n"><Money v={d.totalDebit} /></td><td className="n"><Money v={d.totalCredit} /></td><td className="n"><Money v={d.closing} color /></td></tr></tfoot>
    </table></div>
  );
}

function CC({ d }) {
  const t = d.reduce((s, r) => ({ revenue: s.revenue + r.revenue, expense: s.expense + r.expense }), { revenue: 0, expense: 0 });
  return (
    <div className="tbl-wrap"><table className="tbl">
      <thead><tr><th>المركز</th><th>النوع</th><th className="n">الإيرادات</th><th className="n">النفقات</th><th className="n">الصافي</th></tr></thead>
      <tbody>{d.map((r) => <tr key={r.id}><td><span className="code">{r.code}</span> {r.name}</td><td className="muted">{{ SPORT: 'لعبة', DEPARTMENT: 'قسم', PROJECT: 'مشروع' }[r.type]}</td>
        <td className="n"><M v={r.revenue} /></td><td className="n"><M v={r.expense} /></td><td className="n"><Money v={r.net} color /></td></tr>)}</tbody>
      <tfoot><tr><td colSpan={2}>المجموع</td><td className="n"><Money v={t.revenue} /></td><td className="n"><Money v={t.expense} /></td><td className="n"><Money v={t.revenue - t.expense} color /></td></tr></tfoot>
    </table></div>
  );
}
