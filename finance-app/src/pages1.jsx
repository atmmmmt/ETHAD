import React, { useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Legend } from 'recharts';
import {
  ACC, CHILDREN, ROOT_GROUPS, TODAY, YEAR, MONTHS, SPORTS, accPath, bal, isLeaf, ledger, monthly, rollup, sportOf, realParent,
  accName,
} from './data.js';
import { AccountPicker, Bars, Icon, Modal, Money, downloadCSV, useStore } from './store.jsx';

const go = (h) => (location.hash = h);

/* ==========================================================================
   Dashboard
   ========================================================================== */
export function Dashboard() {
  const { state } = useStore();
  const R = useMemo(() => rollup(ledger(state.entries)), [state.entries]);
  const ytd = useMemo(() => rollup(ledger(state.entries, { from: YEAR + '-01-01' })), [state.entries]);
  const cur = TODAY.slice(0, 7);
  const mon = useMemo(() => rollup(ledger(state.entries, { from: cur + '-01', to: cur + '-31' })), [state.entries]);

  const cash = bal(R['181'], '181');
  const bank = bal(R['182'], '182');
  const revYTD = bal(ytd['43'], '43');
  const expYTD = bal(ytd['33'], '33');
  const revM = bal(mon['43'], '43');
  const expM = bal(mon['33'], '33');

  const inc = monthly(state.entries, '43', 'cr');
  const exp = monthly(state.entries, '33', 'dr');
  const chart = MONTHS.slice(0, +TODAY.slice(5, 7)).map((m, i) => ({ m, 'الواردات': inc[i], 'النفقات': exp[i] }));

  // overdue investors
  const overdue = state.investors.flatMap((iv) => iv.schedule.filter((s) => !s.paid && s.due <= TODAY).map((s) => ({ iv, s })));
  const overdueTotal = overdue.reduce((a, o) => a + o.s.amount, 0);

  // spend by sport (YTD)
  const sportSpend = {};
  Object.entries(ledger(state.entries, { from: YEAR + '-01-01' })).forEach(([code, v]) => {
    if (code[0] !== '3') return;
    const sp = sportOf(code);
    if (sp) sportSpend[sp] = (sportSpend[sp] || 0) + v.dr - v.cr;
  });

  const groups = ['331', '332', '338', '339'].map((c) => ({ name: ACC[c].name, value: bal(ytd[c], c) }));
  const budgetAlerts = Object.entries(state.budgets.groups)
    .map(([c, b]) => ({ c, b, v: bal(ytd[c], c), p: (bal(ytd[c], c) / b) * 100 }))
    .filter((x) => x.p >= 70)
    .sort((a, b) => b.p - a.p);

  const payDraft = state.payroll[cur];
  const recent = [...state.entries].sort((a, b) => b.no - a.no).slice(0, 6);

  return (
    <div className="page">
      <div className="grid g5">
        <button className="kpi hero" onClick={() => go('#/accounts/18')}><small>السيولة الحالية</small><b><Money v={cash + bank} /></b><span>مصارف <Money v={bank} /> · صندوق <Money v={cash} /></span></button>
        <button className="kpi" onClick={() => go('#/reports')}><small>الواردات منذ بداية العام</small><b><Money v={revYTD} /></b><span className="muted">هذا الشهر <Money v={revM} /></span></button>
        <button className="kpi" onClick={() => go('#/reports')}><small>النفقات منذ بداية العام</small><b><Money v={expYTD} /></b><span className="muted">هذا الشهر <Money v={expM} /></span></button>
        <button className="kpi" onClick={() => go('#/reports')}><small>صافي النتيجة</small><b className={revYTD - expYTD < 0 ? 'neg' : 'pos'}><Money v={revYTD - expYTD} /></b><span className="muted">{revYTD - expYTD < 0 ? 'عجز' : 'وفر'} الدورة الحالية</span></button>
        <button className="kpi" onClick={() => go('#/investors')}><small>مستحقات متأخرة</small><b className="neg"><Money v={overdueTotal} /></b><span className="neg">{overdue.length} دفعة متأخرة</span></button>
      </div>

      <div className="grid g3">
        <div className="card span2">
          <h3>الواردات مقابل النفقات <small>شهريًا · {YEAR}</small></h3>
          <div className="chart-box">
            <ResponsiveContainer>
              <BarChart data={chart} barGap={2} margin={{ left: 10, right: 10 }}>
                <CartesianGrid vertical={false} stroke="#F0EDEA" />
                <XAxis dataKey="m" tickLine={false} axisLine={false} reversed />
                <YAxis orientation="right" tickLine={false} axisLine={false} tickFormatter={(v) => '$' + v / 1000 + 'k'} width={50} />
                <Tooltip formatter={(v) => '$' + Math.round(v).toLocaleString('en-US')} cursor={{ fill: '#F5F3F1' }} />
                <Legend iconType="circle" />
                <Bar dataKey="الواردات" fill="#2563EB" radius={[4, 4, 0, 0]} maxBarSize={22} />
                <Bar dataKey="النفقات" fill="#D71920" radius={[4, 4, 0, 0]} maxBarSize={22} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="card">
          <h3>تنبيهات <small>تحتاج انتباه</small></h3>
          <div className="list">
            {overdue.slice(0, 4).map(({ iv, s }) => (
              <div className="it" key={iv.id + s.due}><div><div className="t">{iv.name}</div><div className="s">دفعة مستحقة {s.due}</div></div><span className="pill red"><Money v={s.amount} /></span></div>
            ))}
            {budgetAlerts.slice(0, 3).map((x) => (
              <div className="it" key={x.c}><div><div className="t">{ACC[x.c].name}</div><div className="s">استهلك {Math.round(x.p)}% من الموازنة</div></div><span className={'pill ' + (x.p >= 100 ? 'red' : 'amber')}>{Math.round(x.p)}%</span></div>
            ))}
            {payDraft && payDraft.status !== 'posted' && (
              <div className="it"><div><div className="t">رواتب {MONTHS[+cur.slice(5) - 1]}</div><div className="s">مسودة بانتظار الترحيل</div></div><button className="btn sm" onClick={() => go('#/payroll')}>فتح</button></div>
            )}
          </div>
        </div>
      </div>

      <div className="grid g3">
        <div className="card">
          <h3>النفقات حسب اللعبة <small>منذ بداية العام</small></h3>
          <Bars rows={Object.keys(SPORTS).filter((k) => sportSpend[k]).map((k) => ({ name: SPORTS[k], value: sportSpend[k] || 0, budget: state.budgets.sports[k] }))} />
          <p className="muted" style={{ marginTop: 12, fontSize: 12 }}>مستخرجة تلقائيًا من حسابات النشاط الرياضي (332 · 339) حسب اللعبة.</p>
        </div>
        <div className="card">
          <h3>النفقات حسب البند <small>منذ بداية العام</small></h3>
          <Bars rows={groups} />
        </div>
        <div className="card">
          <h3>آخر القيود <button className="btn sm" onClick={() => go('#/journal')}>الكل</button></h3>
          <div className="list">
            {recent.map((e) => (
              <div className="it" key={e.id}><div style={{ minWidth: 0 }}><div className="t" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.desc}</div><div className="s">قيد {e.no} · {e.date}</div></div><Money v={e.lines.reduce((a, l) => a + (+l.dr || 0), 0)} /></div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ==========================================================================
   Chart of accounts
   ========================================================================== */
export function Accounts({ focus }) {
  const { state } = useStore();
  const R = useMemo(() => rollup(ledger(state.entries)), [state.entries]);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(() => new Set(['G1', 'G2', 'G3', 'G4', ...(focus ? [focus.slice(0, 2), focus] : [])]));
  const [hideZero, setHideZero] = useState(false);
  const [sel, setSel] = useState(null);

  const toggle = (k) => setOpen((o) => { const n = new Set(o); n.has(k) ? n.delete(k) : n.add(k); return n; });

  const rows = [];
  const walk = (code, depth) => {
    const v = R[code];
    if (hideZero && !v) return;
    rows.push({ code, depth });
    if (open.has(code)) (CHILDREN[code] || []).forEach((c) => walk(c, depth + 1));
  };
  let searchRows = null;
  if (q.trim()) {
    const t = q.trim();
    searchRows = Object.values(ACC).filter((a) => a.code.startsWith(t) || a.name.includes(t)).slice(0, 200);
  } else {
    ROOT_GROUPS.forEach((g) => {
      rows.push({ code: 'G' + g.key, depth: 0, group: g });
      if (open.has('G' + g.key)) (CHILDREN.root || []).filter((c) => c[0] === g.key).forEach((c) => walk(c, 1));
    });
  }

  const exportAll = () => downloadCSV('دليل-الحسابات', [['رقم الحساب', 'اسم الحساب', 'العائدية', 'مدين', 'دائن', 'الرصيد'],
    ...Object.values(ACC).map((a) => [a.code, a.name, { bs: 'ميزانية', pl: 'أرباح وخسائر', tr: 'متاجرة' }[a.kind], R[a.code]?.dr || 0, R[a.code]?.cr || 0, bal(R[a.code], a.code)])]);

  const Row = ({ code, depth, group }) => {
    const a = group ? { code: '', name: group.name } : ACC[code];
    const v = R[code];
    const kids = group || CHILDREN[code];
    return (
      <tr className={'tree-row lvl-' + Math.min(depth + 2, 4) + (!kids ? ' clickable' : '')} onClick={() => !kids && setSel(code)}>
        <td>
          <span className="tw" style={{ paddingRight: depth * 22 }}>
            {kids ? <button onClick={(e) => { e.stopPropagation(); toggle(code); }}><Icon n={open.has(code) ? 'down' : 'left'} s={14} /></button> : <span style={{ width: 22 }} />}
            <span className="code">{a.code}</span>
          </span>
        </td>
        <td>{a.name}</td>
        <td>{group ? '' : <span className="pill">{{ bs: 'ميزانية', pl: 'أرباح وخسائر', tr: 'متاجرة' }[a.kind]}</span>}</td>
        <td className="n">{v ? <Money v={v.dr} /> : '—'}</td>
        <td className="n">{v ? <Money v={v.cr} /> : '—'}</td>
        <td className="n"><b>{v ? <Money v={bal(v, group ? group.key : code)} color /> : '—'}</b></td>
      </tr>
    );
  };

  return (
    <div className="page">
      <div className="row">
        <div className="search"><Icon n="search" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث في 2,238 حسابًا بالرقم أو الاسم…" /></div>
        <label className="row" style={{ gap: 6 }}><input type="checkbox" checked={hideZero} onChange={(e) => setHideZero(e.target.checked)} /> إخفاء الحسابات بلا حركة</label>
        <span style={{ flex: 1 }} />
        <button className="btn" onClick={() => setOpen(new Set(['G1', 'G2', 'G3', 'G4']))}>طيّ الكل</button>
        <button className="btn" onClick={exportAll}><Icon n="dl" /> تصدير Excel</button>
      </div>
      <div className="alert ok"><Icon n="check" />دليل الحسابات منقول كما هو من النظام الحالي: {Object.keys(ACC).length.toLocaleString('en-US')} حسابًا بنفس الأرقام والتسلسل.</div>
      <div className="tbl-wrap" style={{ maxHeight: 'calc(100vh - 250px)' }}>
        <table className="tbl">
          <thead><tr><th style={{ width: 230 }}>رقم الحساب</th><th>اسم الحساب</th><th>العائدية</th><th className="n">مدين</th><th className="n">دائن</th><th className="n">الرصيد</th></tr></thead>
          <tbody>
            {searchRows
              ? searchRows.map((a) => <Row key={a.code} code={a.code} depth={0} />)
              : rows.map((r) => <Row key={r.code} {...r} />)}
          </tbody>
        </table>
      </div>
      {sel && <AccountStatement code={sel} onClose={() => setSel(null)} />}
    </div>
  );
}

export function AccountStatement({ code, onClose }) {
  const { state } = useStore();
  let run = 0;
  const lines = state.entries
    .filter((e) => e.status === 'posted')
    .flatMap((e) => e.lines.filter((l) => l.acc === code).map((l) => ({ e, l })))
    .sort((a, b) => a.e.date.localeCompare(b.e.date) || a.e.no - b.e.no)
    .map((x) => {
      run += (code[0] === '1' || code[0] === '3') ? (+x.l.dr || 0) - (+x.l.cr || 0) : (+x.l.cr || 0) - (+x.l.dr || 0);
      return { ...x, run };
    });
  return (
    <Modal title={`كشف حساب: ${code} · ${ACC[code].name}`} onClose={onClose}
      footer={<><span className="muted">{accPath(code)}</span><div className="row">
        <button className="btn" onClick={() => downloadCSV('كشف-' + code, [['التاريخ', 'القيد', 'البيان', 'مدين', 'دائن', 'الرصيد'], ...lines.map((x) => [x.e.date, x.e.no, x.e.desc, x.l.dr, x.l.cr, x.run])])}><Icon n="dl" /> تصدير</button>
        <button className="btn" onClick={() => window.print()}><Icon n="print" /> طباعة</button></div></>}>
      {lines.length ? (
        <div className="tbl-wrap" style={{ maxHeight: 460 }}>
          <table className="tbl">
            <thead><tr><th>التاريخ</th><th>القيد</th><th>البيان</th><th className="n">مدين</th><th className="n">دائن</th><th className="n">الرصيد</th></tr></thead>
            <tbody>{lines.map((x, i) => (
              <tr key={i}><td className="num">{x.e.date}</td><td className="num">{x.e.no}</td><td>{x.e.desc}</td><td className="n">{x.l.dr ? <Money v={+x.l.dr} d={2} /> : ''}</td><td className="n">{x.l.cr ? <Money v={+x.l.cr} d={2} /> : ''}</td><td className="n"><b><Money v={x.run} d={2} color /></b></td></tr>
            ))}</tbody>
          </table>
        </div>
      ) : <div className="empty">لا توجد حركات على هذا الحساب بعد.</div>}
    </Modal>
  );
}

/* ==========================================================================
   Journal
   ========================================================================== */
const SRC = { manual: ['يدوي', ''], receipt: ['سند قبض', 'blue'], payment: ['سند صرف', 'amber'], payroll: ['رواتب', 'dark'], investor: ['مستثمر', 'green'], opening: ['افتتاحي', ''], reversal: ['عكس', 'red'] };

export function Journal() {
  const { state, dispatch, notify } = useStore();
  const [q, setQ] = useState('');
  const [src, setSrc] = useState('all');
  const [month, setMonth] = useState('all');
  const [edit, setEdit] = useState(null);
  const [view, setView] = useState(null);

  const list = useMemo(() => [...state.entries].sort((a, b) => b.no - a.no).filter((e) =>
    (src === 'all' || e.source === src) &&
    (month === 'all' || e.date.slice(5, 7) === month) &&
    (!q || e.desc.includes(q) || String(e.no) === q || e.lines.some((l) => l.acc.startsWith(q)))
  ), [state.entries, q, src, month]);

  const total = list.reduce((a, e) => a + e.lines.reduce((s, l) => s + (+l.dr || 0), 0), 0);

  return (
    <div className="page">
      <div className="row">
        <div className="search"><Icon n="search" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="بحث بالبيان أو رقم القيد أو رقم الحساب…" /></div>
        <select className="inp" style={{ width: 150 }} value={src} onChange={(e) => setSrc(e.target.value)}>
          <option value="all">كل الأنواع</option>
          {Object.entries(SRC).map(([k, [n]]) => <option key={k} value={k}>{n}</option>)}
        </select>
        <select className="inp" style={{ width: 150 }} value={month} onChange={(e) => setMonth(e.target.value)}>
          <option value="all">كل الأشهر</option>
          {MONTHS.map((m, i) => <option key={i} value={String(i + 1).padStart(2, '0')}>{m}</option>)}
        </select>
        <span style={{ flex: 1 }} />
        <button className="btn" onClick={() => downloadCSV('القيود', [['رقم', 'التاريخ', 'البيان', 'الحساب', 'اسم الحساب', 'مدين', 'دائن'], ...list.flatMap((e) => e.lines.map((l) => [e.no, e.date, e.desc, l.acc, accName(l.acc), l.dr, l.cr]))])}><Icon n="dl" /> تصدير</button>
        <button className="btn primary" onClick={() => setEdit({})}><Icon n="plus" /> قيد جديد</button>
      </div>
      <div className="tbl-wrap" style={{ maxHeight: 'calc(100vh - 200px)' }}>
        <table className="tbl">
          <thead><tr><th>رقم</th><th>التاريخ</th><th>البيان</th><th>النوع</th><th>الحسابات</th><th className="n">المبلغ</th><th></th></tr></thead>
          <tbody>
            {list.map((e) => (
              <tr key={e.id} className="clickable" onClick={() => setView(e)}>
                <td className="num"><b>{e.no}</b></td>
                <td className="num">{e.date}</td>
                <td>{e.desc}</td>
                <td><span className={'pill ' + SRC[e.source]?.[1]}>{SRC[e.source]?.[0]}</span></td>
                <td className="muted" style={{ fontSize: 12 }}>{e.lines.map((l) => accName(l.acc)).slice(0, 2).join(' / ')}{e.lines.length > 2 ? ` +${e.lines.length - 2}` : ''}</td>
                <td className="n"><Money v={e.lines.reduce((a, l) => a + (+l.dr || 0), 0)} d={2} /></td>
                <td>{e.reversedBy && <span className="pill red">معكوس</span>}</td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr><td colSpan={5}>{list.length} قيدًا</td><td className="n"><Money v={total} d={2} /></td><td /></tr></tfoot>
        </table>
      </div>
      {edit && <EntryModal onClose={() => setEdit(null)} onSave={(entry) => { dispatch({ type: 'addEntry', entry }); notify('تم حفظ القيد وترحيله'); setEdit(null); }} />}
      {view && <EntryView e={view} onClose={() => setView(null)} onReverse={() => { dispatch({ type: 'reverseEntry', id: view.id }); notify('تم إنشاء قيد عكسي'); setView(null); }} />}
    </div>
  );
}

function EntryView({ e, onClose, onReverse }) {
  const tot = e.lines.reduce((a, l) => a + (+l.dr || 0), 0);
  return (
    <Modal title={`القيد رقم ${e.no}`} onClose={onClose} footer={<>
      <span className="muted">لا يُحذف أي قيد — التصحيح يتم بقيد عكسي يبقى أثره في السجل.</span>
      <div className="row">
        <button className="btn" onClick={() => window.print()}><Icon n="print" /> طباعة</button>
        {!e.reversedBy && e.source !== 'reversal' && <button className="btn" onClick={onReverse}><Icon n="undo" /> عكس القيد</button>}
      </div></>}>
      <div className="grid g3">
        <div><div className="muted">التاريخ</div><b className="num">{e.date}</b></div>
        <div><div className="muted">النوع</div><span className={'pill ' + SRC[e.source]?.[1]}>{SRC[e.source]?.[0]}</span></div>
        <div><div className="muted">المبلغ</div><b><Money v={tot} d={2} /></b></div>
      </div>
      <div><div className="muted">البيان</div><b>{e.desc}</b></div>
      <div className="tbl-wrap"><table className="tbl">
        <thead><tr><th>الحساب</th><th>اسم الحساب</th><th>ملاحظة</th><th className="n">مدين</th><th className="n">دائن</th></tr></thead>
        <tbody>{e.lines.map((l, i) => <tr key={i}><td className="code">{l.acc}</td><td>{accName(l.acc)}<div className="muted" style={{ fontSize: 11 }}>{accPath(l.acc)}</div></td><td>{l.memo}</td><td className="n">{+l.dr ? <Money v={+l.dr} d={2} /> : ''}</td><td className="n">{+l.cr ? <Money v={+l.cr} d={2} /> : ''}</td></tr>)}</tbody>
        <tfoot><tr><td colSpan={3}>المجموع</td><td className="n"><Money v={tot} d={2} /></td><td className="n"><Money v={e.lines.reduce((a, l) => a + (+l.cr || 0), 0)} d={2} /></td></tr></tfoot>
      </table></div>
    </Modal>
  );
}

export function EntryModal({ onClose, onSave, preset }) {
  const [date, setDate] = useState(preset?.date || TODAY);
  const [desc, setDesc] = useState(preset?.desc || '');
  const [lines, setLines] = useState(preset?.lines || [{ acc: '', dr: '', cr: '', memo: '' }, { acc: '', dr: '', cr: '', memo: '' }]);
  const set = (i, k, v) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, [k]: v, ...(k === 'dr' && v ? { cr: '' } : {}), ...(k === 'cr' && v ? { dr: '' } : {}) } : l)));
  const dr = lines.reduce((a, l) => a + (+l.dr || 0), 0);
  const cr = lines.reduce((a, l) => a + (+l.cr || 0), 0);
  const diff = Math.round((dr - cr) * 100) / 100;
  const valid = desc.trim() && dr > 0 && diff === 0 && lines.every((l) => (!l.dr && !l.cr) || l.acc) && lines.filter((l) => l.acc && (+l.dr || +l.cr)).length >= 2;
  const save = () => valid && onSave({ date, desc: desc.trim(), source: 'manual', lines: lines.filter((l) => l.acc && (+l.dr || +l.cr)).map((l) => ({ ...l, dr: +l.dr || 0, cr: +l.cr || 0 })) });
  return (
    <div onKeyDown={(e) => { if (e.ctrlKey && e.key === 'Enter') save(); }}>
      <Modal title="قيد يومية جديد" onClose={onClose} footer={<>
        {diff === 0 && dr > 0 ? <span className="pill green"><Icon n="check" s={14} /> القيد متوازن</span> : <span className="pill red">الفرق: <Money v={diff} d={2} /></span>}
        <div className="row"><span className="muted" style={{ fontSize: 12 }}>Ctrl + Enter للحفظ</span><button className="btn" onClick={onClose}>إلغاء</button><button className="btn primary" disabled={!valid} onClick={save}><Icon n="check" /> حفظ وترحيل</button></div>
      </>}>
        <div className="grid" style={{ gridTemplateColumns: '180px 1fr' }}>
          <div className="field"><label>التاريخ</label><input type="date" className="inp" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div className="field"><label>البيان *</label><input className="inp" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="مثال: دفع فاتورة كهرباء المقر — أيلول" autoFocus /></div>
        </div>
        <div className="tbl-wrap" style={{ overflow: 'visible' }}>
          <table className="tbl">
            <thead><tr><th style={{ width: '42%' }}>الحساب</th><th>ملاحظة</th><th className="n" style={{ width: 130 }}>مدين</th><th className="n" style={{ width: 130 }}>دائن</th><th style={{ width: 40 }} /></tr></thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i}>
                  <td><AccountPicker value={l.acc} onChange={(v) => set(i, 'acc', v)} /></td>
                  <td><input className="inp sm" value={l.memo} onChange={(e) => set(i, 'memo', e.target.value)} /></td>
                  <td><input className="inp sm n" inputMode="decimal" value={l.dr} onChange={(e) => set(i, 'dr', e.target.value.replace(/[^\d.]/g, ''))} /></td>
                  <td><input className="inp sm n" inputMode="decimal" value={l.cr} onChange={(e) => set(i, 'cr', e.target.value.replace(/[^\d.]/g, ''))} /></td>
                  <td>{lines.length > 2 && <button className="btn sm" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}><Icon n="x" s={14} /></button>}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr><td colSpan={2}><button className="btn sm" onClick={() => setLines((ls) => [...ls, { acc: '', dr: '', cr: '', memo: '' }])}><Icon n="plus" s={14} /> سطر</button></td><td className="n"><Money v={dr} d={2} /></td><td className="n"><Money v={cr} d={2} /></td><td /></tr></tfoot>
          </table>
        </div>
      </Modal>
    </div>
  );
}
