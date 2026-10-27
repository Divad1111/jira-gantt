import { test } from 'node:test';
import assert from 'node:assert/strict';
import { config, DEFAULTS, id, calendarDate, exclusiveEnd, mapIssues, escapeHtml, dateFields } from '../src/model.js';

const c = config({ ...DEFAULTS, startDateFieldId: 'customfield_10000' });
const issue = (n = '1', fields = {}) => ({ id: n, key: `TEST-${n}`, fields: {
  summary: '中文 <img src=x onerror=alert(1)>', customfield_10000: '2026-10-26', duedate: '2026-10-26',
  status: { name: '已完成', statusCategory: { key: 'done' } }, ...fields
} });
test('inclusive same-day dates occupy one local calendar day', () => {
  const task = mapIssues([issue()], c, '/jira', 'Asia/Shanghai').scheduled[0];
  assert.equal(task.start_date.getDate(), 26); assert.equal(task.end_date.getDate(), 27);
  assert.equal(task.endDate, '2026-10-26'); assert.equal(task.progress, null); assert.equal(task.statusCategory, 'done');
});
test('calendar next day preserves midnight across DST in America/New_York', () => {
  const previous = process.env.TZ; process.env.TZ = 'America/New_York';
  try {
    const end = exclusiveEnd('2026-03-08'); assert.equal(end.getHours(), 0); assert.equal(end.getDate(), 9);
    assert.equal((end - new Date(2026, 2, 8)) / 3600000, 23);
    const fall = exclusiveEnd('2026-11-01'); assert.equal(fall.getDate(), 2); assert.equal(fall.getHours(), 0);
    assert.equal((fall - new Date(2026, 10, 1)) / 3600000, 25);
  } finally { if (previous == null) delete process.env.TZ; else process.env.TZ = previous; }
});
test('DateTime converted using Jira user timezone, date-only values do not drift', () => {
  assert.equal(calendarDate('2026-10-26T00:30:00.000+0800', 'America/New_York'), '2026-10-25');
  assert.equal(calendarDate('2026-10-26', 'America/New_York'), '2026-10-26');
  assert.throws(() => calendarDate('2026-10-26T00:30:00', 'Asia/Shanghai'));
  assert.throws(() => calendarDate('2026-02-30', 'Asia/Shanghai'));
  assert.throws(() => calendarDate('2026-02-30T12:00:00Z', 'Asia/Shanghai'));
  assert.throws(() => calendarDate('2026-10-26T00:30:00Z'));
});
test('missing and invalid schedules are classified without invented dates', () => {
  const result = mapIssues([issue('1', { duedate: null }), issue('2', { duedate: '2026-10-25' }), issue('3', { duedate: 'broken' })], c, '', 'UTC');
  assert.equal(result.scheduled.length, 0); assert.equal(result.unscheduled.length, 1); assert.equal(result.invalid.length, 2);
});
test('parents and dependencies only reference scheduled visible results, cycles are broken', () => {
  const cc = { ...c, showDependencies: 'true' };
  const result = mapIssues([issue('1', { parent: { id: '2' }, issuelinks: [{ type: { name: 'Blocks' }, outwardIssue: { id: '2' } }, { type: { name: 'Blocks' }, outwardIssue: { id: '99' } }] }),
    issue('2', { parent: { id: '1' }, issuelinks: [{ type: { name: 'Blocks' }, inwardIssue: { id: '1' } }] }), issue('3', { parent: { id: '99' } })], cc, '', 'UTC');
  assert.equal(result.links.length, 1); assert.equal(result.links[0].source, '1'); assert.equal(result.links[0].target, '2');
  assert.equal(result.scheduled[2].parent, 0); assert.ok(result.brokenParents > 0);
});
test('estimate progress is clamped and missing estimates remain unknown', () => {
  const result = mapIssues([issue('1', { timeoriginalestimate: 100, timeestimate: 20 }), issue('2', { timeoriginalestimate: 100, timeestimate: 200 }), issue('3', { timeoriginalestimate: 100 })], c, '', 'UTC');
  assert.deepEqual(result.scheduled.map(t => t.progress), [0.8, 0, null]);
});
test('configuration rejects invalid caps, fields and enums; strips private keys', () => {
  for (const bad of [{ maxIssues: '1001' }, { maxIssues: '500oops' }, { heightPx: '299' }, { mode: 'bad' }, { initialScale: 'year' }, { defaultFilterId: '1 OR 1=1' }, { endDateFieldId: 'description' }, { schemaVersion: '2' }]) assert.throws(() => config({ ...c, ...bad }));
  assert.equal(config({ ...c, userKey: 'secret', personalFilterId: '123' }).userKey, undefined);
  assert.throws(() => config({ ...c, mode: 'SHARED_FIXED' }));
});
test('IDs and links are strictly constrained; summaries safely escaped', () => {
  assert.throws(() => id('1 OR 1=1')); assert.throws(() => id('9223372036854775808'));
  assert.equal(id('10000'), '10000'); assert.equal(id('', true), '');
  assert.equal(mapIssues([issue()], c, '/jira', 'UTC').scheduled[0].href, '/jira/browse/TEST-1');
  assert.equal(mapIssues([{ ...issue(), key: 'javascript:bad' }], c, '', 'UTC').scheduled[0].href, null);
  assert.equal(escapeHtml('<img "x" & \'y\'>'), '&lt;img &quot;x&quot; &amp; &#39;y&#39;&gt;');
});
test('only visible date metadata is selectable', () => {
  assert.deepEqual(dateFields([{ id: 'duedate', schema: { type: 'date' } }, { id: 'customfield_1', schema: { custom: 'com.atlassian.jira.plugin.system.customfieldtypes:datetime' } }, { id: 'description', schema: { type: 'string' } }]).map(f => f.id), ['duedate', 'customfield_1']);
});
