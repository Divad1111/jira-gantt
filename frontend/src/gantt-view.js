import { Gantt } from 'dhtmlx-gantt';
import { escapeHtml, calendarDate, toLocalDate } from './model.js';
import { el, issueAnchor } from './dom.js';

const scales = {
  day: [{ unit: 'month', step: 1, format: '%Y-%m' }, { unit: 'day', step: 1, format: '%d %D' }],
  week: [{ unit: 'month', step: 1, format: '%Y-%m' }, { unit: 'week', step: 1, format: '%m/%d' }],
  month: [{ unit: 'year', step: 1, format: '%Y' }, { unit: 'month', step: 1, format: '%m' }]
};

export function mountGantt(container, data, c, scale, detail, onResize, timeZone) {
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
    readonly: true, drag_move: false, drag_resize: false, drag_progress: false, drag_links: false,
    details_on_dblclick: false, details_on_create: false, show_progress: true,
    duration_unit: 'day', work_time: false, date_format: '%Y-%m-%d',
    smart_rendering: true, grid_width: 380, row_height: 34, scale_height: 52,
    min_column_width: scale === 'day' ? 40 : 85, scales: scales[scale],
    columns: [
      { name: 'text', label: 'Issue / 标题', tree: c.showHierarchy === 'true', width: 230, resize: true,
        template: t => `${t.href ? `<a href="${escapeHtml(t.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(t.key)}</a>` : escapeHtml(t.key)} ${escapeHtml(t.text)}` },
      { name: 'assignee', label: '负责人', width: 85, template: t => escapeHtml(t.assignee) },
      { name: 'status', label: '状态', width: 65, template: t => escapeHtml(t.status) }
    ]
  });
  gantt.templates.task_text = (_start, _end, t) => escapeHtml(`${t.key} ${t.text}`);
  gantt.templates.progress_text = (_start, _end, t) => t.progress == null ? '' : `${Math.round(t.progress * 100)}%`;
  gantt.templates.task_class = (_start, _end, t) => `fg-status-${['new', 'indeterminate', 'done'].includes(t.statusCategory) ? t.statusCategory : 'undefined'}${t.progress == null ? ' fg-no-progress' : ''}`;
  gantt.templates.timeline_cell_class = (_task, date) => [0, 6].includes(date.getDay()) ? 'fg-weekend' : '';
  gantt.attachEvent('onTaskDblClick', () => false);
  gantt.attachEvent('onBeforeLightbox', () => false);
  gantt.attachEvent('onGanttRender', drawToday);
  gantt.attachEvent('onDataRender', drawToday);
  gantt.attachEvent('onTaskClick', (taskId, event) => {
    if (event.target.closest('a')) return true;
    const t = gantt.getTask(taskId);
    detail.replaceChildren(el('div', { className: 'fg-detail' }, issueAnchor(t),
      el('strong', {}, t.text), el('span', {}, `${t.assignee} · ${t.status}`),
      el('span', {}, `${t.startDate} → ${t.endDate}（包含结束日）`),
      el('span', {}, t.progress == null ? '进度未知' : `进度 ${Math.round(t.progress * 100)}%`)));
    onResize(); return true;
  });
  gantt.init(container);
  gantt.parse({ data: data.scheduled.map(t => ({ ...t, progress: t.progress ?? undefined })), links: data.links });
  return {
    today() { gantt.showDate(today()); },
    scale(value) { gantt.config.scales = scales[value]; gantt.config.min_column_width = value === 'day' ? 40 : 85; gantt.render(); },
    resize() { gantt.setSizes(); },
    destroy() { gantt.destructor(); }
  };
}
