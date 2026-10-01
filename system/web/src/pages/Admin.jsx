import React, { useState } from 'react';
import { api, Async, Confirm, Field, Icon, Modal, MONTHS, Page, fmtDate, today, useApi, useApp } from '../lib.jsx';

const PERM_NAMES = {
  'accounts.view': 'عرض الدليل', 'accounts.manage': 'إدارة الدليل والعملات', 'journal.view': 'عرض القيود', 'journal.create': 'إنشاء القيود والسندات',
  'journal.approve': 'اعتماد القيود', 'journal.reverse': 'عكس القيود', 'periods.close': 'إقفال الفترات', 'reports.view': 'التقارير',
  'budgets.view': 'عرض الموازنات', 'budgets.manage': 'إدارة الموازنات', 'investors.view': 'عرض المستثمرين', 'investors.manage': 'إدارة المستثمرين',
  'payroll.view': 'عرض الرواتب', 'payroll.manage': 'إعداد الرواتب', 'payroll.post': 'ترحيل الرواتب', 'import.run': 'الترحيل من الراشد',
  'users.manage': 'إدارة المستخدمين', 'audit.view': 'سجل التدقيق', 'settings.manage': 'الإعدادات', '*': 'كل الصلاحيات',
};

export function Users() {
  const { run, me } = useApp();
  const q = useApi('/users'), roles = useApi('/users/roles');
  const [f, setF] = useState(null);
  const save = async () => {
    const body = f.id ? { fullName: f.fullName, roleId: +f.roleId, active: f.active, password: f.password || undefined } : { ...f, roleId: +f.roleId };
    if (await run(() => (f.id ? api(`/users/${f.id}`, { method: 'PATCH', body }) : api('/users', { method: 'POST', body })), 'تم الحفظ')) { setF(null); q.reload(); }
  };
  return (
    <Page actions={<button className="btn primary" onClick={() => setF({ username: '', fullName: '', password: '', roleId: roles.data?.[3]?.id })}><Icon n="plus" />مستخدم جديد</button>}>
      <Async q={q}>{(list) => (
        <div className="card"><div className="tbl-wrap"><table className="tbl">
          <thead><tr><th>المستخدم</th><th>الاسم</th><th>الدور</th><th>التحقق بخطوتين</th><th>آخر دخول</th><th>الحالة</th></tr></thead>
          <tbody>{list.map((u) => <tr key={u.id} className="clickable" onClick={() => setF({ ...u, roleId: u.role.id, password: '' })}>
            <td className="code">{u.username}</td><td><b>{u.fullName}</b></td><td>{u.role.name}</td><td>{u.totpEnabled ? <span className="pill green">مفعّل</span> : <span className="pill amber">غير مفعّل</span>}</td>
            <td className="num">{u.lastLoginAt ? u.lastLoginAt.slice(0, 16).replace('T', ' ') : '—'}</td><td>{u.active ? <span className="pill green">فعّال</span> : <span className="pill red">معطّل</span>}</td></tr>)}</tbody>
        </table></div></div>
      )}</Async>
      <Async q={roles}>{(rs) => (
        <div className="card"><h3>الأدوار والصلاحيات</h3><div className="tbl-wrap"><table className="tbl"><tbody>{rs.map((r) => <tr key={r.id}><td style={{ width: 180 }}><b>{r.name}</b></td>
          <td><div className="row">{r.permissions.map((p) => <span key={p} className="pill">{PERM_NAMES[p] || p}</span>)}</div></td></tr>)}</tbody></table></div></div>
      )}</Async>
      {f && <Modal size="sm" title={f.id ? `تعديل ${f.username}` : 'مستخدم جديد'} onClose={() => setF(null)} footer={<>
        {f.id && f.totpEnabled ? <button className="btn" onClick={async () => { if (await run(() => api(`/users/${f.id}`, { method: 'PATCH', body: { reset2fa: true } }), 'تم إلغاء التحقق بخطوتين')) { setF(null); q.reload(); } }}>إعادة ضبط التحقق بخطوتين</button> : <span />}
        <button className="btn primary" onClick={save}>حفظ</button></>}>
        {!f.id && <Field label="اسم المستخدم (لاتيني)"><input className="inp n" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} /></Field>}
        <Field label="الاسم الكامل"><input className="inp" value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} /></Field>
        <Field label="الدور"><select className="inp" value={f.roleId} disabled={f.id === me.id} onChange={(e) => setF({ ...f, roleId: e.target.value })}>{(roles.data || []).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></Field>
        <Field label={f.id ? 'كلمة مرور جديدة (اختياري)' : 'كلمة المرور'} hint="10 أحرف على الأقل، أحرف وأرقام"><input className="inp n" type="password" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
        {f.id && f.id !== me.id && <label className="row"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> الحساب فعّال</label>}
      </Modal>}
    </Page>
  );
}

