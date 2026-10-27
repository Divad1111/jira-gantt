import http from 'node:http';
import fs from 'node:fs/promises';
const preferences = new Map();
let revoked = false;
let issueCount = 16;
const defaults = { isConfigured: 'true', schemaVersion: '1', mode: 'VIEWER_SELECTABLE', defaultFilterId: '10003', startDateFieldId: 'customfield_10000', endDateFieldId: 'duedate', initialScale: 'week', heightPx: '320', maxIssues: '500', showHierarchy: 'true', showDependencies: 'true', refreshMinutes: '0' };
function json(res, code, body) { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); }
http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1:4178');
    const path = url.pathname.replace(/^\/jira/, '');
    let body = ''; for await (const chunk of req) body += chunk;
    const user = /user=B/.test(req.headers.cookie ?? '') ? 'B' : 'A';
    const privateId = user === 'A' ? '10001' : '10002';
    if (path === '/__reset') { preferences.clear(); revoked = false; issueCount = 16; return json(res, 200, {}); }
    if (path === '/__count') { issueCount = Math.min(1200, +url.searchParams.get('n')); return json(res, 200, {}); }
    if (path === '/__revoke') { revoked = true; return json(res, 200, {}); }
    if (path === '/__health') return json(res, 200, {});
    if (path.endsWith('/rest/api/2/myself')) return json(res, 200, { timeZone: 'Asia/Shanghai' });
    if (path.endsWith('/rest/api/2/field')) return json(res, 200, [
      { id: 'customfield_10000', name: '计划开始', schema: { type: 'date' } }, { id: 'duedate', name: '截止日期', schema: { type: 'date' } }
    ]);
    if (path.includes('/personal/')) {
      const gadgetId = path.split('/').at(-1); const key = `${gadgetId}:${user}`;
      if (req.method === 'PUT') preferences.set(key, JSON.parse(body));
      if (req.method === 'DELETE') preferences.delete(key);
      return json(res, 200, { gadgetId: +gadgetId, selectedFilterId: null, scale: null, ...preferences.get(key) });
    }
    if (path.endsWith('/filters')) return json(res, 200, { values: [
      { id: privateId, name: `${user} 私有筛选器`, owner: user, favourite: true },
      { id: '10003', name: '团队共享计划', owner: 'Team', favourite: true }
    ].filter(f => !url.searchParams.get('query') || f.name.includes(url.searchParams.get('query'))), hasMore: false });
    if (path.includes('/rest/api/2/filter/')) {
      const filterId = path.split('/').at(-1);
      if (revoked || ![privateId, '10003'].includes(filterId)) return json(res, 403, {});
      return json(res, 200, { id: filterId, name: filterId === '10003' ? '团队共享计划' : `${user} 私有筛选器` });
    }
    if (path.endsWith('/rest/api/2/search')) {
      if (revoked) return json(res, 403, {});
      const query = JSON.parse(body); const filterId = /filter = (\d+)/.exec(query.jql)?.[1];
      if (![privateId, '10003'].includes(filterId)) return json(res, 403, {});
      const date = (day) => new Date(Date.UTC(2026, 9, 10 + day)).toISOString().slice(0, 10);
      const issues = Array.from({ length: issueCount }, (_, i) => ({
        id: String(i + 1), key: `DEMO-${i + 1}`, fields: {
          summary: i === 0 ? '<img src=x onerror="window.xss=true">中文任务' : `${user} · 任务 ${i + 1}`,
          customfield_10000: i === 14 ? null : date(i % 28),
          duedate: i === 15 ? '2026-10-01' : date(i % 28 + 4),
          assignee: { displayName: `用户 ${user}` }, status: { name: ['待办', '进行中', '完成'][i % 3], statusCategory: { key: ['new', 'indeterminate', 'done'][i % 3] } },
          timeoriginalestimate: 100, timeestimate: i === 0 ? undefined : 30,
          parent: i === 1 ? { id: '1' } : undefined,
          issuelinks: i === 2 ? [{ type: { name: 'Blocks' }, outwardIssue: { id: '4' } }] : []
        }
      }));
      return json(res, 200, { startAt: query.startAt, total: issues.length, issues: issues.slice(query.startAt, query.startAt + query.maxResults) });
    }
    if (path === '/dashboard-item.js' || path === '/filter-gantt.css') {
      res.writeHead(200, { 'Content-Type': path.endsWith('.js') ? 'text/javascript' : 'text/css' });
      const builtAsset = path === '/dashboard-item.js' ? process.env.FG_BUNDLE : process.env.FG_CSS;
      return res.end(await fs.readFile(builtAsset || new URL(`../dist${path}`, import.meta.url)));
    }
    if (path === '/' || path === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>Filter Gantt mock integration</title><link rel="stylesheet" href="${url.pathname.startsWith('/jira') ? '/jira' : ''}/filter-gantt.css"><style>body{margin:20px;background:#f4f5f7}#dashboard{display:grid;gap:20px;grid-template-columns:repeat(auto-fit,minmax(600px,1fr))}.host{background:white;border:1px solid #dfe1e6}</style><div id="dashboard"></div><script>
window.basePath=${JSON.stringify(url.pathname.startsWith('/jira') ? '/jira' : '')};
window.gantt={otherPlugin:true};window.Gantt={otherPlugin:true};
window.define=function(name,deps,factory){window.DashboardItem=factory(...deps.map(d=>d==='wrm/context-path'?()=>window.basePath:null));};
window.mount=function(count=1,options={}){window.items=[];window.saved=[]; document.querySelector('#dashboard').replaceChildren(); for(let i=1;i<=count;i++){const host=document.createElement('div');host.className='host';document.querySelector('#dashboard').append(host);let prefs={...${JSON.stringify(defaults)},...options}; let instance; const api={isEditable:()=>window.editable!==false,getGadgetId:()=>String(i),resize(){},setTitle(){},showLoadingBar(){},hideLoadingBar(){},once(name,cb){if(name==='afterRender')setTimeout(cb,0);},closeEdit(){instance.render(host,prefs);},savePreferences(p){window.saved.push(p);prefs={...p,isConfigured:true};return instance.render(host,prefs);}};instance=new window.DashboardItem(api);window.items.push({instance,host,api,get preferences(){return prefs;}});instance.render(host,prefs);}};
</script><script src="${url.pathname.startsWith('/jira') ? '/jira' : ''}/dashboard-item.js"></script></html>`);
    }
    res.writeHead(404); res.end();
  } catch (error) { console.error(error); json(res, 500, { error: 'mock failure' }); }
}).listen(4178, '127.0.0.1');
