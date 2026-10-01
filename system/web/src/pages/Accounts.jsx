import React, { useMemo, useState } from 'react';
import { api, Async, Field, Icon, Modal, Page, useApi, useApp } from '../lib.jsx';

const KIND = { BS: 'ميزانية', PL: 'أرباح وخسائر', TR: 'متاجرة' };

export default function Accounts() {
  const { can, run } = useApp();
  const q = useApi('/accounts');
  const [open, setOpen] = useState(() => new Set());
  const [search, setSearch] = useState('');
  const [edit, setEdit] = useState(null);
  const tree = useMemo(() => {
    const kids = new Map();
    (q.data || []).forEach((a) => { const k = a.parent || ''; kids.set(k, [...(kids.get(k) || []), a]); });
    return kids;
  }, [q.data]);
  const rows = useMemo(() => {
    if (!q.data) return [];
    if (search) { const s = search.trim(); return q.data.filter((a) => a.code.startsWith(s) || a.name.includes(s)).slice(0, 300).map((a) => ({ a, depth: a.level - 1 })); }
    const out = [];
    const walk = (p, depth) => (tree.get(p) || []).forEach((a) => { out.push({ a, depth }); if (open.has(a.code)) walk(a.code, depth + 1); });
    walk('', 0);
    return out;
  }, [q.data, tree, open, search]);
  const toggle = (c) => setOpen((s) => { const n = new Set(s); n.has(c) ? n.delete(c) : n.add(c); return n; });
  const save = async (b) => {
    const ok = await run(() => (b.isNew ? api('/accounts', { method: 'POST', body: b }) : api(`/accounts/${b.code}`, { method: 'PATCH', body: { name: b.name, active: b.active } })), 'تم حفظ الحساب');
    if (ok) { setEdit(null); q.reload(); }
  };
  return (
    <Page actions={<>
      <div className="search"><Icon n="search" /><input placeholder="ابحث بالرمز أو الاسم" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
      <button className="btn" onClick={() => setOpen(new Set((q.data || []).filter((a) => a.level <= 2).map((a) => a.code)))}>توسيع المستوى الثاني</button>
      <button className="btn" onClick={() => setOpen(new Set())}>طي الكل</button>
      <span className="sp" style={{ flex: 1 }} />
      {can('accounts.manage') && <button className="btn primary" onClick={() => setEdit({ isNew: true, code: '', name: '', parent: '' })}><Icon n="plus" />حساب جديد</button>}
    </>}>
      <Async q={q}>{(all) => (
        <div className="card">
          <h3>دليل الحسابات <small>{all.length.toLocaleString('en-US')} حسابًا · {all.filter((a) => a.isPosting).length.toLocaleString('en-US')} حساب ترحيل</small></h3>
          <div className="tbl-wrap" style={{ maxHeight: '70vh' }}>
            <table className="tbl coa-tbl"><thead><tr><th>الحساب</th><th>النوع</th><th>الطبيعة</th><th>المستوى</th><th></th></tr></thead>
              <tbody>{rows.map(({ a, depth }) => {
                const n = (tree.get(a.code) || []).length;
                return (
                  <tr key={a.code} className={'coa lv' + Math.min(depth, 4)} onClick={() => n && !search && toggle(a.code)}>
                    <td><div className="coa-name" style={{ paddingRight: depth * 22 }}>
                      {n ? <span className="caret"><Icon n={open.has(a.code) ? 'down' : 'left'} s={14} /></span> : <span className="dotleaf" />}
                      <span className="code">{a.code}</span><span className="nm">{a.name}</span>{n > 0 && <span className="kids">{n}</span>}{!a.active && <span className="pill red">موقوف</span>}
                    </div></td>
                    <td><span className="muted">{KIND[a.kind]}</span></td>
                    <td><span className="muted">{a.nature === 'DEBIT' ? 'مدين' : 'دائن'}</span></td>
                    <td><span className={'lvl-tag t' + Math.min(a.level, 4)}>{a.isPosting ? 'ترحيل' : 'تجميعي'} · {a.level}</span></td>
                    <td className="no-print" onClick={(e) => e.stopPropagation()}>
                      {a.isPosting && <a className="btn sm" href={`#/reports/ledger/${a.code}`}>كشف</a>}{' '}
                      {can('accounts.manage') && <><button className="btn sm" onClick={() => setEdit({ ...a })}>تعديل</button>{' '}
                        <button className="btn sm" onClick={() => setEdit({ isNew: true, parent: a.code, code: a.code, name: '' })}><Icon n="plus" s={14} />فرعي</button></>}
                    </td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        </div>
      )}</Async>
      {edit && <AccountForm a={edit} onClose={() => setEdit(null)} onSave={save} />}
    </Page>
  );
}

function AccountForm({ a, onClose, onSave }) {
  const [f, setF] = useState(a);
  return (
    <Modal size="sm" title={a.isNew ? 'حساب جديد' : `تعديل الحساب ${a.code}`} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>إلغاء</button><button className="btn primary" onClick={() => onSave(f)}>حفظ</button></>}>
      {a.isNew && <Field label="الحساب الأب" hint="اتركه فارغًا لحساب رئيسي. إذا كان الأب حساب ترحيل بلا حركات سيتحول إلى تجميعي.">
        <input className="inp n" value={f.parent || ''} onChange={(e) => setF({ ...f, parent: e.target.value })} /></Field>}
      {a.isNew && <Field label="رمز الحساب" hint="يبدأ برمز الأب"><input className="inp n" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.replace(/\D/g, '') })} /></Field>}
      <Field label="اسم الحساب"><input className="inp" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
      {!a.isNew && <label className="row"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> الحساب فعّال</label>}
    </Modal>
  );
}