export function Periods() {
  const { can, run } = useApp();
  const [year, setYear] = useState(new Date().getFullYear());
  const q = useApi(`/periods?year=${year}`), cur = useApi('/currencies');
  const [dlg, setDlg] = useState(null), [rate, setRate] = useState({ currency: 'SYP', date: today(), rate: '' });
  const act = (p, op, reason) => run(() => api(`/periods/${p.year}/${p.month}/${op}`, { method: 'POST', body: { reason } }), op === 'close' ? 'تم إقفال الفترة' : 'أعيد فتح الفترة').then((r) => { if (r) q.reload(); return r; });
  return (
    <Page actions={<select className="inp" style={{ width: 120 }} value={year} onChange={(e) => setYear(+e.target.value)}>{[-1, 0, 1].map((k) => <option key={k}>{new Date().getFullYear() + k}</option>)}</select>}>
      <div className="grid g2">
        <Async q={q}>{(list) => (
          <div className="card"><h3>الفترات المحاسبية <small>الفترة المقفلة لا تقبل أي ترحيل</small></h3><div className="list">
            {Array.from({ length: 12 }, (_, i) => list.find((p) => p.month === i + 1) || { year, month: i + 1, status: 'OPEN' }).map((p) => (
              <div key={p.month} className="it"><div className="t">{MONTHS[p.month - 1]} {p.year}</div>
                <div className="row">{p.status === 'CLOSED' ? <><span className="pill dark"><Icon n="lock" s={12} />مقفلة {fmtDate(p.closedAt)}</span>
                  {can('settings.manage') && <button className="btn sm" onClick={() => setDlg({ title: 'إعادة فتح الفترة', text: 'إعادة الفتح استثنائية وتُسجَّل في سجل التدقيق.', reason: 'السبب', onOk: (r) => act(p, 'reopen', r) })}>إعادة فتح</button>}</>
                  : <><span className="pill green">مفتوحة</span>{can('periods.close') && <button className="btn sm" onClick={() => setDlg({ title: `إقفال ${MONTHS[p.month - 1]} ${p.year}`, text: 'لن يُقبل بعدها أي قيد بتاريخ هذه الفترة. يجب ألا توجد قيود معلّقة فيها.', onOk: () => act(p, 'close') })}>إقفال</button>}</>}</div></div>))}
          </div></div>
        )}</Async>
        <Async q={cur}>{(list) => (
          <div className="card"><h3>العملات وأسعار الصرف <small>السعر = كم من العملة الأساسية تساوي وحدة واحدة</small></h3>
            {list.map((c) => <div key={c.code} style={{ marginBottom: 14 }}>
              <div className="rep-h"><span>{c.code} — {c.name} {c.isBase && <span className="pill red">أساسية</span>}</span></div>
              {!c.isBase && <table className="tbl"><tbody>{c.rates.map((r) => <tr key={r.id}><td className="num">{fmtDate(r.date)}</td><td className="n">{Number(r.rate)}</td><td className="n muted">1 {list.find((x) => x.isBase)?.code} = {(1 / Number(r.rate)).toLocaleString('en-US', { maximumFractionDigits: 2 })} {c.code}</td></tr>)}
                {!c.rates.length && <tr><td className="muted">لا أسعار مسجّلة</td></tr>}</tbody></table>}
            </div>)}
            {can('accounts.manage') && <div className="filters">
              <Field label="العملة"><select className="inp" value={rate.currency} onChange={(e) => setRate({ ...rate, currency: e.target.value })}>{list.filter((c) => !c.isBase).map((c) => <option key={c.code}>{c.code}</option>)}</select></Field>
              <Field label="التاريخ"><input type="date" className="inp" value={rate.date} onChange={(e) => setRate({ ...rate, date: e.target.value })} /></Field>
              <Field label="السعر"><input className="inp n" value={rate.rate} onChange={(e) => setRate({ ...rate, rate: e.target.value })} /></Field>
              <button className="btn dark" onClick={async () => { if (await run(() => api('/currencies/rates', { method: 'POST', body: { ...rate, rate: Number(rate.rate) } }), 'تم حفظ السعر')) cur.reload(); }}>حفظ</button>
            </div>}
          </div>
        )}</Async>
      </div>
      {dlg && <Confirm {...dlg} onClose={() => setDlg(null)} />}
    </Page>
  );
}

