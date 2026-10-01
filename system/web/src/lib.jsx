import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

/* ------------------------------------------------------------------ API --- */
const KEY = 'ahli.token';
export const token = { get: () => { try { return sessionStorage.getItem(KEY); } catch { return null; } }, set: (t) => { try { t ? sessionStorage.setItem(KEY, t) : sessionStorage.removeItem(KEY); } catch {} } };

export async function api(path, { method = 'GET', body, form } = {}) {
  const headers = {};
  const t = token.get();
  if (t) headers.authorization = `Bearer ${t}`;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const r = await fetch('/api' + path, { method, headers, body: form ?? (body !== undefined ? JSON.stringify(body) : undefined) });
  if (r.status === 401 && t) { token.set(null); window.dispatchEvent(new Event('ahli:logout')); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(Array.isArray(j.message) ? j.message.join('، ') : j.message || 'حدث خطأ غير متوقع');
  return j;
}

/** Downloads an Excel export (the API returns xlsx when format=xlsx). */
export async function download(path) {
  const r = await fetch('/api' + path + (path.includes('?') ? '&' : '?') + 'format=xlsx', { headers: { authorization: `Bearer ${token.get()}` } });
  if (!r.ok) throw new Error('تعذر تنزيل الملف');
  const name = decodeURIComponent((r.headers.get('content-disposition') || '').split("''")[1] || 'report.xlsx');
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(await r.blob()), download: name });
  a.click(); URL.revokeObjectURL(a.href);
}

export function useApi(path, deps = []) {
  const [state, set] = useState({ data: null, error: null, loading: true });
  const reload = useCallback(() => {
    if (!path) return set({ data: null, error: null, loading: false });
    set((s) => ({ ...s, loading: true }));
    api(path).then((data) => set({ data, error: null, loading: false }), (e) => set({ data: null, error: e.message, loading: false }));
  }, [path]);
  useEffect(reload, [reload, ...deps]);
  return { ...state, reload };
}

/* ------------------------------------------------------- session & toast --- */
const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

export function AppProvider({ me, settings, onLogout, children }) {
  const [toast, setToast] = useState(null);
  const timer = useRef();
  const notify = useCallback((msg, kind = 'ok') => { setToast({ msg, kind }); clearTimeout(timer.current); timer.current = setTimeout(() => setToast(null), 3800); }, []);
  const can = useCallback((p) => me.role.permissions.includes('*') || me.role.permissions.includes(p), [me]);
  /** Runs an async action, toasting the error; returns the result or undefined. */
  const run = useCallback(async (fn, okMsg) => { try { const r = await fn(); if (okMsg) notify(okMsg); return r ?? true; } catch (e) { notify(e.message, 'bad'); } }, [notify]);
  return (
    <Ctx.Provider value={{ me, settings, can, notify, run, onLogout, base: settings.baseCurrency }}>
      {children}
      {toast && <div className={'toast ' + toast.kind}><Icon n={toast.kind === 'bad' ? 'alert' : 'check'} />{toast.msg}</div>}
    </Ctx.Provider>
  );
}

/* ------------------------------------------------------------- formatting --- */
export const MONTHS = ['كانون الثاني', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران', 'تموز', 'آب', 'أيلول', 'تشرين الأول', 'تشرين الثاني', 'كانون الأول'];
export const today = () => new Date().toISOString().slice(0, 10);
export const fmtDate = (d) => (d ? String(d).slice(0, 10) : '—');
export const fmt = (v, d = 2) => Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
export function Money({ v, d = 2, cur, color }) {
  const n = Number(v || 0);
  return <span className={'num' + (color && n < 0 ? ' neg' : '')}>{n < 0 ? '−' : ''}{fmt(Math.abs(n), d)}{cur ? ' ' + cur : ''}</span>;
}
export const STATUS = {
  DRAFT: ['مسودة', ''], SUBMITTED: ['بانتظار الاعتماد', 'amber'], POSTED: ['مرحّل', 'green'], REVERSED: ['معكوس', 'dark'], REJECTED: ['مرفوض', 'red'],
};
export const SOURCE = { MANUAL: 'يدوي', RECEIPT: 'سند قبض', PAYMENT: 'سند صرف', PAYROLL: 'رواتب', INVESTOR: 'مستثمرون', OPENING: 'افتتاحي', IMPORT: 'مستورد', REVERSAL: 'عكسي', CLOSING: 'إقفال' };
export const Status = ({ s }) => <span className={'pill ' + (STATUS[s]?.[1] || '')}>{STATUS[s]?.[0] || s}</span>;

/* ------------------------------------------------------------------ icons --- */
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
  plus: 'M12 5v14M5 12h14', check: 'M20 6 9 17l-5-5', x: 'M18 6 6 18M6 6l12 12',
  search: 'M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM21 21l-4.3-4.3', down: 'm6 9 6 6 6-6', left: 'm15 18-6-6 6-6',
  undo: 'M3 7v6h6M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13',
  print: 'M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z',
  dl: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3', up: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12',
  alert: 'm21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3M12 9v4M12 17h.01',
  wallet: 'M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4',
  lock: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4', shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9', eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  cal: 'M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM16 2v4M8 2v4M3 10h18',
};
export function Icon({ n, s }) { return <svg className="i" viewBox="0 0 24 24" style={s ? { width: s, height: s } : null}><path d={PATHS[n] || PATHS.check} /></svg>; }

