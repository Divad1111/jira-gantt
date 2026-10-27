import { el, button } from './dom.js';
import { errorMessage } from './jira-client.js';
let nextId = 0;
export class FilterPicker {
  constructor(client, signal, onSelect, { selectedId = '', allowDefault = false, defaultLabel = '使用共享默认筛选器', label = '筛选器', onResize = () => {} } = {}) {
    Object.assign(this, { client, signal, onSelect, selectedId, allowDefault, defaultLabel, onResize });
    this.selectedLabel = selectedId ? `筛选器 #${selectedId}` : defaultLabel;
    this.pages = [0, 0, 0]; this.more = [true, true, true]; this.filters = new Map();
    const listId = `fg-options-${++nextId}`;
    this.query = el('input', { role: 'combobox', 'aria-label': label, 'aria-autocomplete': 'list', 'aria-expanded': 'false', 'aria-controls': listId,
      autocomplete: 'off', maxlength: 100, placeholder: '选择或输入名称搜索…', value: this.selectedLabel });
    this.results = el('div', { role: 'listbox', id: listId, 'aria-label': '可访问的筛选器' });
    this.status = el('span', { role: 'status', className: 'fg-picker-status' });
    this.next = button('加载更多', () => this.search(true));
    this.panel = el('div', { className: 'fg-picker-panel', hidden: true }, this.results, this.status, this.next);
    this.node = el('div', { className: 'fg-picker' }, this.query, this.panel);
    this.query.addEventListener('focus', () => { this.open(); this.query.select(); this.search(); });
    this.query.addEventListener('click', () => { if (this.panel.hidden) { this.open(); this.search(); } });
    this.query.addEventListener('input', () => {
      this.open(); clearTimeout(this.timer); this.controller?.abort(); this.results.replaceChildren(); this.next.hidden = true;
      this.status.textContent = '正在搜索…'; this.timer = setTimeout(() => this.search(), 250);
    });
    this.query.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); this.close(); }
      if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
        event.preventDefault();
        if (this.panel.hidden) { this.open(); this.search(); return; }
        const options = [...this.results.children]; if (!options.length) return;
        const current = options.findIndex(n => n.id === this.query.getAttribute('aria-activedescendant'));
        const index = (current + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
        for (const option of options) option.classList.remove('fg-active');
        options[index].classList.add('fg-active'); options[index].scrollIntoView({ block: 'nearest' });
        this.query.setAttribute('aria-activedescendant', options[index].id);
      }
      if (event.key === 'Enter' && !this.panel.hidden) {
        event.preventDefault();
        [...this.results.children].find(n => n.id === this.query.getAttribute('aria-activedescendant'))?.click();
      }
    });
    this.node.addEventListener('focusout', event => { if (!this.node.contains(event.relatedTarget)) this.close(); });
    signal.addEventListener('abort', () => { clearTimeout(this.timer); this.controller?.abort(); }, { once: true });
    if (selectedId) client.filter(selectedId).then(filter => {
      if (!signal.aborted && this.selectedId === selectedId) {
        const unchanged = this.query.value === this.selectedLabel;
        this.selectedLabel = filter.name; if (unchanged) this.query.value = filter.name;
      }
    }).catch(() => {});
  }
  open() { this.panel.hidden = false; this.query.setAttribute('aria-expanded', 'true'); this.onResize(); }
  close() {
    clearTimeout(this.timer); this.controller?.abort(); this.panel.hidden = true;
    this.query.setAttribute('aria-expanded', 'false'); this.query.removeAttribute('aria-activedescendant');
    this.query.value = this.selectedLabel; this.onResize();
  }
  validate() { if (this.query.value !== this.selectedLabel) throw new Error('请从下拉列表选择筛选器后再保存'); }
  choose(filterId, name) { this.selectedId = filterId; this.selectedLabel = name; this.close(); this.onSelect(filterId, name); }
  option(filterId, name, detail = '') {
    const option = button(name, () => this.choose(filterId, name), { role: 'option', id: `${this.results.id}-${filterId || 'default'}`, 'aria-selected': String(String(filterId) === String(this.selectedId)) });
    if (detail) option.append(el('small', {}, detail)); return option;
  }
  async search(append = false) {
    this.controller?.abort(); this.controller = new AbortController();
    const controller = this.controller, cancel = () => controller.abort(); this.signal.addEventListener('abort', cancel, { once: true });
    if (!append) { this.pages = [0, 0, 0]; this.more = [true, true, true]; this.filters.clear(); this.results.replaceChildren(); this.next.hidden = true; }
    const query = this.query.value === this.selectedLabel ? '' : this.query.value.trim();
    this.status.textContent = '加载中…'; this.next.disabled = true;
    try {
      if (this.signal.aborted) return;
      const responses = await Promise.all(['favourite', 'mine', 'shared'].map((scope, i) => this.more[i] ? this.client.filters(query, scope, this.pages[i], controller.signal) : null));
      if (controller.signal.aborted || this.signal.aborted) return;
      responses.forEach((result, i) => { if (result) { this.pages[i]++; this.more[i] = result.hasMore; for (const filter of result.values) this.filters.set(String(filter.id), filter); } });
      this.query.removeAttribute('aria-activedescendant'); this.results.replaceChildren();
      if (this.allowDefault) this.results.append(this.option('', this.defaultLabel));
      for (const filter of this.filters.values()) this.results.append(this.option(filter.id, filter.name, `${filter.owner ?? ''} · #${filter.id}`));
      this.status.textContent = this.filters.size ? '' : '没有匹配的筛选器'; this.next.hidden = !this.more.some(Boolean);
    } catch (error) { if (!controller.signal.aborted && !this.signal.aborted) { this.status.textContent = errorMessage(error); this.next.hidden = true; } }
    finally { this.signal.removeEventListener('abort', cancel); this.next.disabled = false; this.onResize(); }
  }
}