export function SettingsPage() {
  const { run } = useApp();
  const q = useApi('/settings');
  const [s, setS] = useState(null);
  const v = s || q.data;
  const setP = (k, val) => setS({ ...v, payroll: { ...v.payroll, [k]: val } });
  return (
    <Page>
      <Async q={q}>{() => (<>
        <div className="card"><h3>عام</h3><div className="grid g3">
          <Field label="العملة الأساسية" hint="لا تتغير بعد ترحيل أول قيد"><select className="inp" value={v.baseCurrency} onChange={(e) => setS({ ...v, baseCurrency: e.target.value })}><option>USD</option><option>SYP</option><option>TRY</option></select></Field>
          <Field label="حد الاعتماد (بالعملة الأساسية)" hint="القيود الأكبر تحتاج اعتماد شخص آخر"><input className="inp n" value={v.approvalThreshold} onChange={(e) => setS({ ...v, approvalThreshold: Number(e.target.value) })} /></Field>
          <Field label="تنبيهات الموازنة (%)"><input className="inp n" value={v.budgetAlerts.join(',')} onChange={(e) => setS({ ...v, budgetAlerts: e.target.value.split(',').map(Number).filter(Boolean) })} /></Field>
        </div></div>
        <div className="card"><h3>الرواتب</h3><div className="grid g4">
          {[['graceMinutes', 'سماح التأخير (دقيقة)'], ['workDays', 'أيام العمل في الشهر'], ['workHours', 'ساعات العمل اليومية']].map(([k, n]) => <Field key={k} label={n}><input className="inp n" value={v.payroll[k]} onChange={(e) => setP(k, Number(e.target.value))} /></Field>)}
          {[['salaryAccount', 'حساب الرواتب'], ['bonusAccount', 'حساب المكافآت'], ['advanceAccount', 'حساب السلف'], ['payAccount', 'حساب الدفع (صندوق/بنك)']].map(([k, n]) => <Field key={k} label={n}><input className="inp n" value={v.payroll[k]} onChange={(e) => setP(k, e.target.value)} /></Field>)}
        </div></div>
        <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn primary" disabled={!s} onClick={async () => { const r = await run(() => api('/settings', { method: 'PUT', body: s }), 'تم حفظ الإعدادات'); if (r) { setS(null); q.reload(); } }}>حفظ الإعدادات</button></div>
      </>)}</Async>
    </Page>
  );
}

const ACTIONS = { LOGIN: 'دخول', LOGIN_FAILED: 'محاولة دخول فاشلة', LOGIN_2FA_FAILED: 'رمز تحقق خاطئ', CREATE: 'إنشاء', UPDATE: 'تعديل', DELETE: 'حذف', SUBMIT: 'إرسال', APPROVE: 'اعتماد', REJECT: 'رفض', POST: 'ترحيل', REVERSE: 'عكس', CLOSE: 'إقفال', REOPEN: 'إعادة فتح', SET_RATE: 'سعر صرف', SCHEDULE: 'جدولة أقساط', IMPORT_VALIDATE: 'فحص ملف', IMPORT_COMMIT: 'اعتماد ترحيل', PASSWORD_CHANGED: 'تغيير كلمة مرور', '2FA_ENABLED': 'تفعيل التحقق بخطوتين' };