/* ---------------------------------------------------------------- widgets --- */
export function Modal({ title, onClose, children, footer, size }) {
  useEffect(() => { const k = (e) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={'modal ' + (size || '')} role="dialog" aria-label={title}>
        <header><h2>{title}</h2><button className="btn sm" onClick={onClose} aria-label="إغلاق"><Icon n="x" /></button></header>
        <div className="body">{children}</div>
        {footer && <footer>{footer}</footer>}
      </div>
    </div>
  );
}
export const Field = ({ label, children, hint }) => <div className="field"><label>{label}</label>{children}{hint && <small className="muted">{hint}</small>}</div>;
export const Loading = () => <div className="empty">جارٍ التحميل…</div>;
export const ErrorBox = ({ error }) => <div className="alert bad"><Icon n="alert" />{error}</div>;
export function Async({ q, children }) {
  if (q.error) return <ErrorBox error={q.error} />;
  if (!q.data) return <Loading />;
  return children(q.data);
}
export const Page = ({ children, actions }) => <div className="page">{actions && <div className="row no-print">{actions}</div>}{children}</div>;

/** Posting-account picker with server-side search by code or name. */
export function AccountPicker({ value, onChange, posting = true, placeholder = 'رمز أو اسم الحساب' }) {
  const [q, setQ] = useState(value || ''), [open, setOpen] = useState(false), [list, setList] = useState([]), [hl, setHl] = useState(0);
  useEffect(() => setQ(value || ''), [value]);
  useEffect(() => {
    if (!open || !q) return setList([]);
    const t = setTimeout(() => api(`/accounts?q=${encodeURIComponent(q)}${posting ? '&posting=1' : ''}`).then(setList).catch(() => {}), 180);
    return () => clearTimeout(t);
  }, [q, open, posting]);
  const pick = (a) => { onChange(a.code, a); setQ(a.code); setOpen(false); };
  return (
    <div className="picker">
      <input className="inp sm" value={q} placeholder={placeholder} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => { setQ(e.target.value); setHl(0); setOpen(true); }}
        onKeyDown={(e) => { if (e.key === 'ArrowDown') setHl((h) => Math.min(h + 1, list.length - 1)); else if (e.key === 'ArrowUp') setHl((h) => Math.max(h - 1, 0)); else if (e.key === 'Enter' && list[hl]) { e.preventDefault(); pick(list[hl]); } }} />
      {open && list.length > 0 && (
        <div className="menu">{list.map((a, i) => <div key={a.code} className={'opt' + (i === hl ? ' hl' : '')} onMouseDown={() => pick(a)}><span className="code">{a.code}</span><span>{a.name}</span></div>)}</div>
      )}
    </div>
  );
}

export function CostCenterSelect({ value, onChange, all }) {
  const q = useApi('/cost-centers');
  return (
    <select className="inp sm" value={value || ''} onChange={(e) => onChange(e.target.value ? +e.target.value : null)}>
      <option value="">{all ? 'كل المراكز' : '—'}</option>
      {(q.data || []).filter((c) => c.active).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
    </select>
  );
}

export function CurrencySelect({ value, onChange }) {
  const q = useApi('/currencies');
  return <select className="inp" value={value} onChange={(e) => onChange(e.target.value)}>{(q.data || []).map((c) => <option key={c.code} value={c.code}>{c.code} — {c.name}</option>)}</select>;
}

export function DateRange({ from, to, onChange }) {
  return (
    <>
      <Field label="من"><input type="date" className="inp" value={from} onChange={(e) => onChange({ from: e.target.value, to })} /></Field>
      <Field label="إلى"><input type="date" className="inp" value={to} onChange={(e) => onChange({ from, to: e.target.value })} /></Field>
    </>
  );
}

/** Confirm dialog that optionally asks for a reason. */
export function Confirm({ title, text, reason, danger, onOk, onClose }) {
  const [r, setR] = useState(''), [busy, setBusy] = useState(false);
  return (
    <Modal size="sm" title={title} onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>إلغاء</button>
      <button className={'btn ' + (danger ? 'primary' : 'dark')} disabled={busy || (reason && !r.trim())} onClick={async () => { setBusy(true); const ok = await onOk(r); setBusy(false); if (ok) onClose(); }}>تأكيد</button>
    </>}>
      <p>{text}</p>
      {reason && <Field label={reason}><textarea className="inp" style={{ height: 80, padding: 10 }} value={r} onChange={(e) => setR(e.target.value)} /></Field>}
    </Modal>
  );
}
