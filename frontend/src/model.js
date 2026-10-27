export const SCALES = ['day', 'week', 'month'];
export const DEFAULTS = Object.freeze({
  schemaVersion: '1', mode: 'VIEWER_SELECTABLE', defaultFilterId: '',
  startDateFieldId: '', endDateFieldId: 'duedate', initialScale: 'week',
  heightPx: '480', maxIssues: '500', showHierarchy: 'true',
  showDependencies: 'false', refreshMinutes: '0', isConfigured: 'false'
});

export function id(value, optional = false) {
  if (optional && (value == null || value === '')) return '';
  const str = String(value ?? '');
  if (!/^[1-9]\d{0,18}$/.test(str) || BigInt(str) > 9223372036854775807n) throw new Error('ID 必须是有效的正整数');
  return str;
}

export function config(input = {}) {
  const c = Object.fromEntries(Object.keys(DEFAULTS).map(k => [k, String(input[k] ?? DEFAULTS[k])]));
  if (!['SHARED_FIXED', 'VIEWER_SELECTABLE'].includes(c.mode)) throw new Error('配置模式无效');
  id(c.defaultFilterId, true);
  if (c.mode === 'SHARED_FIXED' && !c.defaultFilterId) throw new Error('固定模式必须选择默认筛选器');
  if (!/^(duedate|created|updated|customfield_\d+)$/.test(c.startDateFieldId)) throw new Error('请选择开始日期字段');
  if (!/^(duedate|created|updated|customfield_\d+)$/.test(c.endDateFieldId)) throw new Error('请选择结束日期字段');
  if (!SCALES.includes(c.initialScale)) throw new Error('时间刻度无效');
  for (const [k, min, max] of [['heightPx', 300, 900], ['maxIssues', 1, 1000]]) {
    if (!/^\d+$/.test(c[k]) || +c[k] < min || +c[k] > max) throw new Error(`${k} 必须在 ${min}–${max} 之间`);
  }
  for (const k of ['showHierarchy', 'showDependencies']) if (!['true', 'false'].includes(c[k])) throw new Error(`${k} 无效`);
  if (!['0', '5', '10', '30'].includes(c.refreshMinutes)) throw new Error('刷新间隔无效');
  if (c.schemaVersion !== '1') throw new Error('不支持此配置版本');
  return c;
}

export function dateFields(fields) {
  return fields.filter(f => ['date', 'datetime'].includes(f.schema?.type) ||
    /:(datepicker|datetime)$/.test(f.schema?.custom ?? '')).filter(f =>
    /^(duedate|created|updated|customfield_\d+)$/.test(f.id));
}
export function writableDateFields(fields) {
  const types=new Set(['com.atlassian.jira.plugin.system.customfieldtypes:datepicker','com.atlassian.jira.plugin.system.customfieldtypes:datetime','com.atlassian.jpo:jpo-custom-field-baseline-start','com.atlassian.jpo:jpo-custom-field-baseline-end']);
  return dateFields(fields).filter(f=>f.id==='duedate'||types.has(f.schema?.custom));
}

