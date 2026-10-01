import React, { useEffect, useState } from 'react';
import { api, AppProvider, Icon, token, useApp, MONTHS } from './lib.jsx';
import crest from './assets/crest-ittihad.png';
import Dashboard from './pages/Dashboard.jsx';
import Accounts from './pages/Accounts.jsx';
import Journal from './pages/Journal.jsx';
import Vouchers from './pages/Vouchers.jsx';
import Reports from './pages/Reports.jsx';
import Budgets from './pages/Budgets.jsx';
import Investors from './pages/Investors.jsx';
import Payroll from './pages/Payroll.jsx';
import Imports from './pages/Imports.jsx';
import { Users, Periods, SettingsPage, Audit, Profile } from './pages/Admin.jsx';

// [route, icon, title, component, permission, section]
const NAV = [
  ['', 'home', 'لوحة التحكم', Dashboard, 'reports.view', 'الرئيسية'],
  ['accounts', 'tree', 'دليل الحسابات', Accounts, 'accounts.view', 'المحاسبة'],
  ['journal', 'book', 'القيود اليومية', Journal, 'journal.view'],
  ['vouchers', 'receipt', 'سندات القبض والصرف', Vouchers, 'journal.create'],
  ['reports', 'chart', 'التقارير المالية', Reports, 'reports.view'],
  ['budgets', 'pie', 'الموازنات ومراكز الكلفة', Budgets, 'budgets.view', 'الإدارة المالية'],
  ['investors', 'brief', 'المستثمرون والعقود', Investors, 'investors.view'],
  ['payroll', 'users', 'الموظفون والرواتب', Payroll, 'payroll.view'],
  ['imports', 'up', 'الترحيل من الراشد', Imports, 'import.run', 'النظام'],
  ['periods', 'cal', 'الفترات والعملات', Periods, 'accounts.view'],
  ['users', 'shield', 'المستخدمون والصلاحيات', Users, 'users.manage'],
  ['audit', 'eye', 'سجل التدقيق', Audit, 'audit.view'],
  ['settings', 'gear', 'الإعدادات', SettingsPage, 'settings.manage'],
  ['profile', 'lock', 'حسابي والأمان', Profile, null],
];

function useRoute() {
  const read = () => location.hash.replace(/^#\/?/, '').split('/');
  const [r, setR] = useState(read);
  useEffect(() => { const f = () => setR(read()); window.addEventListener('hashchange', f); return () => window.removeEventListener('hashchange', f); }, []);
  return r;
}

function Login({ onDone }) {
  const [u, setU] = useState(''), [p, setP] = useState(''), [code, setCode] = useState(''), [temp, setTemp] = useState(null), [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try {
      const r = temp ? await api('/auth/login/2fa', { method: 'POST', body: { tempToken: temp, code } }) : await api('/auth/login', { method: 'POST', body: { username: u, password: p } });
      if (r.requires2fa) setTemp(r.tempToken); else { token.set(r.token); onDone(); }
    } catch (x) { setErr(x.message); } finally { setBusy(false); }
  };
  return (
    <div className="login">
      <div className="art"><img src={crest} alt="" /><h1>نادي الأهلي · الاتحاد الحلبي</h1><p>النظام المالي الموحد — المحاسبة، الموازنات، المستثمرون والرواتب في مكان واحد، بسجل تدقيق كامل.</p></div>
      <form onSubmit={submit}>
        <h2>{temp ? 'التحقق بخطوتين' : 'تسجيل الدخول'}</h2>
        <p className="sub">{temp ? 'أدخل الرمز المكوّن من 6 أرقام من تطبيق المصادقة' : 'استخدم الحساب الذي أنشأه مدير النظام'}</p>
        {err && <div className="alert bad"><Icon n="alert" />{err}</div>}
        {temp ? (
          <div className="field"><label>رمز التحقق</label><input className="inp n" autoFocus inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} /></div>
        ) : (<>
          <div className="field"><label>اسم المستخدم</label><input className="inp n" autoFocus autoComplete="username" value={u} onChange={(e) => setU(e.target.value)} /></div>
          <div className="field"><label>كلمة المرور</label><input className="inp n" type="password" autoComplete="current-password" value={p} onChange={(e) => setP(e.target.value)} /></div>
        </>)}
        <button className="btn primary block" disabled={busy}>{busy ? 'جارٍ التحقق…' : temp ? 'تأكيد' : 'دخول'}</button>
        {temp && <button type="button" className="btn block" onClick={() => { setTemp(null); setCode(''); }}>رجوع</button>}
      </form>
    </div>
  );
}

function Shell() {
  const { me, can, onLogout, base } = useApp();
  const [page, ...args] = useRoute();
  const nav = NAV.filter((n) => !n[4] || can(n[4]));
  const cur = nav.find((n) => n[0] === (page || '')) || nav.find((n) => n[0] === 'profile');
  const Page = cur[3];
  const d = new Date();
  return (
    <div className="shell">
      <aside className="side">
        <div className="brand"><img src={crest} alt="" /><div><b>الأهلي · الاتحاد</b><small>النظام المالي</small></div></div>
        {nav.map(([k, ic, name, , , sec]) => (
          <React.Fragment key={k}>{sec && <div className="sec">{sec}</div>}<a href={'#/' + k} className={cur[0] === k ? 'on' : ''}><Icon n={ic} />{name}</a></React.Fragment>
        ))}
        <div className="foot">كل عملية مسجّلة في سجل التدقيق باسم المستخدم ووقتها.</div>
      </aside>
      <main className="main">
        <div className="top">
          <h1>{cur[2]}</h1><span className="sp" />
          <span className="date">{d.getDate()} {MONTHS[d.getMonth()]} {d.getFullYear()} · العملة الأساسية: {base}</span>
          <a className="user-chip" href="#/profile" style={{ textDecoration: 'none', color: 'inherit' }}><span className="av">{me.fullName[0]}</span><span>{me.fullName}<small>{me.role.name}</small></span></a>
          <button className="btn sm" onClick={onLogout} title="خروج"><Icon n="logout" /></button>
        </div>
        <Page key={cur[0] + args.join('/')} args={args} />
      </main>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState(undefined);
  const load = () => {
    if (!token.get()) return setSession(null);
    Promise.all([api('/auth/me'), api('/settings')]).then(([me, settings]) => setSession({ me, settings }), () => { token.set(null); setSession(null); });
  };
  useEffect(() => { load(); const f = () => setSession(null); window.addEventListener('ahli:logout', f); return () => window.removeEventListener('ahli:logout', f); }, []);
  if (session === undefined) return null;
  if (!session) return <Login onDone={load} />;
  return <AppProvider me={session.me} settings={session.settings} onLogout={() => { token.set(null); setSession(null); }}><Shell /></AppProvider>;
}
