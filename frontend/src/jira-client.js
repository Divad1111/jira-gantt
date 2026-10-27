import { id } from './model.js';

export class HttpError extends Error {
  constructor(status, message, retryAfter = 0) { super(message); this.status = status; this.retryAfter = retryAfter; }
}
export function errorMessage(error) {
  return ({ 401: '请重新登录 Jira', 403: '无权访问当前筛选器或 Gadget，请重新选择',
    404: '筛选器或 Gadget 不存在或不可访问', 429: 'Jira 请求过多，请稍后手动刷新',
    503: 'Jira 暂时不可用，请稍后手动刷新' })[error.status] ?? error.message ?? '加载失败';
}

export class JiraClient {
  constructor(contextPath, signal, fetcher = window.fetch.bind(window)) {
    if (contextPath && (!contextPath.startsWith('/') || contextPath.startsWith('//') || /[?#\\]/.test(contextPath))) throw new Error('Jira Context Path 无效');
    this.contextPath = contextPath.replace(/\/$/, ''); this.signal = signal; this.fetcher = fetcher;
  }
  async request(path, { method = 'GET', body, signal = this.signal, timeoutMs = 30000 } = {}) {
    if (!path.startsWith('/rest/')) throw new Error('仅允许 Jira 同源 REST');
    const timeout = new AbortController();
    const relay = () => timeout.abort(signal?.reason);
    if (signal?.aborted) relay();
    signal?.addEventListener('abort', relay, { once: true });
    const timer = setTimeout(() => timeout.abort(new DOMException('请求超时，请手动刷新', 'TimeoutError')), timeoutMs);
    try {
      const response = await this.fetcher(this.contextPath + path, {
        method, signal: timeout.signal, credentials: 'same-origin', cache: 'no-store', redirect: 'error',
        headers: { Accept: 'application/json', ...(method !== 'GET' ? { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' } : {}) },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {})
      });
      if (!response.ok) {
        let message = `Jira 请求失败 (${response.status})`;
        if (path.startsWith('/rest/filter-gantt/')) {
          try { const body = await response.json(); if (typeof body.message === 'string') message = body.message; } catch { }
        }
        throw new HttpError(response.status, message, +(response.headers.get('Retry-After') ?? 0));
      }
      if (response.status === 204) return null;
      return await response.json();
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', relay); }
  }
  get(path) { return this.request(path); }
  filter(filterId) { return this.get(`/rest/api/2/filter/${id(filterId)}`); }
  fields() { return this.get('/rest/api/2/field'); }
  me() { return this.get('/rest/api/2/myself'); }
  schedule(gadgetId, filterId) { return this.get(`/rest/filter-gantt/1.0/schedule/${id(gadgetId)}?filterId=${id(filterId)}`); }
  scheduleSource(gadgetId, filterId, issueIds) { return this.request(`/rest/filter-gantt/1.0/schedule/${id(gadgetId)}/source`,{method:'POST',body:{filterId,issueIds}}); }
  syncSchedule(gadgetId, body, preview = false) { return this.request(`/rest/filter-gantt/1.0/schedule/${id(gadgetId)}${preview ? '/preview' : ''}`, { method: 'POST', body }); }
  workCalendar() { return this.get('/rest/filter-gantt/1.0/calendar'); }
  saveWorkCalendar(body) { return this.request('/rest/filter-gantt/1.0/calendar',{method:'PUT',body}); }
  assignees(issueKey, query, startAt=0, signal) { return this.request(`/rest/api/2/user/assignable/search?${new URLSearchParams({ issueKey, username: query, startAt:String(startAt), maxResults: '30' })}`,{signal}); }
  comments(issueKey) { return this.get(`/rest/api/2/issue/${encodeURIComponent(issueKey)}/comment?maxResults=5`); }
  personal(gadgetId) { return this.get(`/rest/filter-gantt/1.0/personal/${id(gadgetId)}`); }
  savePersonal(gadgetId, value) { return this.request(`/rest/filter-gantt/1.0/personal/${id(gadgetId)}`, { method: 'PUT', body: value }); }
  resetPersonal(gadgetId) { return this.request(`/rest/filter-gantt/1.0/personal/${id(gadgetId)}`, { method: 'DELETE' }); }
  filters(query = '', scope = 'favourite', page = 0, signal) {
    return this.request(`/rest/filter-gantt/1.0/filters?${new URLSearchParams({ query, scope, page: String(page) })}`, { signal });
  }
  async issues(filterId, fields, cap = 500) {
    const filter = id(filterId);
    if (!Number.isInteger(cap) || cap < 1 || cap > 1000) throw new Error('任务数上限无效');
    let startAt = 0, total = 0, issues = [];
    while (issues.length < cap) {
      this.signal?.throwIfAborted();
      const page = await this.request('/rest/api/2/search', { method: 'POST', body: {
        jql: `filter = ${filter}`, fields: [...new Set(fields)], startAt, maxResults: Math.min(100, cap - issues.length)
      } });
      if (!Array.isArray(page.issues) || !Number.isInteger(page.total) || page.total < 0 ||
        (page.startAt !== undefined && page.startAt !== startAt)) throw new Error('Jira 分页响应无效');
      total = page.total;
      if (!page.issues.length) break;
      issues.push(...page.issues.slice(0, cap - issues.length));
      startAt += page.issues.length;
      if (startAt >= total) break;
    }
    // Revalidate visibility after pagination before exposing any data.
    await this.filter(filter);
    return { issues, total, truncated: issues.length < total };
  }
}
