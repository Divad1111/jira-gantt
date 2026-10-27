import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JiraClient } from '../src/jira-client.js';

const response = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
test('serial Jira pagination honors server page size and cap with exact JQL', async () => {
  const calls = [];
  const client = new JiraClient('/jira', new AbortController().signal, async (url, options) => {
    calls.push({ url, options });
    if (url.includes('/filter/')) return response({ id: '123' });
    const req = JSON.parse(options.body);
    return response({ startAt: req.startAt, total: 1200, issues: Array.from({ length: Math.min(40, req.maxResults) }, (_, i) => ({ id: String(req.startAt + i) })) });
  });
  const result = await client.issues('123', ['summary', 'summary'], 101);
  assert.equal(result.issues.length, 101); assert.equal(result.total, 1200); assert.equal(result.truncated, true);
  assert.deepEqual(calls.slice(0, 3).map(call => JSON.parse(call.options.body).startAt), [0, 40, 80]);
  assert.deepEqual(JSON.parse(calls[0].options.body).fields, ['summary']);
  for (const { url, options } of calls) {
    assert.ok(url.startsWith('/jira/rest/')); assert.equal(options.credentials, 'same-origin'); assert.equal(options.cache, 'no-store');
    if (options.body) assert.equal(JSON.parse(options.body).jql, 'filter = 123');
  }
});
test('empty pages terminate and truthfully report incomplete result', async () => {
  let calls = 0;
  const client = new JiraClient('', null, async url => { calls++; return response(url.includes('/filter/') ? {} : { total: 100, issues: [] }); });
  assert.equal((await client.issues('12', ['summary'])).truncated, true); assert.equal(calls, 2);
});
test('permission revoked after paging fails instead of returning stale issues', async () => {
  const client = new JiraClient('', null, async url => url.includes('/filter/') ? response({}, 403) : response({ total: 1, issues: [{ id: '1' }] }));
  await assert.rejects(client.issues('12', ['summary']), { status: 403 });
});
test('bad IDs rejected before fetch; contexts cannot escape same origin', async () => {
  let called = false; const client = new JiraClient('', null, async () => { called = true; });
  await assert.rejects(client.issues('1 OR 1=1', [])); assert.equal(called, false);
  for (const path of ['//evil.test', 'https://evil.test', '/jira?x']) assert.throws(() => new JiraClient(path, null, () => {}));
});
test('abort cancels an in-flight query', async () => {
  const controller = new AbortController();
  const client = new JiraClient('', controller.signal, (_url, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
  }));
  const promise = client.issues('123', []); controller.abort(); await assert.rejects(promise, { name: 'AbortError' });
});
test('invalid pagination offsets cannot cause infinite repeated reads', async () => {
  const client = new JiraClient('', null, async () => response({ startAt: 0, total: 2, issues: [{ id: '1' }] }));
  await assert.rejects(client.issues('12', []), /分页响应无效/);
});
