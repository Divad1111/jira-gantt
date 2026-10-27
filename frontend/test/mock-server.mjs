import http from 'node:http';
import fs from 'node:fs/promises';
const preferences = new Map();
const scheduleOptions = new Map();
const issueChanges = new Map();
let failIssue = '';
const calendarDefaults=()=>({weekdays:[1,2,3,4,5],holidays:[],workDates:[]});let globalCalendar=calendarDefaults(),calendarRevision=0;
const initialUpdated = Date.parse('2026-10-27T00:00:00.135Z');
const settings = {hoursPerDay:8,daysPerWeek:5,calendarSource:'PLUGIN'};
function calculate(plan) {
  const usage = new Map(), sequence = new Map(), cursors=new Map();
  const working = d => plan.calendar.workDates.includes(d.toISOString().slice(0,10)) || (plan.calendar.weekdays.includes(d.getUTCDay()||7) && !plan.calendar.holidays.includes(d.toISOString().slice(0,10)));
  for(const task of plan.tasks) {
    if(Number(task.issueId)%3===0) continue;
    if(!task.assigneeKey) throw new Error('请选择负责人');
    const match=/^([\d.]+)([hdwm])$/.exec(task.estimate);
    if(!match || +match[1]<=0)throw new Error('估时无效');
    let hours=+match[1]*({h:1,d:8,w:40,m:1/60}[match[2]]),date=new Date((task.notBefore>plan.startDate?task.notBefore:plan.startDate)+'T00:00:00Z');
    if(cursors.has(task.assigneeKey)&&date<cursors.get(task.assigneeKey))date=new Date(cursors.get(task.assigneeKey));
    const days=usage.get(task.assigneeKey)||new Map(); usage.set(task.assigneeKey,days);
    while(!working(date)||(days.get(date.toISOString().slice(0,10))||0)+Math.min(hours,8)>8)date.setUTCDate(date.getUTCDate()+1);
    task.startDate=date.toISOString().slice(0,10);
    while(hours>0) {
      const key=date.toISOString().slice(0,10),take=Math.min(hours,8);
      days.set(key,(days.get(key)||0)+take);hours-=take;task.endDate=key;
      if(hours>0){do{date.setUTCDate(date.getUTCDate()+1);}while(!working(date));}
    }
    task.sequence=(sequence.get(task.assigneeKey)||0)+1;sequence.set(task.assigneeKey,task.sequence);
    cursors.set(task.assigneeKey,new Date(task.endDate+'T00:00:00Z'));
  }
  return plan;
}
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
    if (path === '/__reset') { globalCalendar=calendarDefaults();calendarRevision=0;preferences.clear();scheduleOptions.clear();issueChanges.clear();failIssue=''; revoked = false; issueCount = 16; return json(res, 200, {}); }
    if (path === '/__count') { issueCount = Math.min(1200, +url.searchParams.get('n')); return json(res, 200, {}); }
    if (path === '/__revoke') { revoked = true; return json(res, 200, {}); }
    if (path === '/__health') return json(res, 200, {});
    if (path.endsWith('/rest/api/2/myself')) return json(res, 200, { key:user,name:user,timeZone: 'Asia/Shanghai' });
    if(path==='/__fail'){failIssue=url.searchParams.get('id');return json(res,200,{});}
    if(path==='/rest/filter-gantt/1.0/calendar'){
      if(req.method==='PUT'){if(user!=='A')return json(res,403,{message:'仅 Jira 管理员可以修改全局工作日历'});const input=JSON.parse(body);if(input.revision!==calendarRevision)return json(res,409,{message:'全局工作日历已更新，请刷新后重新排期'});if(!input.calendar.weekdays.length)return json(res,400,{message:'至少选择一个工作日'});globalCalendar=input.calendar;calendarRevision++;}
      return json(res,200,{revision:calendarRevision,canEdit:user==='A',calendar:globalCalendar});
    }
    if(path.includes('/rest/filter-gantt/1.0/schedule/')) {
      const parts=path.split('/'),gadget=parts[5],preview=parts[6]==='preview',filterId=url.searchParams.get('filterId');
      if(req.method==='GET') {
        const saved=scheduleOptions.get(`${gadget}:${filterId}`)||{};
        return json(res,200,{canEdit:user==='A',reason:user==='A'?'修改将同步到 Jira 任务':'只读：仅仪表盘所有者可修改',revision:saved.revision||0,order:saved.order||[],settings,calendarRevision,canManageCalendar:user==='A',calendar:{...globalCalendar,timeZone:'Asia/Shanghai'}});
      }
      if(parts[6]==='source'){const input=JSON.parse(body);if(revoked)return json(res,403,{message:'已无浏览权限'});return json(res,200,{tasks:input.issueIds.map(id=>({issueId:id,updatedMillis:String(issueChanges.get(id)?.updatedMillis||initialUpdated),...(issueChanges.has(id)?{source:{startDate:issueChanges.get(id).startDate,endDate:issueChanges.get(id).endDate,estimate:`${issueChanges.get(id).seconds/3600}h`,assigneeKey:issueChanges.get(id).assigneeKey,assignee:`用户 ${issueChanges.get(id).assigneeKey}`}}:{})}))});}
      if(user!=='A')return json(res,403,{message:'其他查看者只读'});
      const input=JSON.parse(body),key=`${gadget}:${input.filterId}`,old=scheduleOptions.get(key)||{revision:0};
      if(input.calendarRevision!==calendarRevision)return json(res,409,{message:'全局工作日历已更新，请刷新后重新排期'});input.calendar={...globalCalendar,timeZone:'Asia/Shanghai'};
      if(input.revision!==old.revision)return json(res,409,{message:'排期已被其他窗口修改'});
      for(const task of input.tasks)if(String(issueChanges.get(task.issueId)?.updatedMillis||initialUpdated)!==task.updatedMillis)return json(res,409,{message:'任务已被其他人修改，请刷新'});
      try{calculate(input);}catch(e){return json(res,400,{message:e.message});}
      if(preview)return json(res,200,{tasks:input.tasks,settings,changeCount:input.tasks.length});
      const results=[];let failed=false;
      for(const task of input.tasks){
        if(failed){results.push({issueId:task.issueId,key:`DEMO-${task.issueId}`,status:'notAttempted',message:'未继续执行'});continue;}
        if(task.issueId===failIssue){failed=true;results.push({issueId:task.issueId,key:`DEMO-${task.issueId}`,status:'failed',message:'Jira 拒绝更新'});continue;}
        const previous=issueChanges.get(task.issueId)||{comments:[]};
        const match=/^([\d.]+)([hdwm])$/.exec(task.estimate);let seconds=match?+match[1]*({h:3600,d:28800,w:144000,m:60}[match[2]]):0;
        issueChanges.set(task.issueId,{...previous,startDate:task.startDate,endDate:task.endDate,assigneeKey:task.assigneeKey,seconds,updatedMillis:Date.now(),comments:task.note?[...previous.comments,{body:task.note,author:{displayName:'用户 A'}}]:previous.comments});
        results.push({issueId:task.issueId,key:`DEMO-${task.issueId}`,status:'saved',message:'已同步到 Jira'});
      }
      if(!failed)scheduleOptions.set(key,{revision:old.revision+1,order:input.tasks.map(t=>t.issueId),calendar:input.calendar});
      return json(res,200,{results,allSaved:!failed,preferencesSaved:!failed});
    }
    if(path.includes('/rest/api/2/issue/')) {
      const key=path.split('/')[5],id=key?.replace('DEMO-',''),change=issueChanges.get(id);
      if(path.endsWith('/comment'))return json(res,200,{comments:change?.comments||[]});
      return json(res,200,{id,key,fields:{customfield_10000:change?.startDate,duedate:change?.endDate,timeoriginalestimate:change?.seconds,assignee:{key:change?.assigneeKey}}});
    }
    if(path.endsWith('/rest/api/2/user/assignable/search')) {
      if(!/^DEMO-[0-9]+$/.test(url.searchParams.get('issueKey')||''))return json(res,400,{message:'issueKey 和 username 必填'});
      return json(res,200,[{key:'A',displayName:'用户 A'},{key:'B',displayName:'用户 B'}].filter(p=>`${p.key} ${p.displayName}`.toLowerCase().includes((url.searchParams.get('username')||'').toLowerCase())));
    }
    if (path.endsWith('/rest/api/2/field')) return json(res, 200, [
      { id: 'customfield_10000', name: '计划开始', schema: { type: 'date',custom:'com.atlassian.jira.plugin.system.customfieldtypes:datepicker' } }, { id: 'duedate', name: '截止日期', schema: { type: 'date' } },
      {id:'customfield_10109',name:'Target start',schema:{type:'date',custom:'com.atlassian.jpo:jpo-custom-field-baseline-start'}},
      {id:'customfield_10110',name:'Target end',schema:{type:'date',custom:'com.atlassian.jpo:jpo-custom-field-baseline-end'}},
      {id:'created',name:'创建日期',schema:{type:'datetime'}}, {id:'updated',name:'更新日期',schema:{type:'datetime'}}
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
          customfield_10000: issueChanges.get(String(i+1))?.startDate || (i === 14 ? null : date(i % 28)),
          duedate: issueChanges.get(String(i+1))?.endDate || (i === 15 ? '2026-10-01' : date(i % 28 + 4)),
          updated: new Date(Math.floor((issueChanges.get(String(i+1))?.updatedMillis||initialUpdated)/1000)*1000).toISOString(),
          assignee: { key:issueChanges.get(String(i+1))?.assigneeKey||user,displayName: `用户 ${issueChanges.get(String(i+1))?.assigneeKey||user}` }, status: { name: ['待办', '进行中', '完成'][i % 3], statusCategory: { key: ['new', 'indeterminate', 'done'][i % 3] } },
          timeoriginalestimate: issueChanges.get(String(i+1))?.seconds ?? 28800, timeestimate: i === 0 ? undefined : 30,
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
