import { el, button, labelled } from './dom.js';
import { browseHref, calendarDate, toLocalDate, exclusiveEnd } from './model.js';
import { SearchMultiSelect } from './search-multi-select.js';
import { AssigneePicker } from './assignee-picker.js';

const taskFields=['issueId','assigneeKey','estimate','note','notBefore','locked','startDate','endDate','updatedMillis'];
export function scheduleBody(state){return {filterId:state.filterId,revision:state.revision,calendarRevision:state.calendarRevision,startDate:state.startDate,calendar:state.calendar,tasks:state.tasks.map(t=>Object.fromEntries(taskFields.map(k=>[k,t[k]??(k==='locked'?false:'')])))};}
export function scheduleData(state,path){
  const data={scheduled:[],unscheduled:[],invalid:[],links:[]},last=new Map(),sequence=new Map();
  for(const task of state.tasks){
    const n=(sequence.get(task.assigneeKey)||0)+1;if(!task.done)sequence.set(task.assigneeKey,n);
    const t={...task,id:task.issueId,href:browseHref(task.key,path),sequence:task.done?null:n,parent:task.parent||0,open:true};
    if(!task.startDate||!task.endDate){t.reason='缺少起止日期';data.unscheduled.push(t);continue;}
    if(task.endDate<task.startDate){t.reason='结束日期早于开始日期';data.invalid.push(t);continue;}
    t.start_date=toLocalDate(t.startDate);t.end_date=exclusiveEnd(t.endDate);data.scheduled.push(t);
    if(!t.done){if(last.has(t.assigneeKey))data.links.push({id:`person:${t.issueId}`,source:last.get(t.assigneeKey),target:t.issueId,type:'0',resourceSequence:true});last.set(t.assigneeKey,t.issueId);}
  }
  const visible=new Set(data.scheduled.map(t=>t.id));for(const t of state.tasks)for(const source of t.predecessors||[])if(visible.has(source)&&visible.has(t.issueId))data.links.push({id:`dep:${source}:${t.issueId}`,source,target:t.issueId,type:'0'});
  return data;
}
export function groupTasks(tasks){
  // Stable sort preserves the manually chosen order within each assignee.
  return tasks.sort((a,b)=>a.assigneeKey===b.assigneeKey?0:(a.assignee||'未分配').localeCompare(b.assignee||'未分配','zh-CN')||a.assigneeKey.localeCompare(b.assigneeKey));
}
export class SchedulingWorkspace {
  constructor(app,client,filterId,me,result,data){
    Object.assign(this,{app,client,filterId,me,result,baseData:data});this.disposed=false;this.node=app.scheduleHost;
    this.error=el('p',{role:'alert',className:'fg-error',hidden:true});this.access=el('span',{className:'fg-schedule-access'});
    this.edit=button('自动排期',()=>this.editor(),{disabled:true});this.calendarButton=button('全局工作日历',()=>this.calendarEditor());
    this.peopleFilter=new SearchMultiSelect('人员',()=>this.draw(),'fg-people');this.statusFilter=new SearchMultiSelect('状态',()=>this.draw(),'fg-status-filter');
    this.fieldFix=button('选择排期日期字段',()=>this.app.renderEdit(this.app.context,this.app.preferences),{className:'fg-link-button',hidden:true});
    this.node.append(el('div',{className:'fg-schedule-toolbar'},el('div',{className:'fg-schedule-message'},this.access,this.fieldFix),el('div',{className:'fg-schedule-controls'},this.peopleFilter.node,this.statusFilter.node,this.calendarButton,this.edit)),this.error);
  }
  async init(){
    try{
      const meta=await this.client.schedule(this.app.gadgetId,this.filterId);if(this.disposed)return;
      const current=await this.client.scheduleSource(this.app.gadgetId,this.filterId,this.result.issues.map(i=>String(i.id)));if(this.disposed)return;
      const source=new Map(current.tasks.map(t=>[t.issueId,t]));if(this.result.issues.some(i=>!source.has(String(i.id))))throw new Error('任务实际数据不完整，请刷新后重试');
      this.settings=meta.settings;this.canEdit=meta.canEdit&&!this.result.truncated;this.reason=meta.canEdit&&this.result.truncated?'只读：筛选结果已截断，请缩小范围后排期':meta.reason;
      this.fieldFix.hidden=!(meta.configurationRequired&&this.app.API.isEditable());this.edit.title=this.canEdit?'按工作日计算并同步 Jira 排期':this.reason;
      const mapped=new Map([...this.baseData.scheduled,...this.baseData.unscheduled,...this.baseData.invalid].map(t=>[t.id,t]));
      const order=new Map(meta.order.map((id,i)=>[id,i]));
      const tasks=this.result.issues.map(issue=>{
        const t=mapped.get(String(issue.id)),f=issue.fields||{},seconds=f.timeoriginalestimate;
        const task={...t,issueId:String(issue.id),key:issue.key,text:f.summary||'',assigneeKey:f.assignee?.key||f.assignee?.name||'',assignee:f.assignee?.displayName||'未分配',estimate:seconds>0?(seconds%3600===0?`${seconds/3600}h`:`${Math.ceil(seconds/60)}m`):'',note:'',locked:false,startDate:t?.startDate||'',endDate:t?.endDate||'',done:t?.statusCategory==='done',predecessors:(f.issuelinks||[]).filter(l=>l.type?.name?.toLowerCase()==='blocks'&&l.inwardIssue).map(l=>String(l.inwardIssue.id)),...source.get(String(issue.id)).source,updatedMillis:source.get(String(issue.id)).updatedMillis};
        task.notBefore=task.startDate;return task;
      }).sort((a,b)=>(order.get(a.issueId)??Number.MAX_SAFE_INTEGER)-(order.get(b.issueId)??Number.MAX_SAFE_INTEGER));
      const dates=tasks.map(t=>t.startDate).filter(Boolean).sort();
      this.state={filterId:this.filterId,revision:meta.revision,calendarRevision:meta.calendarRevision,startDate:dates[0]||calendarDate(new Date().toISOString(),this.app.timeZone),calendar:meta.calendar,tasks};this.draw();
    }catch(e){if(!this.disposed&&!this.client.signal.aborted){this.message(e);this.edit.disabled=true;}}
  }
  message(error){
    if([401,403,404].includes(error.status)){this.denied=true;this.state=null;this.disposePickers();this.dialog?.close();this.dialog?.remove();this.dialogOpen=false;this.app.chart?.destroy();this.app.chart=null;this.app.content.replaceChildren();this.app.summary.replaceChildren();this.peopleFilter.node.hidden=true;this.statusFilter.node.hidden=true;this.fieldFix.hidden=true;this.access.textContent='不可访问';this.edit.disabled=true;}
    this.error.textContent=error.message||String(error);this.error.hidden=false;this.app.API.resize();
  }
  draw(state=this.state){
    if(this.disposed||this.denied||!this.state)return;
    this.app.scaleControl.disabled=!!this.busy;
    this.access.textContent=this.busy?'正在同步到 Jira…':this.reason;this.edit.disabled=!this.canEdit||this.busy||this.uncertain;
    const all=scheduleData(state,this.client.contextPath),allTasks=[...all.scheduled,...all.unscheduled,...all.invalid];
    const options=(key,label)=>{const values=new Map();for(const t of allTasks){const id=t[key]||'',entry=values.get(id)||{id,label:t[label]||'未知',search:id,count:0};entry.count++;values.set(id,entry);}return [...values.values()].sort((a,b)=>a.label.localeCompare(b.label,'zh-CN'));};
    this.peopleFilter.setOptions(options('assigneeKey','assignee'));this.statusFilter.setOptions(options('statusId','status'));
    const include=t=>(this.peopleFilter.value===null||this.peopleFilter.value.has(t.assigneeKey||''))&&(this.statusFilter.value===null||this.statusFilter.value.has(t.statusId||'')),data={...all,scheduled:all.scheduled.filter(include),unscheduled:all.unscheduled.filter(include),invalid:all.invalid.filter(include)};
    const visible=new Set(data.scheduled.map(t=>t.id));data.links=all.links.filter(l=>visible.has(l.source)&&visible.has(l.target));
    data.scheduled=data.scheduled.map(t=>({...t,parent:visible.has(t.parent)?t.parent:0}));
    this.app.drawChart(data,{canEdit:this.canEdit&&!this.uncertain,busy:!!this.busy,reason:this.reason,onEdit:t=>this.taskEditor(t),onChange:(t,mode)=>this.drag(t,mode),calendar:state.calendar});
    this.app.summary.textContent=`${this.result.issues.length} 个任务 · 已排期 ${data.scheduled.length} · 未排期 ${data.unscheduled.length} · 异常 ${data.invalid.length} · 时区 ${this.app.timeZone}`;this.app.API.resize();
  }
  modal(title){
    this.dialogOpen=true;this.pickers=[];const dialog=el('dialog',{className:'fg-dialog','aria-label':title},el('h3',{},title)),error=el('p',{role:'alert',className:'fg-error',hidden:true});dialog.append(error);
    const close=()=>{if(this.busy)return;this.disposePickers();dialog.close();dialog.remove();this.dialogOpen=false;this.dialog=null;this.app.API.resize();};
    dialog.addEventListener('cancel',event=>{event.preventDefault();close();});this.node.append(dialog);dialog.showModal();this.dialog=dialog;return {dialog,error,close};
  }
  async preview(draft){const response=await this.client.syncSchedule(this.app.gadgetId,scheduleBody(draft),true);const tasks=new Map(response.tasks.map(t=>[t.issueId,t]));for(const t of draft.tasks)Object.assign(t,tasks.get(t.issueId));return response;}
  cascade(draft,target,date){
    target.notBefore=date;
    if(date&&date<draft.startDate)draft.startDate=date;
    const affected=new Set([target.issueId]);let expanded=true;
    while(expanded){expanded=false;const last=new Map();for(const task of draft.tasks){const previous=last.get(task.assigneeKey);if((previous&&affected.has(previous))||(task.predecessors||[]).some(id=>affected.has(id))){if(!affected.has(task.issueId)){affected.add(task.issueId);expanded=true;}}if(!task.done)last.set(task.assigneeKey,task.issueId);}}
    for(const task of draft.tasks)if(task.issueId!==target.issueId&&affected.has(task.issueId)&&!task.locked)task.notBefore='';
  }
  closeDialog(){this.disposePickers();this.dialog?.close();this.dialog?.remove();this.dialog=null;this.dialogOpen=false;}
  async refreshTasks(){
    // Revalidate access and obtain actual values + full concurrency tokens without reloading the Gadget.
    const meta=await this.client.schedule(this.app.gadgetId,this.filterId);if(this.disposed)return;
    const response=await this.client.scheduleSource(this.app.gadgetId,this.filterId,this.state.tasks.map(t=>t.issueId));if(this.disposed)return;
    const source=new Map(response.tasks.map(t=>[t.issueId,t]));if(this.state.tasks.some(t=>!source.has(t.issueId)))throw new Error('任务实际数据不完整，请手动刷新后重试');
    const order=new Map(meta.order.map((id,i)=>[id,i]));
    const tasks=this.state.tasks.map(t=>{const actual=source.get(t.issueId);return {...t,...actual.source,updatedMillis:actual.updatedMillis,note:'',locked:false,notBefore:actual.source?.startDate??t.startDate};}).sort((a,b)=>(order.get(a.issueId)??Number.MAX_SAFE_INTEGER)-(order.get(b.issueId)??Number.MAX_SAFE_INTEGER));
    this.canEdit=meta.canEdit&&!this.result.truncated;this.reason=meta.canEdit&&this.result.truncated?'只读：筛选结果已截断，请缩小范围后排期':meta.reason;this.settings=meta.settings;
    this.state={...this.state,revision:meta.revision,calendarRevision:meta.calendarRevision,calendar:meta.calendar,tasks};this.uncertain=false;
  }
  async synchronize(draft){
    this.busy=true;this.app.scaleControl.disabled=true;this.edit.disabled=true;this.app.syncReport.textContent='正在同步到 Jira…';this.app.syncReport.className='fg-sync-report fg-help';this.app.syncReport.hidden=false;
    let response;
    try{response=await this.client.syncSchedule(this.app.gadgetId,scheduleBody(draft));}
    catch(e){
      if(this.disposed)return;
      if(e.status===400){this.busy=false;throw e;}
      // A transport failure can follow a successful update. Read back, never retry writes/comments.
      this.app.syncReport.textContent=`同步未完成或结果未知：${e.message}。正在核实 Jira 数据，不会自动重复提交。`;this.app.syncReport.className='fg-sync-report fg-warning';this.app.syncReport.hidden=false;
    }
    if(this.disposed)return;
    if(response){const saved=response.results.filter(r=>r.status==='saved'),failed=response.results.filter(r=>r.status!=='saved');
      this.app.syncReport.textContent=`已同步到 Jira ${saved.length} 个任务${failed.length?'；'+failed.map(r=>`${r.key}: ${r.message}`).join('；'):''}${!response.preferencesSaved?'；任务顺序未保存，请重新检查':''}`;
      this.app.syncReport.className=failed.length||!response.preferencesSaved?'fg-sync-report fg-warning':'fg-sync-report fg-help';this.app.syncReport.hidden=false;
    }
    this.closeDialog();
    try{await this.refreshTasks();this.error.hidden=true;if(!response)this.app.syncReport.textContent=this.app.syncReport.textContent.replace('正在核实 Jira 数据','已重新读取 Jira 实际数据');}
    catch(e){if(!this.disposed){this.uncertain=true;this.message(e);if(!this.denied){this.app.syncReport.textContent+='；未能核实最新 Jira 数据，请手动刷新后继续编辑。';this.app.syncReport.className='fg-sync-report fg-warning';this.app.syncReport.hidden=false;}}}
    finally{this.busy=false;if(!this.disposed)this.draw();}
  }
  editor(){
    if(!this.canEdit||this.dialogOpen||this.busy||this.uncertain)return;
    if(this.result.truncated){this.message(new Error('筛选结果已截断，请缩小范围后再自动排期'));return;}
    const draft=structuredClone(this.state),{dialog,error,close}=this.modal('自动排期');
    const start=el('input',{type:'date',value:calendarDate(new Date().toISOString(),this.app.timeZone),'aria-label':'排期开始日期'});
    dialog.append(labelled('排期起点',start),el('p',{className:'fg-help'},`估时、负责人和日期将同步到 Jira。估时对应原始预估，1d=${this.settings.hoursPerDay}h，1w=${this.settings.daysPerWeek}d。已完成任务跳过。`));
    dialog.append(el('p',{className:'fg-help'},'按人员分组，同一人员内可拖动或使用上下箭头调整顺序。工作日规则使用全局工作日历。'));
    const list=el('div',{className:'fg-schedule-task-list'});dialog.append(list);
    const apply=button('应用并同步到 Jira',async()=>{apply.disabled=true;try{await this.synchronize(draft);}catch(e){error.textContent=e.message;error.hidden=false;apply.disabled=false;}},{className:'fg-primary',disabled:true});
    const invalidate=()=>{apply.disabled=true;};dialog.addEventListener('input',invalidate);dialog.addEventListener('change',invalidate);
    const renderRows=()=>{this.disposePickers();groupTasks(draft.tasks);list.replaceChildren();let dragged=null,lastPerson=null,sequence=0;draft.tasks.forEach((task,index)=>{
      const first=lastPerson!==task.assigneeKey;if(first){lastPerson=task.assigneeKey;sequence=0;list.append(el('h4',{className:'fg-person-heading','data-assignee':task.assigneeKey},task.assignee||'未分配'));}sequence++;
      const row=el('div',{className:'fg-schedule-task',draggable:!task.done,'data-issue-id':task.issueId,'data-assignee':task.assigneeKey});
      row.addEventListener('dragstart',event=>{if(event.target.closest('input,button,select,textarea')){event.preventDefault();return;}dragged=task.issueId;event.dataTransfer.setData('text/plain',dragged);});row.addEventListener('dragover',event=>{if(dragged&&draft.tasks.find(t=>t.issueId===dragged)?.assigneeKey===task.assigneeKey)event.preventDefault();});row.addEventListener('drop',event=>{event.preventDefault();const from=draft.tasks.findIndex(t=>t.issueId===dragged);if(from<0||from===index||draft.tasks[from].assigneeKey!==task.assigneeKey)return;draft.tasks.splice(index,0,draft.tasks.splice(from,1)[0]);invalidate();renderRows();});
      const estimate=el('input',{value:task.estimate,placeholder:'4h / 2d / 1w','aria-label':`${task.key} 预估时间`,disabled:task.done,onInput:()=>{task.estimate=estimate.value;}}),person=this.personSelect(task,draft,()=>{invalidate();renderRows();}),locked=el('input',{type:'checkbox',checked:task.locked,'aria-label':`${task.key} 锁定`,disabled:task.done,onChange:()=>{task.locked=locked.checked;}}),output=el('span',{className:'fg-schedule-dates'},task.done?'已完成':task.startDate?`${task.startDate} → ${task.endDate}`:'待排期');
      const move=delta=>{const n=index+delta;if(n>=0&&n<draft.tasks.length&&draft.tasks[n].assigneeKey===task.assigneeKey){[draft.tasks[index],draft.tasks[n]]=[draft.tasks[n],draft.tasks[index]];invalidate();renderRows();}};
      row.append(el('span',{className:'fg-task-title'},`${sequence}. ${task.key} ${task.text}`),el('div',{className:'fg-task-input'},el('span',{},'预估时间'),estimate),el('div',{className:'fg-task-input'},el('span',{},'负责人'),person),el('label',{},locked,' 锁定'),output,el('div',{className:'fg-row-moves'},button('↑',()=>move(-1),{'aria-label':`${task.key} 上移`,disabled:first}),button('↓',()=>move(1),{'aria-label':`${task.key} 下移`,disabled:index===draft.tasks.length-1||draft.tasks[index+1].assigneeKey!==task.assigneeKey})));list.append(row);
    });};
    const calculate=button('自动排期',async()=>{calculate.disabled=true;apply.disabled=true;error.hidden=true;try{this.validatePickers();draft.startDate=start.value;for(const t of draft.tasks)if(!t.locked)t.notBefore='';await this.preview(draft);if(this.disposed||!dialog.isConnected)return;renderRows();apply.disabled=false;}catch(e){error.textContent=e.message;error.hidden=false;}finally{calculate.disabled=false;}},{className:'fg-primary'});
    renderRows();dialog.append(el('div',{className:'fg-actions'},button('取消',close),calculate,apply));
  }
  disposePickers(){for(const picker of this.pickers||[])picker.destroy();this.pickers=[];}
  validatePickers(){for(const picker of this.pickers||[])picker.validate();}
  personSelect(task,draft,onSelect=()=>{}){
    const people=new Map();for(const issue of this.result.issues){const p=issue.fields?.assignee;if(p)people.set(p.key||p.name,p.displayName);}for(const t of draft.tasks)if(t.assigneeKey)people.set(t.assigneeKey,t.assignee||t.assigneeKey);
    const picker=new AssigneePicker(this.client,task,people,onSelect);this.pickers.push(picker);return picker.node;
  }
  async calendarEditor(){
    if(this.dialogOpen||this.busy)return;const {dialog,error,close}=this.modal('全局工作日历');
    const loading=el('p',{},'正在加载全局工作日历…');dialog.append(loading);
    try{
      const current=await this.client.workCalendar();if(this.disposed||!dialog.isConnected)return;loading.remove();
      const draft=structuredClone(current.calendar),form=el('fieldset',{disabled:!current.canEdit},el('legend',{},'所有 Gadget 共用'));
      dialog.append(el('p',{className:'fg-help'},current.canEdit?'仅 Jira 管理员可修改。保存后影响所有 Gadget 的后续排期，已有 Jira 日期不会自动改动。':'只读：请联系 Jira 管理员修改全局工作日历。'));
      const days=el('div',{className:'fg-calendar-days'});for(let day=1;day<=7;day++){const input=el('input',{type:'checkbox',checked:draft.weekdays.includes(day),onChange:()=>{draft.weekdays=input.checked?[...draft.weekdays,day]:draft.weekdays.filter(d=>d!==day);}});days.append(el('label',{className:'fg-day'},input,` 周${'一二三四五六日'[day-1]}`));}
      const holidays=el('textarea',{'aria-label':'非工作日期',rows:3,placeholder:'YYYY-MM-DD，多日用逗号或换行分隔'},draft.holidays.join(', ')),workDates=el('textarea',{'aria-label':'补班日期',rows:3,placeholder:'YYYY-MM-DD'},draft.workDates.join(', '));
      form.append(days,labelled('非工作日期',holidays),labelled('补班日期',workDates));dialog.append(form);
      const save=button('保存全局工作日历',async()=>{save.disabled=true;error.hidden=true;try{const parse=n=>n.value.split(/[\s,，]+/).filter(Boolean);draft.holidays=parse(holidays);draft.workDates=parse(workDates);await this.client.saveWorkCalendar({revision:current.revision,calendar:draft});if(this.disposed||!dialog.isConnected)return;close();await this.app.load();}catch(e){if(dialog.isConnected){error.textContent=e.message;error.hidden=false;save.disabled=false;}}},{className:'fg-primary'});
      dialog.append(el('div',{className:'fg-actions'},button('关闭',close),...(current.canEdit?[save]:[])));
    }catch(e){if(dialog.isConnected){loading.remove();error.textContent=e.message;error.hidden=false;dialog.append(button('关闭',close));}}
  }
  taskEditor(task){
    if(!this.state||this.dialogOpen||this.busy)return;const draft=structuredClone(this.state),target=draft.tasks.find(t=>t.issueId===task.id);if(!target)return;
    const {dialog,error,close}=this.modal(`${target.key} · Jira 任务`),writable=this.canEdit&&!this.uncertain&&!target.done;
    const estimate=el('input',{value:target.estimate,disabled:!writable,'aria-label':'原始预估时间'}),date=el('input',{type:'date',value:target.startDate,disabled:!writable,'aria-label':'开始日期'}),comment=el('textarea',{rows:4,maxlength:2000,disabled:!writable,'aria-label':'新增 Jira 评论'});
    const comments=el('div',{},'正在读取 Jira 评论…');dialog.append(el('p',{},target.text),labelled('原始预估时间',estimate),labelled('开始日期',date),labelled('负责人',this.personSelect(target,draft)),comments,labelled('新增 Jira 评论',comment),el('p',{className:'fg-help'},writable?'保存后写入 Jira，并顺延后续任务。':'只读任务，可查看评论。'));
    if(!writable)for(const input of dialog.querySelectorAll('input,select,textarea'))input.disabled=true;
    this.client.comments(target.key).then(result=>{if(!dialog.isConnected)return;comments.replaceChildren(el('strong',{},'已有 Jira 评论（最多显示 5 条）'),...result.comments.map(c=>el('p',{className:'fg-note-text'},`${c.author?.displayName||''}：${typeof c.body==='string'?c.body:''}`)));}).catch(e=>{if(dialog.isConnected)comments.textContent=e.message;});
    const save=button('保存到 Jira',async()=>{save.disabled=true;target.estimate=estimate.value;this.cascade(draft,target,date.value);target.note=comment.value;try{this.validatePickers();await this.preview(draft);if(this.disposed||!dialog.isConnected)return;await this.synchronize(draft);}catch(e){if(!dialog.isConnected)return;error.textContent=e.message;error.hidden=false;save.disabled=false;}},{className:'fg-primary'});
    dialog.append(el('div',{className:'fg-actions'},button('关闭',close),...(writable?[save]:[])));
  }
  async drag(task,mode){
    if(!this.canEdit||this.busy||this.uncertain)return;const draft=structuredClone(this.state),target=draft.tasks.find(t=>t.issueId===task.id);if(!target||target.done||target.locked){this.draw();return;}
    if(mode==='resize'){let days=0;const end=new Date(task.end_date),date=new Date(task.start_date),cal=draft.calendar;while(date<end){const key=`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;if(cal.workDates.includes(key)||(cal.weekdays.includes(date.getDay()||7)&&!cal.holidays.includes(key)))days++;date.setDate(date.getDate()+1);}target.estimate=`${Math.max(1,days)*this.settings.hoursPerDay}h`;}
    else{const d=task.start_date;target.notBefore=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
    this.cascade(draft,target,target.notBefore||target.startDate);
    this.busy=true;this.app.scaleControl.disabled=true;this.edit.disabled=true;this.app.chart?.setEditable(false);try{await this.preview(draft);if(this.disposed)return;this.draw(draft);await this.synchronize(draft);}catch(e){if(!this.disposed){this.message(e);if(e.status===409)try{await this.refreshTasks();}catch(readError){this.uncertain=true;this.message(readError);}}}finally{this.busy=false;if(!this.disposed)this.draw();}
  }
  destroy(){this.disposed=true;this.disposePickers();this.dialog?.close();this.dialog?.remove();this.peopleFilter.destroy();this.statusFilter.destroy();this.node.replaceChildren();}
}
