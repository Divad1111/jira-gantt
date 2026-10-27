import contextPath from 'wrm/context-path';
import { config, DEFAULTS, dateFields, writableDateFields, mapIssues, SCALES, id } from './model.js';
import { JiraClient, errorMessage } from './jira-client.js';
import { el, button, labelled, issueAnchor } from './dom.js';
import { FilterPicker } from './filter-picker.js';
import { mountGantt } from './gantt-view.js';
import { SchedulingWorkspace } from './scheduling-workspace.js';

export default class FilterGanttDashboardItem {
  constructor(API) { this.API = API; this.generation = 0; }

  cleanup() {
    this.generation++; this.controller?.abort(); this.loadController?.abort();
    clearInterval(this.refreshTimer); this.chart?.destroy(); this.chart = null;
    this.workspace?.destroy(); this.workspace = null;
    this.observer?.disconnect(); this.resizeObserver?.disconnect();
    if (this.visibilityListener) document.removeEventListener('visibilitychange', this.visibilityListener);
    this.c = null; this.timeZone = null; this.preferenceSequence = 0; this.desiredPersonal = null; this.preferenceQueue = Promise.resolve();
    this.API.hideLoadingBar?.();
  }
  destroy() { this.cleanup(); this.root?.replaceChildren(); }
  setup(context) {
    this.cleanup(); this.context = context?.jquery ? context[0] : context;
    if (!(this.context instanceof HTMLElement)) throw new Error('Dashboard context missing');
    this.root = el('section', { className: 'filter-gantt', 'aria-label': 'Filter Gantt Gadget' });
    this.context.replaceChildren(this.root);
    this.controller = new AbortController(); this.client = new JiraClient(contextPath(), this.controller.signal);
    this.observer = new MutationObserver(() => { if (!this.root.isConnected) this.cleanup(); });
    const observe = () => { if (this.root.isConnected) this.observer.observe(document.body, { childList: true, subtree: true }); };
    this.API.once?.('afterRender', observe); queueMicrotask(observe);
    return this.generation;
  }
  showError(error) {
    this.loadController?.abort(); this.chart?.destroy(); this.chart = null;
    this.content?.replaceChildren(); this.summary?.replaceChildren();
    this.error.textContent = errorMessage(error); this.error.hidden = false; this.API.resize();
  }
  async render(context, preferences = {}) {
    const generation = this.setup(context); this.preferences = preferences;
    this.error = el('p', { className: 'fg-error', role: 'alert', hidden: true });
    this.summary = el('p', { className: 'fg-summary', role: 'status' });
    this.content = el('div', { className: 'fg-content' });
    this.filterLabel = el('span', { className: 'fg-filter-name' }, '尚未选择筛选器');
    this.scaleControl = el('select', { 'aria-label': '时间刻度' }, ...SCALES.map((s, i) => el('option', { value: s }, ['日', '周', '月'][i])));
    this.scaleControl.addEventListener('change', () => this.changeScale(this.scaleControl.value));
    const toolbar = el('div', { className: 'fg-toolbar' }, this.filterLabel, this.scaleControl,
      button('今天', () => this.chart?.today()), button('刷新', () => this.load()));
    this.scheduleHost = el('div', { className: 'fg-schedule-host' });
    this.syncReport = el('p', {className:'fg-sync-report fg-help',role:'status',hidden:true});
    this.root.append(toolbar, this.error, this.syncReport, this.scheduleHost, this.summary, this.content);
    try {
      if (String(preferences.isConfigured) !== 'true') { this.summary.textContent = '请 Dashboard 编辑者先配置日期字段和视图模式。'; return; }
      this.c = config(preferences); this.gadgetId = id(this.API.getGadgetId());
      this.API.setTitle('Filter Gantt Gadget'); this.API.showLoadingBar();
      const personal = await this.client.personal(this.gadgetId);
      if (generation !== this.generation) return;
      this.personal = personal;
      this.desiredPersonal = { selectedFilterId: personal.selectedFilterId, scale: personal.scale };
      this.scaleControl.value = personal.scale ?? this.c.initialScale;
      if (this.c.mode === 'VIEWER_SELECTABLE') {
        const pickerPanel = el('div', { className: 'fg-select-panel' });
        const picker = new FilterPicker(this.client, this.controller.signal, filterId => this.changeFilter(filterId),
          { selectedId: personal.selectedFilterId ?? '', allowDefault: true, onResize: () => this.API.resize() });
        pickerPanel.append(picker.node); this.root.insertBefore(pickerPanel, this.error);
      }
      this.visibilityListener = () => {
        if (this.workspace?.dirty || this.workspace?.dialogOpen || this.workspace?.busy) return;
        if (document.hidden) {
          this.loadController?.abort(); this.chart?.destroy(); this.chart = null;
          this.content.replaceChildren(); this.summary.textContent = '后台暂停；返回页面后重新验证权限。';
        } else this.load();
      };
      document.addEventListener('visibilitychange', this.visibilityListener);
      if (+this.c.refreshMinutes) this.refreshTimer = setInterval(() => { if (!document.hidden) this.load(); }, +this.c.refreshMinutes * 60000);
      await this.load();
    } catch (error) { if (generation === this.generation && !this.controller.signal.aborted) this.showError(error); }
    finally { if (generation === this.generation) { this.API.hideLoadingBar(); this.API.resize(); } }
  }
  async changeFilter(filterId) {
    if (this.workspace?.dirty || this.workspace?.busy || this.workspace?.dialogOpen) { this.workspace.message(new Error('请先完成当前任务编辑')); return; }
    // Clear immediately, before the preference network round trip.
    this.loadController?.abort(); this.chart?.destroy(); this.chart = null; this.content.replaceChildren(); this.summary.replaceChildren();
    this.filterLabel.textContent = '正在切换筛选器…';
    this.desiredPersonal = { selectedFilterId: filterId || null, scale: filterId ? this.scaleControl.value : null };
    return this.persistPersonal(this.desiredPersonal, !filterId);
  }
  async changeScale(scale) {
    this.chart?.scale(scale);
    if (this.c?.mode !== 'VIEWER_SELECTABLE') return;
    this.desiredPersonal = { ...(this.desiredPersonal ?? this.personal), scale };
    return this.persistPersonal(this.desiredPersonal, false);
  }
  async persistPersonal(value, reset) {
    const generation = this.generation, sequence = ++this.preferenceSequence;
    const client = this.client, gadgetId = this.gadgetId;
    this.loadController?.abort();
    // Serialize writes so a slow older request cannot overwrite a newer selection in AO.
    const pending = this.preferenceQueue.catch(() => {}).then(() => {
      client.signal.throwIfAborted();
      return reset ? client.resetPersonal(gadgetId) : client.savePersonal(gadgetId, value);
    });
    this.preferenceQueue = pending.catch(() => {});
    try {
      const personal = await pending;
      if (generation !== this.generation || sequence !== this.preferenceSequence) return;
      this.personal = personal ?? { selectedFilterId: null, scale: null };
      this.scaleControl.value = this.personal.scale ?? this.c.initialScale;
      await this.load();
    } catch (error) { if (generation === this.generation && sequence === this.preferenceSequence && !this.controller.signal.aborted) this.showError(error); }
  }
  async load() {
    if (!this.c || this.controller.signal.aborted) return;
    if (this.workspace?.dirty || this.workspace?.dialogOpen || this.workspace?.busy) { this.workspace.message(new Error('请先完成或取消当前任务编辑')); return; }
    this.workspace?.destroy(); this.workspace = null; this.scheduleHost.replaceChildren();
    this.loadController?.abort(); this.chart?.destroy(); this.chart = null;
    this.content.replaceChildren(); this.summary.textContent = '正在验证权限并加载…'; this.filterLabel.textContent = '加载中…'; this.error.hidden = true;
    this.loadController = new AbortController(); const loadController = this.loadController;
    const parentSignal = this.controller.signal;
    const cancel = () => loadController.abort(); parentSignal.addEventListener('abort', cancel, { once: true });
    const client = new JiraClient(contextPath(), loadController.signal);
    this.API.showLoadingBar();
    try {
      await this.preferenceQueue;
      if (loadController.signal.aborted) return;
      // Each refresh rechecks dashboard ACL and persisted mode, even after sharing changes.
      const [personal, fieldMetadata, me] = await Promise.all([client.personal(this.gadgetId), client.fields(), client.me()]);
      if (loadController.signal.aborted) return;
      const available = dateFields(fieldMetadata);
      for (const fieldId of [this.c.startDateFieldId, this.c.endDateFieldId]) if (!available.some(f => f.id === fieldId)) throw new Error('配置日期字段已删除或不可访问，请重新配置');
      this.timeZone = me.timeZone;
      if (!this.timeZone) throw new Error('Jira 未返回用户时区');
      new Intl.DateTimeFormat('en', { timeZone: this.timeZone }).format(new Date());
      this.personal = personal;
      const selected = this.c.mode === 'VIEWER_SELECTABLE' && personal.selectedFilterId ? personal.selectedFilterId : this.c.defaultFilterId;
      if (!selected) { this.summary.textContent = '请选择我的筛选器，或由编辑者设置默认 Filter。'; this.filterLabel.textContent = '尚未选择筛选器'; return; }
      const filter = await client.filter(selected);
      const fields = ['summary', 'assignee', 'status', 'timeoriginalestimate', 'timeestimate', 'updated', this.c.startDateFieldId, this.c.endDateFieldId];
      if (this.c.showHierarchy === 'true') fields.push('parent');
      if (this.c.showDependencies === 'true') fields.push('issuelinks');
      const result = await client.issues(selected, fields, +this.c.maxIssues);
      if (loadController.signal.aborted) return;
      const data = mapIssues(result.issues, this.c, client.contextPath, this.timeZone);
      this.currentResult = result;
      this.filterLabel.textContent = filter.name;
      this.summary.textContent = `${result.issues.length} 个任务 · 已排期 ${data.scheduled.length} · 未排期 ${data.unscheduled.length} · 异常 ${data.invalid.length} · 时区 ${this.timeZone}`;
      if (result.truncated) this.content.append(el('p', { className: 'fg-warning', role: 'status' }, `仅显示前 ${result.issues.length} / 总 ${result.total} 条，请缩小筛选器范围。`));
      if (!result.issues.length) this.content.append(el('p', {}, '当前筛选器无可见任务'));
      if (data.scheduled.length) {
        const chartNode = el('div', { className: 'fg-chart', style: `height:${this.c.heightPx}px`, 'aria-label': '只读任务甘特图' });
        const detail = el('div', { className: 'fg-task-details', 'aria-live': 'polite' }, '点击任务查看起止日期和详情，点击 Issue Key 打开 Jira。');
        this.content.append(chartNode, detail);
        this.chart = mountGantt(chartNode, data, this.c, this.scaleControl.value, detail, () => this.API.resize(), this.timeZone);
        this.resizeObserver?.disconnect(); this.resizeObserver = new ResizeObserver(() => this.chart?.resize()); this.resizeObserver.observe(chartNode);
      }
      for (const [label, tasks] of [['未排期', data.unscheduled], ['排期异常', data.invalid]]) if (tasks.length) {
        this.content.append(el('details', { className: 'fg-issue-list' }, el('summary', {}, `${label} (${tasks.length})`),
          el('ul', {}, ...tasks.map(t => el('li', {}, issueAnchor(t), ` ${t.text} · ${t.assignee} · ${t.status} · ${t.reason}`)))));
      }
      if (data.brokenParents) this.content.append(el('p', { className: 'fg-warning' }, '检测到无效父子环，已显示为顶层任务。'));
      this.workspace = new SchedulingWorkspace(this, client, selected, me, result, data);
      await this.workspace.init();
    } catch (error) { if (!loadController.signal.aborted) this.showError(error); }
    finally { parentSignal.removeEventListener('abort', cancel); if (this.loadController === loadController) { this.API.hideLoadingBar(); this.API.resize(); } }
  }
  drawChart(data, editing = {}) {
    if(this.chart&&this.chart.editableLayout===!!editing.calendar){
      this.chart.update(data,editing);this.chartNode.hidden=!data.scheduled.length;this.chartDetail.hidden=!data.scheduled.length;this.chartEmpty.hidden=!!data.scheduled.length;
    }else{
      this.chart?.destroy();this.chart=null;this.resizeObserver?.disconnect();this.content.replaceChildren();
      if(this.currentResult?.truncated)this.content.append(el('p',{className:'fg-warning'},`仅显示前 ${this.currentResult.issues.length} / 总 ${this.currentResult.total} 条，请缩小筛选器范围。`));
      this.chartEmpty=el('p',{hidden:!!data.scheduled.length},'当前范围没有可显示的已排期任务');this.content.append(this.chartEmpty);
      if(data.scheduled.length){
        this.chartNode=el('div',{className:'fg-chart',style:`height:${this.c.heightPx}px`,'aria-label':editing.canEdit?'可编辑任务甘特图':'只读任务甘特图'});
        this.chartDetail=el('div',{className:'fg-task-details','aria-live':'polite'},editing.canEdit?'拖动条中间调整开始日期，拖动两端调整预估；后续任务顺移并同步 Jira。双击可编辑或新增评论。':editing.reason||'点击任务查看详情；当前为只读。');
        this.content.append(this.chartNode,this.chartDetail);this.chart=mountGantt(this.chartNode,data,this.c,this.scaleControl.value,this.chartDetail,()=>this.API.resize(),editing.calendar?.timeZone||this.timeZone,editing);
        this.resizeObserver=new ResizeObserver(()=>this.chart?.resize());this.resizeObserver.observe(this.chartNode);
      }
      this.issueListHost=el('div',{className:'fg-issue-lists'});this.content.append(this.issueListHost);
    }
    const opened=new Map([...this.issueListHost.querySelectorAll('details')].map(n=>[n.dataset.kind,n.open]));this.issueListHost.replaceChildren();
    for(const [label,tasks] of [['未排期',data.unscheduled],['排期异常',data.invalid]])if(tasks.length){const list=el('details',{className:'fg-issue-list','data-kind':label},el('summary',{},`${label} (${tasks.length})`),el('ul',{},...tasks.map(t=>el('li',{},issueAnchor(t),` ${t.text} · ${t.assignee} · ${t.reason}`))));list.open=opened.get(label)||false;this.issueListHost.append(list);}
  }
  async renderEdit(context, preferences = {}) {
    if (!this.API.isEditable()) return this.render(context, preferences);
    const generation = this.setup(context);
    const values = Object.fromEntries(Object.entries({ ...DEFAULTS, ...preferences }).map(([key, value]) => [key, String(value ?? '')]));
    this.error = el('p', { className: 'fg-error', role: 'alert', hidden: true });
    this.root.append(el('h3', {}, '共享 Gadget 配置'), this.error);
    this.API.showLoadingBar();
    try {
      const fields = dateFields(await this.client.fields());
      if (generation !== this.generation) return;
      const controls = {};
      const choose = (name, options) => {
        const node = el('select', { name }, ...options.map(([v, l]) => el('option', { value: v }, l)));
        node.value = values[name]; controls[name] = node; return node;
      };
      const form = el('form', { className: 'fg-config' });
      const filterValue = el('input', { type: 'hidden', name: 'defaultFilterId', value: values.defaultFilterId }); controls.defaultFilterId = filterValue;
      const picker = new FilterPicker(this.client, this.controller.signal, filterId => { filterValue.value = filterId; }, { selectedId: values.defaultFilterId, allowDefault: true, defaultLabel: '不设置默认筛选器', label: '默认筛选器', onResize: () => this.API.resize() });
      form.append(labelled('模式', choose('mode', [['VIEWER_SELECTABLE', '每位查看者独立选择（推荐）'], ['SHARED_FIXED', '固定共享 Filter']])));
      form.append(labelled('默认筛选器', picker.node), filterValue);
      const writableFields=writableDateFields(fields),fieldOptions = [['', '请选择可写的日期字段'], ...writableFields.map(f => [f.id, `${f.name} (${f.id})`])];
      const invalidDates=['startDateFieldId','endDateFieldId'].filter(k=>!writableFields.some(f=>f.id===values[k]));
      if(invalidDates.length)form.append(el('p',{className:'fg-warning'},'当前日期配置不能写回 Jira：'+invalidDates.map(k=>`${k==='startDateFieldId'?'开始':'结束'}字段 ${fields.find(f=>f.id===values[k])?.name||values[k]||'未配置'}`).join('；')+'。请选择下方两个可写日期字段。'));
      form.append(labelled('开始日期字段', choose('startDateFieldId', fieldOptions)), labelled('结束日期字段', choose('endDateFieldId', fieldOptions)),
        el('p', { className: 'fg-help' }, '建议使用 Target start / Target end，或自定义开始日期与截止日期。字段须加入任务编辑界面；创建/更新日期不能修改。结束日包含当天。'),
        labelled('初始刻度', choose('initialScale', [['day', '日'], ['week', '周'], ['month', '月']])));
      for (const [name, label, min, max] of [['heightPx', '高度 (px)', 300, 900], ['maxIssues', '任务数上限', 1, 1000]]) {
        controls[name] = el('input', { type: 'number', name, min, max, required: true, value: values[name] });
        form.append(labelled(label, controls[name]));
      }
      for (const [name, label] of [['showHierarchy', '显示父子层级'], ['showDependencies', '显示 Blocks 依赖线']]) {
        controls[name] = el('input', { type: 'checkbox', name, checked: values[name] === 'true' }); form.append(labelled(label, controls[name]));
      }
      form.append(labelled('自动刷新', choose('refreshMinutes', [['0', '关闭'], ['5', '5 分钟'], ['10', '10 分钟'], ['30', '30 分钟']])));
      const save = el('button', { type: 'submit', className: 'fg-primary' }, '保存共享配置');
      form.append(el('div', { className: 'fg-actions' }, save, button('取消', () => this.API.closeEdit())));
      form.addEventListener('submit', async event => {
        event.preventDefault(); save.disabled = true;
        try {
          if (!this.API.isEditable()) throw new Error('没有 Dashboard 编辑权限');
          picker.validate();
          const c = config({ ...Object.fromEntries(Object.entries(controls).map(([name, node]) => [name, node.type === 'checkbox' ? String(node.checked) : node.value])), isConfigured: 'true' });
          if(c.startDateFieldId===c.endDateFieldId)throw new Error('开始和结束必须选择两个不同的日期字段');
          if(![c.startDateFieldId,c.endDateFieldId].every(id=>writableFields.some(f=>f.id===id)))throw new Error('请选择支持写回 Jira 的日期字段');
          if (c.defaultFilterId) await this.client.filter(c.defaultFilterId);
          // Jira owns both the permission check and save/render lifecycle. Do not pretend a void return is success.
          const pending = this.API.savePreferences(c);
          if (pending?.then) await pending;
        } catch (error) { if (!this.controller.signal.aborted) { this.error.textContent = errorMessage(error); this.error.hidden = false; this.API.resize(); } }
        finally { save.disabled = false; }
      });
      this.root.append(form);
    } catch (error) { if (!this.controller.signal.aborted) { this.error.textContent = errorMessage(error); this.error.hidden = false; } }
    finally { if (generation === this.generation) { this.API.hideLoadingBar(); this.API.resize(); } }
  }
}
