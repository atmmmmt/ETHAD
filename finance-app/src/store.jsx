import React, { createContext, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { buildSeed, payrollEntry, TODAY, LEAVES, ACC, accPath } from './data.js';

/* ==========================================================================
   Store — useReducer + localStorage (MVP; backend comes later)
   ========================================================================== */
const KEY = 'ahli-finance-mvp-v1';
const Ctx = createContext(null);

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* storage blocked — fall back to seed */ }
  return buildSeed();
}

function renumber(entries) {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date) || a.no - b.no);
  sorted.forEach((e, i) => (e.no = i + 1));
  return sorted;
}

const log = (s, action, detail) => [{ at: new Date().toISOString(), user: 'مستخدم تجريبي', action, detail }, ...(s.audit || [])].slice(0, 300);

function reducer(s, a) {
  switch (a.type) {
    case 'addEntry': {
      const e = { ...a.entry, id: 'J' + Date.now(), no: 1e9, status: 'posted' };
      return { ...s, entries: renumber([...s.entries, e]), audit: log(s, 'إضافة قيد', e.desc) };
    }
    case 'reverseEntry': {
      const src = s.entries.find((e) => e.id === a.id);
      if (!src || src.reversedBy) return s;
      const rev = {
        id: 'R' + Date.now(), no: 1e9, date: TODAY, desc: `عكس القيد رقم ${src.no} — ${src.desc}`, source: 'reversal', status: 'posted',
        lines: src.lines.map((l) => ({ ...l, dr: l.cr, cr: l.dr })), reverses: src.id,
      };
      return {
        ...s,
        entries: renumber([...s.entries.map((e) => (e.id === src.id ? { ...e, reversedBy: rev.id } : e)), rev]),
        audit: log(s, 'عكس قيد', `القيد ${src.no}`),
      };
    }
    case 'setPayRow': {
      const run = s.payroll[a.month] || { status: 'draft', rows: {} };
      if (run.status === 'posted') return s;
      return { ...s, payroll: { ...s.payroll, [a.month]: { ...run, rows: { ...run.rows, [a.emp]: { ...(run.rows[a.emp] || {}), [a.field]: a.value } } } } };
    }
    case 'newPayMonth': {
      if (s.payroll[a.month]) return s;
      return { ...s, payroll: { ...s.payroll, [a.month]: { status: 'draft', rows: {} } } };
    }
    case 'postPayroll': {
      const run = s.payroll[a.month];
      if (!run || run.status === 'posted') return s;
      const e = payrollEntry(s, a.month, 1e9);
      return {
        ...s,
        payroll: { ...s.payroll, [a.month]: { ...run, status: 'posted' } },
        entries: renumber([...s.entries, e]),
        audit: log(s, 'ترحيل رواتب', a.month),
      };
    }
    case 'saveEmployee': {
      const exists = s.employees.some((e) => e.id === a.emp.id);
      const employees = exists ? s.employees.map((e) => (e.id === a.emp.id ? a.emp : e)) : [...s.employees, a.emp];
      return { ...s, employees, audit: log(s, exists ? 'تعديل موظف' : 'إضافة موظف', a.emp.name) };
    }
    case 'setBudget': {
      return { ...s, budgets: { ...s.budgets, [a.kind]: { ...s.budgets[a.kind], [a.key]: a.value } }, audit: log(s, 'تعديل موازنة', `${a.key} = ${a.value}`) };
    }
    case 'payInstallment': {
      const iv = s.investors.find((x) => x.id === a.inv);
      const inst = iv.schedule[a.idx];
      if (inst.paid) return s;
      const e = {
        id: 'J' + Date.now(), no: 1e9, date: TODAY, desc: `قبض دفعة — ${iv.name} (استحقاق ${inst.due})`, source: 'investor', status: 'posted',
        lines: [{ acc: s.settings.bank, dr: inst.amount, cr: 0, memo: '' }, { acc: iv.revenue, dr: 0, cr: inst.amount, memo: '' }],
      };
      const investors = s.investors.map((x) => (x.id !== a.inv ? x : { ...x, schedule: x.schedule.map((sc, i) => (i === a.idx ? { ...sc, paid: true, paidOn: TODAY } : sc)) }));
      return { ...s, investors, entries: renumber([...s.entries, e]), audit: log(s, 'قبض دفعة مستثمر', iv.name) };
    }
    case 'setSettings':
      return { ...s, settings: { ...s.settings, ...a.patch } };
    case 'replace':
      return a.state;
    case 'reset':
      return buildSeed();
    default:
      return s;
  }
}

export function StoreProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, null, load);
  const [toast, setToast] = useState(null);
  const tRef = useRef();
  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignore */ }
  }, [state]);
  const notify = (msg) => {
    setToast(msg);
    clearTimeout(tRef.current);
    tRef.current = setTimeout(() => setToast(null), 2600);
  };
  const value = useMemo(() => ({ state, dispatch, notify }), [state]);
  return (
    <Ctx.Provider value={value}>
      {children}
      {toast && <div className="toast"><Icon n="check" />{toast}</div>}
    </Ctx.Provider>
  );
}
export const useStore = () => useContext(Ctx);

