import React, { useEffect, useState } from 'react';
import { StoreProvider, Icon } from './store.jsx';
import { Dashboard, Accounts, Journal } from './pages1.jsx';
import { Vouchers, Payroll, Budget, Investors, Reports, Settings } from './pages2.jsx';
import { Guide } from './guide.jsx';
import crest from './assets/crest-ittihad.png';
import { TODAY, MONTHS } from './data.js';

const NAV = [
  ['', 'home', 'لوحة التحكم', Dashboard, 'الرئيسية'],
  ['accounts', 'tree', 'دليل الحسابات', Accounts, 'المحاسبة'],
  ['journal', 'book', 'القيود اليومية', Journal],
  ['vouchers', 'receipt', 'سندات القبض والصرف', Vouchers],
  ['payroll', 'users', 'الرواتب والموظفون', Payroll, 'الإدارة'],
  ['budget', 'pie', 'الموازنة ومراكز التكلفة', Budget],
  ['investors', 'brief', 'المستثمرون', Investors],
  ['reports', 'chart', 'التقارير', Reports, 'التقارير'],
  ['settings', 'gear', 'الإعدادات والتدقيق', Settings],
  ['guide', 'check', 'دليل التجربة', Guide, 'المساعدة'],
];

function useRoute() {
  const read = () => location.hash.replace(/^#\/?/, '').split('/');
  const [r, setR] = useState(read);
  useEffect(() => {
    const f = () => setR(read());
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);
  return r;
}

export default function App() {
  const [page, arg] = useRoute();
  const cur = NAV.find((n) => n[0] === (page || '')) || NAV[0];
  const Page = cur[3];
  const d = new Date(TODAY);
  return (
    <StoreProvider>
      <div className="shell">
        <aside className="side">
          <div className="brand"><img src={crest} alt="" /><div><b>الأهلي · الاتحاد</b><small>النظام المالي — نسخة أولية</small></div></div>
          {NAV.map(([k, ic, name, , sec]) => (
            <React.Fragment key={k}>
              {sec && <div className="sec">{sec}</div>}
              <a href={'#/' + k} className={cur[0] === k ? 'on' : ''}><Icon n={ic} />{name}</a>
            </React.Fragment>
          ))}
          <div className="foot">نسخة MVP للتجربة — البيانات الحركية توضيحية، ودليل الحسابات منقول من النظام الحالي.</div>
        </aside>
        <main className="main">
          <div className="top">
            <h1>{cur[2]}</h1>
            <span className="badge-mvp">نسخة تجريبية</span>
            <span className="sp" />
            <span className="date">{d.getDate()} {MONTHS[d.getMonth()]} {d.getFullYear()} · العملة: دولار أمريكي</span>
          </div>
          <Page key={cur[0] + (arg || '')} focus={arg} />
        </main>
      </div>
    </StoreProvider>
  );
}