function localDate(y, m, d) {
  const value = new Date(0);
  value.setFullYear(y, m - 1, d);
  value.setHours(0, 0, 0, 0);
  return value.getFullYear() === y && value.getMonth() === m - 1 && value.getDate() === d ? value : null;
}
function dateString(y, m, d) { return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`; }

export function calendarDate(value, timeZone) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string') throw new Error('日期格式无效');
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match) {
    if (+match[1] < 1900 || +match[1] > 2200 || !localDate(+match[1], +match[2], +match[3])) throw new Error('日期无效或超出 1900–2200');
    return value;
  }
  // Jira DateTime includes an offset (often +0800). Never interpret offset-less timestamps.
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/.test(value)) throw new Error('日期时间必须含时区');
  calendarDate(value.slice(0, 10), timeZone);
  if (!timeZone) throw new Error('无法确定 Jira 用户时区');
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new Error('日期时间无效');
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(parsed).map(p => [p.type, p.value]));
  return calendarDate(`${parts.year}-${parts.month}-${parts.day}`, timeZone);
}

export function toLocalDate(date) {
  const [y, m, d] = date.split('-').map(Number);
  return localDate(y, m, d);
}
export function exclusiveEnd(date) {
  const result = toLocalDate(date);
  result.setDate(result.getDate() + 1);
  return result;
}
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
export function browseHref(key, contextPath) {
  if (!/^[A-Z][A-Z0-9_]*-\d+$/.test(key)) return null;
  return `${contextPath}/browse/${encodeURIComponent(key)}`;
}

export function mapIssues(issues, c, contextPath, timeZone) {
  const scheduled = [], unscheduled = [], invalid = [];
  const seen = new Set();
  for (const issue of issues) {
    if (!/^\d+$/.test(String(issue.id)) || seen.has(String(issue.id))) continue;
    seen.add(String(issue.id));
    const f = issue.fields ?? {};
    const task = {
      id: String(issue.id), key: String(issue.key), text: String(f.summary ?? ''),
      href: browseHref(issue.key, contextPath), assignee: f.assignee?.displayName ?? '未分配', assigneeKey: f.assignee?.key ?? f.assignee?.name ?? '',
      status: f.status?.name ?? '未知状态', statusId: String(f.status?.id ?? f.status?.name ?? ''), statusCategory: f.status?.statusCategory?.key ?? 'undefined',
      parentId: f.parent?.id ? String(f.parent.id) : null, progress: null, issueLinks: f.issuelinks ?? []
    };
    if (Number.isFinite(f.timeoriginalestimate) && f.timeoriginalestimate > 0 && Number.isFinite(f.timeestimate) && f.timeestimate >= 0) {
      task.progress = Math.max(0, Math.min(1, (f.timeoriginalestimate - f.timeestimate) / f.timeoriginalestimate));
    }
    try {
      task.startDate = calendarDate(f[c.startDateFieldId], timeZone);
      task.endDate = calendarDate(f[c.endDateFieldId], timeZone);
      if (!task.startDate || !task.endDate) {
        task.reason = !task.startDate && !task.endDate ? '缺少起止日期' : !task.startDate ? '缺少开始日期' : '缺少结束日期';
        unscheduled.push(task);
      } else if (task.endDate < task.startDate) {
        task.reason = '结束日期早于开始日期'; invalid.push(task);
      } else {
        task.start_date = toLocalDate(task.startDate);
        task.end_date = exclusiveEnd(task.endDate);
        task.open = true; scheduled.push(task);
      }
    } catch (error) { task.reason = error.message; invalid.push(task); }
  }
  const visible = new Map(scheduled.map(t => [t.id, t]));
  let brokenParents = 0;
  for (const t of scheduled) {
    t.parent = c.showHierarchy === 'true' && visible.has(t.parentId) ? t.parentId : 0;
    // Break cycles before giving the graph to the library.
    const chain = new Set([t.id]);
    let p = t.parent;
    while (p && visible.has(p)) {
      if (chain.has(p)) { t.parent = 0; brokenParents++; break; }
      chain.add(p); p = visible.get(p).parentId;
    }
  }
  const links = [], unique = new Set();
  if (c.showDependencies === 'true') for (const t of scheduled) for (const link of t.issueLinks) {
    if (String(link.type?.name).toLowerCase() !== 'blocks') continue;
    const source = link.outwardIssue ? t.id : String(link.inwardIssue?.id);
    const target = link.outwardIssue ? String(link.outwardIssue.id) : t.id;
    const key = `${source}:${target}`;
    if (source !== target && visible.has(source) && visible.has(target) && !unique.has(key)) {
      unique.add(key); links.push({ id: key, source, target, type: '0' });
    }
  }
  return { scheduled, unscheduled, invalid, links, brokenParents };
}