export function Audit() {
  const [f, setF] = useState({ entity: '', user: '' });
  const q = useApi(`/audit?take=300${f.entity ? '&entity=' + f.entity : ''}${f.user ? '&user=' + f.user : ''}`);
  const [sel, setSel] = useState(null);
  return (
    <Page>
      <div className="card filters">
        <Field label="الكيان"><select className="inp" value={f.entity} onChange={(e) => setF({ ...f, entity: e.target.value })}><option value="">الكل</option>{['JournalEntry', 'Account', 'User', 'Settings', 'FiscalPeriod', 'ImportBatch', 'Investor', 'PayrollRun', 'PayrollLine', 'Employee', 'Budget', 'ExchangeRate'].map((x) => <option key={x}>{x}</option>)}</select></Field>
        <Field label="المستخدم"><input className="inp n" value={f.user} onChange={(e) => setF({ ...f, user: e.target.value })} /></Field>
        <span className="muted">السجل غير قابل للتعديل أو الحذف حتى من مدير النظام (محمي على مستوى قاعدة البيانات)</span>
      </div>
      <Async q={q}>{(rows) => (
        <div className="card"><div className="tbl-wrap" style={{ maxHeight: '70vh' }}><table className="tbl">
          <thead><tr><th>الوقت</th><th>المستخدم</th><th>العملية</th><th>الكيان</th><th>المعرّف</th><th>IP</th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.id} className="clickable" onClick={() => setSel(r)}><td className="num">{r.at.slice(0, 19).replace('T', ' ')}</td><td>{r.username || '—'}</td>
            <td>{ACTIONS[r.action] || r.action}</td><td className="code">{r.entity}</td><td className="code">{r.entityId}</td><td className="code">{r.ip}</td></tr>)}</tbody>
        </table></div></div>
      )}</Async>
      {sel && <Modal title={`${ACTIONS[sel.action] || sel.action} — ${sel.entity} ${sel.entityId || ''}`} onClose={() => setSel(null)}>
        <div className="grid g2">{['before', 'after'].map((k) => <div key={k}><b>{k === 'before' ? 'قبل' : 'بعد'}</b><pre style={{ direction: 'ltr', fontSize: 12, background: 'var(--bg)', padding: 12, borderRadius: 8, overflow: 'auto', maxHeight: 400 }}>{sel[k] ? JSON.stringify(sel[k], null, 2) : '—'}</pre></div>)}</div>
      </Modal>}
    </Page>
  );
}

export function Profile() {
  const { me, run } = useApp();
  const [pw, setPw] = useState({ current: '', next: '', again: '' });
  const [tfa, setTfa] = useState(null), [code, setCode] = useState(''), [enabled, setEnabled] = useState(me.totpEnabled);
  return (
    <Page>
      <div className="grid g2">
        <div className="card"><h3>تغيير كلمة المرور</h3>
          <Field label="الحالية"><input type="password" className="inp n" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} /></Field>
          <Field label="الجديدة" hint="10 أحرف على الأقل، أحرف وأرقام"><input type="password" className="inp n" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} /></Field>
          <Field label="تأكيد الجديدة"><input type="password" className="inp n" value={pw.again} onChange={(e) => setPw({ ...pw, again: e.target.value })} /></Field>
          <button className="btn primary" style={{ marginTop: 12 }} disabled={!pw.next || pw.next !== pw.again} onClick={async () => { if (await run(() => api('/auth/password', { method: 'POST', body: { current: pw.current, next: pw.next } }), 'تم تغيير كلمة المرور')) setPw({ current: '', next: '', again: '' }); }}>حفظ</button>
        </div>
        <div className="card"><h3>التحقق بخطوتين {enabled ? <span className="pill green">مفعّل</span> : <span className="pill amber">غير مفعّل</span>}</h3>
          <p className="muted" style={{ marginBottom: 12 }}>مستحسن بشدة لكل من يعتمد القيود أو يدير النظام. استخدم Google Authenticator أو Microsoft Authenticator.</p>
          {!tfa ? <button className="btn dark" onClick={async () => { const r = await run(() => api('/auth/2fa/setup', { method: 'POST' })); if (r) { setTfa(r); setEnabled(false); } }}>{enabled ? 'إعادة الإعداد على جهاز جديد' : 'تفعيل'}</button> : (<>
            <div className="row" style={{ alignItems: 'flex-start' }}><img src={tfa.qr} alt="QR" width={180} height={180} /><div><p>1. امسح الرمز بتطبيق المصادقة.</p><p className="muted">أو أدخل المفتاح يدويًا: <span className="code">{tfa.secret}</span></p><p>2. أدخل الرمز المكوّن من 6 أرقام:</p>
              <div className="row"><input className="inp n" style={{ width: 140 }} maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
                <button className="btn primary" onClick={async () => { if (await run(() => api('/auth/2fa/enable', { method: 'POST', body: { code } }), 'تم تفعيل التحقق بخطوتين')) { setTfa(null); setEnabled(true); } }}>تأكيد</button></div></div></div>
          </>)}
        </div>
      </div>
    </Page>
  );
}
