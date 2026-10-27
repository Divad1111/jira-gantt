export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null) continue;
    if (key === 'className') node.className = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === 'checked') node.checked = value;
    else node.setAttribute(key, String(value));
  }
  node.append(...children.filter(c => c != null).map(c => typeof c === 'string' ? document.createTextNode(c) : c));
  return node;
}
export function button(label, action, attrs = {}) { return el('button', { type: 'button', ...attrs, onClick: action }, label); }
export function labelled(label, control) { return el('label', { className: 'fg-field' }, el('span', {}, label), control); }
export function issueAnchor(task) {
  return task.href ? el('a', { href: task.href, target: '_blank', rel: 'noopener noreferrer' }, task.key) : el('span', {}, task.key);
}
