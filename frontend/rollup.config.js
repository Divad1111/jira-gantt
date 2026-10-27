import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';

export default {
  input: 'src/dashboard-item.js',
  external: ['jquery', 'wrm/context-path'],
  plugins: [resolve({ browser: true }), {
    name: 'isolate-dhtmlx-globals',
    transform(code, moduleId) {
      if (!moduleId.replaceAll('\\', '/').endsWith('/dhtmlx-gantt/codebase/dhtmlxgantt.es.js')) return null;
      const globals = /\nF\.gantt = hl;\r?\nF\.Gantt = Li;\r?\n/;
      if (!globals.test(code)) throw new Error('Recheck the pinned Community ESM global exports');
      return { code: code.replace(globals, '\n'), map: null };
    }
  }, commonjs()],
  output: {
    file: 'dist/dashboard-item.js',
    format: 'amd',
    amd: { id: 'filter-gantt/dashboard-item' },
    sourcemap: false,
    exports: 'default'
  }
};
