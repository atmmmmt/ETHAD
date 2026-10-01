import React, { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Async, Icon, Money, MONTHS, Page, SOURCE, fmtDate, useApi, useApp } from '../lib.jsx';

export default function Dashboard() {
  const { base, can } = useApp();
  const [year, setYear] = useState(new Date().getFullYear());
  const q = useApi(`/dashboard?year=${year}`);
  return (
    <Page actions={<>
      <select className="inp" style={{ width: 120 }} value={year} onChange={(e) => setYear(+e.target.value)}>{[0, 1, 2].map((k) => <option key={k}>{new Date().getFullYear() - k}</option>)}</select>
      <span className="muted">كل المبالغ بالعملة الأساسية ({base}) ومن القيود المرحّلة فقط</span>
    </>}>
      <Async q={q}>{(d) => (<>
        <div className="grid g4">
          <div className="kpi hero"><small>النقدية والبنوك</small><b><Money v={d.kpis.cash} d={0} /></b><span>رصيد المجموعة 18 حتى اليوم</span></div>
          <div className="kpi"><small>إيرادات السنة</small><b><Money v={d.kpis.revenueYtd} d={0} /></b><span className="pos">هذا الشهر: <Money v={d.kpis.monthRevenue} d={0} /></span></div>
          <div className="kpi"><small>نفقات السنة</small><b><Money v={d.kpis.expenseYtd} d={0} /></b><span className="neg">هذا الشهر: <Money v={d.kpis.monthExpense} d={0} /></span></div>
          <div className="kpi"><small>{d.kpis.netYtd >= 0 ? 'الفائض' : 'العجز'}</small><b className={d.kpis.netYtd < 0 ? 'neg' : 'pos'}><Money v={d.kpis.netYtd} d={0} /></b>
            <span>{can('journal.approve') ? <a href="#/journal/pending">{d.kpis.pendingApprovals} قيد بانتظار اعتمادك</a> : ' '}</span></div>
        </div>
        <div className="grid g3">
          <div className="card span2"><h3>الإيرادات والنفقات الشهرية <small>{year}</small></h3>
            <div className="chart-box"><ResponsiveContainer>
              <BarChart data={d.monthly.map((m) => ({ ...m, name: MONTHS[m.month - 1] }))}>
                <CartesianGrid vertical={false} stroke="#EEE" /><XAxis dataKey="name" reversed tick={{ fontSize: 11 }} /><YAxis orientation="right" tick={{ fontSize: 11 }} width={70} />
                <Tooltip formatter={(v) => Number(v).toLocaleString('en-US')} /><Legend />
                <Bar dataKey="revenue" name="الإيرادات" fill="#0B0B0D" radius={[4, 4, 0, 0]} /><Bar dataKey="expense" name="النفقات" fill="#D71920" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer></div>
          </div>
          <div className="card"><h3>النقدية حسب الحساب</h3>
            <div className="list">{d.cash.length ? d.cash.map((c) => <a key={c.code} className="it" href={`#/reports/ledger/${c.code}`} style={{ textDecoration: 'none', color: 'inherit' }}><div><div className="t">{c.name}</div><div className="s code">{c.code}</div></div><b><Money v={c.balance} color /></b></a>) : <div className="empty">لا أرصدة بعد</div>}</div>
          </div>
        </div>
        <div className="grid g3">
          <div className="card"><h3>الألعاب والأقسام <small>صافي السنة</small></h3>
            <div className="list">{d.centers.length ? d.centers.map((c) => <div key={c.id} className="it"><div><div className="t">{c.name}</div><div className="s">إيراد <Money v={c.revenue} d={0} /> · نفقات <Money v={c.expense} d={0} /></div></div><b><Money v={c.net} d={0} color /></b></div>) : <div className="empty">لم تُسجَّل حركات على مراكز الكلفة</div>}</div>
          </div>
          <div className="card"><h3>أقساط مستثمرين متأخرة</h3>
            <div className="list">{d.overdue.length ? d.overdue.map((o) => <div key={o.id} className="it"><div><div className="t">{o.investor}</div><div className="s">استحق {fmtDate(o.dueDate)}</div></div><b className="neg"><Money v={o.amount} cur={o.currency} /></b></div>) : <div className="empty"><Icon n="check" /> لا أقساط متأخرة</div>}</div>
          </div>
          <div className="card"><h3>آخر القيود المرحّلة</h3>
            <div className="list">{d.recent.map((e) => <a key={e.id} className="it" href={`#/journal/${e.id}`} style={{ textDecoration: 'none', color: 'inherit' }}><div><div className="t">#{e.number} — {e.description}</div><div className="s">{fmtDate(e.date)} · {SOURCE[e.source]}</div></div><b><Money v={e.total} cur={e.currency} /></b></a>)}</div>
          </div>
        </div>
      </>)}</Async>
    </Page>
  );
}