/* ==========================================================================
   Shared UI
   ========================================================================== */
const PATHS = {
  home: 'M3 10a2 2 0 0 1 .7-1.5l7-6a2 2 0 0 1 2.6 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8',
  tree: 'M3 5h6M3 12h6M3 19h6M13 5h8M13 12h8M13 19h8',
  book: 'M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20',
  receipt: 'M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1ZM16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8M12 17.5v-11',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  pie: 'M21 12c.55 0 1-.45.95-1A10 10 0 0 0 13 2.05c-.55-.05-1 .4-1 .95v8a1 1 0 0 0 1 1zM21.21 15.89A10 10 0 1 1 8 2.83',
  brief: 'M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16M2 8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z',
  chart: 'M3 3v16a2 2 0 0 0 2 2h16M18 17V9M13 17V5M8 17v-3',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z',
  plus: 'M12 5v14M5 12h14',
  check: 'M20 6 9 17l-5-5',
  x: 'M18 6 6 18M6 6l12 12',
  search: 'M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM21 21l-4.3-4.3',
  down: 'm6 9 6 6 6-6',
  left: 'm15 18-6-6 6-6',
  undo: 'M3 7v6h6M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13',
  print: 'M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z',
  dl: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  alert: 'm21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3M12 9v4M12 17h.01',
  wallet: 'M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4',
};
export function Icon({ n, s }) {
  return <svg className="i" viewBox="0 0 24 24" style={s ? { width: s, height: s } : null}><path d={PATHS[n]} /></svg>;
}

export function Money({ v, d = 0, color }) {
  const neg = v < 0;
  return (
    <span className={'num' + (color && neg ? ' neg' : '')}>
      {neg ? '−' : ''}${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })}
    </span>
  );
}

export function Modal({ title, onClose, children, footer, size }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={'modal ' + (size || '')}>
        <header><h2>{title}</h2><button className="btn sm" onClick={onClose}><Icon n="x" /></button></header>
        <div className="body">{children}</div>
        {footer && <footer>{footer}</footer>}
      </div>
    </div>
  );
}

// searchable account selector — posting accounts (leaves) only
export function AccountPicker({ value, onChange, filter, placeholder = 'ابحث بالرقم أو الاسم…', autoFocus }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [hl, setHl] = useState(0);
  const pool = useMemo(() => (filter ? LEAVES.filter((a) => filter(a.code)) : LEAVES), [filter]);
  const list = useMemo(() => {
    const t = q.trim();
    if (!t) return pool.slice(0, 40);
    return pool.filter((a) => a.code.startsWith(t) || a.name.includes(t)).slice(0, 40);
  }, [q, pool]);
  const pick = (code) => { onChange(code); setOpen(false); setQ(''); };
  return (
    <div className="picker">
      <input
        className="inp sm"
        autoFocus={autoFocus}
        value={open ? q : value ? `${value} · ${ACC[value]?.name}` : ''}
        placeholder={placeholder}
        onFocus={() => { setOpen(true); setHl(0); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => { setQ(e.target.value); setHl(0); }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setHl((h) => Math.min(h + 1, list.length - 1)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setHl((h) => Math.max(h - 1, 0)); }
          if (e.key === 'Enter' && list[hl]) { e.preventDefault(); pick(list[hl].code); }
        }}
      />
      {open && (
        <div className="menu">
          {list.length ? list.map((a, i) => (
            <div key={a.code} className={'opt' + (i === hl ? ' hl' : '')} onMouseDown={() => pick(a.code)}>
              <span className="code">{a.code}</span>
              <div><div>{a.name}</div><small>{accPath(a.code)}</small></div>
            </div>
          )) : <div className="empty">لا يوجد حساب مطابق</div>}
        </div>
      )}
    </div>
  );
}

export function Bars({ rows }) {
  // rows: [{ name, value, budget?, label? }]
  const max = Math.max(1, ...rows.map((r) => Math.max(r.value, r.budget || 0)));
  return (
    <div className="bars">
      {rows.map((r) => {
        const pct = r.budget ? (r.value / r.budget) * 100 : null;
        const cls = pct == null ? '' : pct >= 100 ? 'over' : pct >= 85 ? 'warn' : pct >= 70 ? 'warn' : 'ok';
        const w = r.budget ? Math.min(100, pct) : (r.value / max) * 100;
        return (
          <div className="bar-row" key={r.name} title={r.title || r.name}>
            <span className="nm">{r.name}</span>
            <div className="track"><i className={cls} style={{ width: w + '%' }} /></div>
            <span className="v">{r.label ?? (pct != null ? `${Math.round(pct)}% · $${Math.round(r.value).toLocaleString('en-US')}` : `$${Math.round(r.value).toLocaleString('en-US')}`)}</span>
          </div>
        );
      })}
    </div>
  );
}

export function downloadCSV(name, rows) {
  const csv = '﻿' + rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = name + '.csv';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
