import { Gantt } from 'dhtmlx-gantt';
import { escapeHtml, calendarDate, toLocalDate } from './model.js';
import { el, issueAnchor } from './dom.js';

const scales = {
  day: [{ unit: 'month', step: 1, format: '%Y-%m' }, { unit: 'day', step: 1, format: '%d %D' }],
  week: [{ unit: 'month', step: 1, format: '%Y-%m' }, { unit: 'week', step: 1, format: '%m/%d' }],
  month: [{ unit: 'year', step: 1, format: '%Y' }, { unit: 'month', step: 1, format: '%m' }]
};

export function mountGantt(container, data, c, scale, detail, onResize, timeZone, editing = {}) {
  const gantt = Gantt.getGanttInstance();
  const today = () => toLocalDate(calendarDate(new Date().toISOString(), timeZone));
  // Community 10.0.3 omits the marker extension. Use public position/lifecycle APIs.
  const drawToday = () => {
    container.querySelectorAll('.fg-today-marker').forEach(node => node.remove());
    const x = gantt.posFromDate(today());
    if (!gantt.$task_data || x < 0) return;
    const marker = el('div', { className: 'fg-today-marker', title: '今天', 'aria-label': '今天' });
    marker.style.left = `${x}px`;
    marker.style.height = `${Math.max(gantt.$task_data.scrollHeight, gantt.$task_data.clientHeight)}px`;
    gantt.$task_data.append(marker);
  };
  Object.assign(gantt.config, {
    readonly: !editing.canEdit, drag_move: !!editing.canEdit, drag_resize: !!editing.canEdit, drag_progress: false, drag_links: false,
    details_on_dblclick: false, details_on_create: false, show_progress: true,
    duration_unit: 'day', work_time: false, date_format: '%Y-%m-%d',
    smart_rendering: true, grid_width: editing.calendar ? 480 : 380, row_height: 34, scale_height: 52,
    min_column_width: scale === 'day' ? 40 : 85, scales: scales[scale],
    columns: [
      { name: 'text', label: 'Issue / 标题', tree: c.showHierarchy === 'true', width: 230, resize: true,
        template: t => `${t.href ? `<a href="${escapeHtml(t.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(t.key)}</a>` : escapeHtml(t.key)} ${escapeHtml(t.text)}` },
      { name: 'assignee', label: '负责人', width: 85, template: t => escapeHtml(t.assignee) },
      { name: 'status', label: '状态', width: 65, template: t => escapeHtml(t.status) },
      ...(editing.calendar ? [{ name:'estimate', label:'顺序 / 估时', width:100, template:t=>`${escapeHtml(`${t.sequence||'-'}. ${t.estimate}`)} <span class="fg-note" title="查看或新增 Jira 评论">📝</span>` }] : [])
    ]
  });
  gantt.templates.task_text = (_start, _end, t) => `${escapeHtml(`${t.sequence ? t.sequence+'. ' : ''}${t.key} ${t.text}${t.estimate ? ' · '+t.estimate : ''}${t.locked ? ' 🔒' : ''}`)}${t.note ? ' <span class="fg-note" title="查看排期备注">📝</span>' : ''}`;
  gantt.templates.link_class = link => link.resourceSequence ? 'fg-resource-link' : '';
  gantt.templates.progress_text = (_start, _end, t) => t.progress == null ? '' : `${Math.round(t.progress * 100)}%`;
  gantt.templates.task_class = (_start, _end, t) => `fg-status-${['new', 'indeterminate', 'done'].includes(t.statusCategory) ? t.statusCategory : 'undefined'}${t.progress == null ? ' fg-no-progress' : ''}${editing.canEdit&&!t.done&&!t.locked?' fg-editable':''}`;
  gantt.templates.timeline_cell_class = (_task, date) => {
    const key=`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`,cal=editing.calendar;
    const working=cal ? cal.workDates.includes(key)||(cal.weekdays.includes(date.getDay()||7)&&!cal.holidays.includes(key)) : ![0,6].includes(date.getDay());
    return working ? '' : 'fg-weekend';
  };
  gantt.attachEvent('onTaskDblClick', taskId => { editing.onEdit?.(gantt.getTask(taskId)); return false; });
  gantt.attachEvent('onBeforeTaskDrag', taskId => !!editing.canEdit && !editing.busy && !gantt.getTask(taskId).locked && !gantt.getTask(taskId).done);
  gantt.attachEvent('onAfterTaskDrag', (taskId, mode) => { if (editing.canEdit) editing.onChange?.(gantt.getTask(taskId), mode); });
  gantt.attachEvent('onBeforeLightbox', () => false);
  gantt.attachEvent('onGanttRender', drawToday);
  gantt.attachEvent('onDataRender', drawToday);
  gantt.attachEvent('onTaskClick', (taskId, event) => {
    if (event.target.closest('a')) return true;
    const t = gantt.getTask(taskId);
    if(event.target.closest('.fg-note')) {editing.onEdit?.(t);return false;}
    detail.replaceChildren(el('div', { className: 'fg-detail' }, issueAnchor(t),
      el('strong', {}, t.text), el('span', {}, `${t.assignee} · ${t.status}`),
      el('span', {}, `${t.startDate} → ${t.endDate}（包含结束日）`),
      el('span', {}, t.progress == null ? '进度未知' : `进度 ${Math.round(t.progress * 100)}%`),
      ...(t.estimate?[el('span',{},`估时 ${t.estimate} · 顺序 ${t.sequence}`)]:[]),
      ...(t.note?[el('span',{className:'fg-note-text'},`备注：${t.note}`)]:[])));
    onResize(); return true;
  });
  gantt.init(container);
  gantt.parse({ data: data.scheduled.map(t => ({ ...t, progress: t.progress ?? undefined })), links: data.links });
  return {
    editableLayout: !!editing.calendar,
    setEditable(value) { editing.busy=!value;Object.assign(gantt.config,{readonly:!value||!editing.canEdit,drag_move:value&&!!editing.canEdit,drag_resize:value&&!!editing.canEdit}); },
    update(next, nextEditing) {
      const permissionsChanged=editing.canEdit!==nextEditing.canEdit;
      editing=nextEditing;
      const writable=!!editing.canEdit&&!editing.busy;
      Object.assign(gantt.config,{readonly:!writable,drag_move:writable,drag_resize:writable});
      container.setAttribute('aria-label',editing.canEdit?'可编辑任务甘特图':'只读任务甘特图');
      const scroll=gantt.getScrollState(),anchor=gantt.dateFromPos(scroll.x),selected=gantt.getSelectedId(),range=gantt.getState();
      const incoming=new Map(next.scheduled.map(t=>[String(t.id),t])),oldIds=[];gantt.eachTask(t=>oldIds.push(String(t.id)));
      const changed=[],changedLinks=[];let structural=false,extend=false;
      gantt.batchUpdate(()=>{
        // Reparent retained children before deleting an ancestor hidden by a display filter.
        for(const task of next.scheduled)if(gantt.isTaskExists(task.id)&&String(gantt.getParent(task.id))!==String(task.parent||0)){gantt.moveTask(task.id,0,0);structural=true;}
        for(const id of oldIds)if(!incoming.has(id)&&gantt.isTaskExists(id)){gantt.deleteTask(id);structural=true;}
        const add=task=>{if(gantt.isTaskExists(task.id))return;if(task.parent&&incoming.has(String(task.parent)))add(incoming.get(String(task.parent)));gantt.addTask({...task,progress:task.progress??undefined});structural=true;};
        for(const task of next.scheduled){
          add(task);const current=gantt.getTask(task.id),values={...task,open:current.$open??current.open,progress:task.progress??undefined};
          values.duration=gantt.calculateDuration({start_date:task.start_date,end_date:task.end_date,task:current});
          const differs=Object.entries(values).some(([key,value])=>value instanceof Date?+current[key]!==+value:typeof value!=='object'&&current[key]!==value);
          if(differs||permissionsChanged){Object.assign(current,values);gantt.updateTask(task.id);changed.push(task.id);}
          if(task.start_date<range.min_date||task.end_date>range.max_date)extend=true;
        }
        const siblings=new Map();for(const task of next.scheduled){const parent=task.parent||0;if(!siblings.has(parent))siblings.set(parent,[]);siblings.get(parent).push(task.id);}
        for(const [parent,ids] of siblings)for(const [index,id] of ids.entries())if(String(gantt.getChildren(parent)[index])!==String(id)){gantt.moveTask(id,index,parent);structural=true;}
        const links=new Map(next.links.map(link=>[String(link.id),link]));
        for(const link of gantt.getLinks())if(!links.has(String(link.id))){gantt.deleteLink(link.id);structural=true;}
        for(const link of next.links){if(!gantt.isLinkExists(link.id)){gantt.addLink({...link});structural=true;}else{const current=gantt.getLink(link.id);if(Object.entries(link).some(([key,value])=>current[key]!==value)){Object.assign(current,link);gantt.updateLink(link.id);changedLinks.push(link.id);}}}
      },true);
      // A normal move/resize only redraws affected rows. Range/structure changes need layout.
      if(structural||extend)gantt.render();else{for(const id of changed)gantt.refreshTask(id);for(const id of changedLinks)gantt.refreshLink(id);}
      if(selected&&gantt.isTaskExists(selected)&&gantt.getSelectedId()!==selected)gantt.selectTask(selected);
      gantt.scrollTo(extend&&anchor?gantt.posFromDate(anchor):scroll.x,scroll.y);drawToday();
    },
    today() { gantt.showDate(today()); },
    scale(value) { gantt.config.scales = scales[value]; gantt.config.min_column_width = value === 'day' ? 40 : 85; gantt.render(); },
    resize() { gantt.setSizes(); },
    destroy() { gantt.destructor(); }
  };
}
