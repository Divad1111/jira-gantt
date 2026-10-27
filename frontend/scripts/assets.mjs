import fs from 'node:fs/promises';
import postcss from 'postcss';
import prefix from 'postcss-prefix-selector';

const pkg = JSON.parse(await fs.readFile('node_modules/dhtmlx-gantt/package.json', 'utf8'));
if (pkg.version !== '10.0.3' || pkg.license !== 'MIT') throw new Error('Only pinned MIT Community Gantt is allowed');
const css = await fs.readFile('node_modules/dhtmlx-gantt/codebase/dhtmlxgantt.css', 'utf8');
const scoped = await postcss([prefix({ prefix: '.filter-gantt', transform: (prefix, selector) => {
  // The library puts variables on :root; put them on the instance instead.
  return /^(html|body|:root)$/.test(selector.trim()) ? prefix : `${prefix} ${selector}`;
} })]).process(css, { from: undefined });
await fs.writeFile('dist/filter-gantt.css', scoped.css + '\n' + await fs.readFile('src/styles.css', 'utf8'));
await fs.mkdir('dist/licenses', { recursive: true });
await fs.copyFile('node_modules/dhtmlx-gantt/LICENSE.md', 'dist/licenses/dhtmlx-gantt-MIT.txt');
