import { test, expect } from '@playwright/test';

test.beforeEach(async ({ request }) => { await request.get('/__reset'); });
async function mount(page, count = 1, options = {}, path = '/jira/') {
  await page.goto(path); await page.evaluate(({ count, options }) => window.mount(count, options), { count, options });
  await expect(page.locator('.fg-filter-name').first()).toHaveText('团队共享计划');
}
test('three real Community Gantt instances render, isolate zoom, escape XSS and destroy cleanly', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await mount(page, 3);
  await expect(page.locator('.gantt_container')).toHaveCount(3);
  await expect(page.locator('.fg-summary').first()).toContainText('已排期 14');
  await expect(page.locator('.fg-issue-list').first()).toContainText('未排期 (1)');
  await expect(page.locator('.filter-gantt img')).toHaveCount(0); expect(await page.evaluate(() => window.xss)).toBeUndefined();
  expect(await page.evaluate(() => window.gantt.otherPlugin && window.Gantt.otherPlugin)).toBe(true);
  await page.locator('.filter-gantt').first().getByLabel('时间刻度').selectOption('month');
  await expect(page.locator('.filter-gantt').nth(1).getByLabel('时间刻度')).toHaveValue('week');
  await page.locator('.filter-gantt').first().getByRole('button', { name: '刷新', exact: true }).click();
  await expect(page.locator('.gantt_container')).toHaveCount(3);
  await page.evaluate(() => window.items[0].instance.destroy()); await expect(page.locator('.gantt_container')).toHaveCount(2);
  expect(errors).toEqual([]);
});
test('A and B personal views persist independently on the same shared gadget and across browser contexts', async ({ browser, baseURL }) => {
  const a = await browser.newContext(); const b = await browser.newContext();
  await b.addCookies([{ name: 'user', value: 'B', url: baseURL }]);
  const pa = await a.newPage(), pb = await b.newPage(); await mount(pa); await mount(pb);
  for (const [page, filter, name] of [[pa, '10001', 'A 私有筛选器'], [pb, '10002', 'B 私有筛选器']]) {
    await page.getByRole('combobox', { name: '筛选器', exact: true }).click();
    await expect(page.getByRole('listbox').getByRole('option')).toHaveCount(3);
    await page.getByRole('listbox').getByRole('option').filter({ hasText: name }).click();
    await expect(page.locator('.fg-filter-name')).toHaveText(name);
    expect(await page.evaluate(() => window.saved)).toEqual([]);
  }
  await pa.reload(); await pa.evaluate(() => window.mount()); await expect(pa.locator('.fg-filter-name')).toHaveText('A 私有筛选器');
  await expect(pb.locator('.fg-filter-name')).toHaveText('B 私有筛选器');
  const a2 = await browser.newContext(); const pa2 = await a2.newPage(); await pa2.goto('/jira/'); await pa2.evaluate(() => window.mount());
  await expect(pa2.locator('.fg-filter-name')).toHaveText('A 私有筛选器');
  await a.close(); await b.close(); await a2.close();
});
test('revoked permission clears all old chart data and names', async ({ page, request }) => {
  await mount(page); await expect(page.locator('.gantt_task_line').first()).toBeVisible();
  await request.get('/__revoke'); await page.getByRole('button', { name: '刷新', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('无权访问'); await expect(page.locator('.gantt_container')).toHaveCount(0);
  await expect(page.locator('.fg-content')).toBeEmpty(); await expect(page.locator('.fg-summary')).toBeEmpty();
});
test('viewer cannot configure shared preferences but can choose personal filter; fixed mode has no picker', async ({ page }) => {
  await page.goto('/'); await page.evaluate(() => { window.editable = false; window.mount(); });
  await expect(page.locator('.gantt_container')).toHaveCount(1);
  await expect(page.getByRole('button', { name: '配置', exact: true })).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: '筛选器', exact: true })).toBeVisible();
  await page.evaluate(() => window.items[0].instance.renderEdit(window.items[0].host, window.items[0].preferences));
  await expect(page.locator('.fg-config')).toHaveCount(0);
  await page.evaluate(() => { for(const item of window.items)item.instance.destroy();window.mount(1,{mode:'SHARED_FIXED'}); });
  await expect(page.locator('.gantt_container')).toHaveCount(1); await expect(page.locator('.fg-select-panel')).toHaveCount(0);
});
test('shared config saves only allowlisted instance fields and root context path works', async ({ page }) => {
  await mount(page, 1, {}, '/'); await page.evaluate(() => window.items[0].instance.renderEdit(window.items[0].host, window.items[0].preferences));
  await expect(page.locator('.fg-config')).toBeVisible();
  await page.locator('[name=heightPx]').fill('450'); await page.getByRole('button', { name: '保存共享配置' }).click();
  await expect(page.locator('.gantt_container')).toHaveCount(1);
  const saved = await page.evaluate(() => window.saved[0]); expect(saved.heightPx).toBe('450'); expect(saved.personalFilterId).toBeUndefined(); expect(saved.userKey).toBeUndefined();
});
test('readonly chart does not open a lightbox or issue write request', async ({ page }) => {
  const writes = [];
  page.on('request', r => { if (/\/rest\/api\/2\/issue\//.test(r.url()) && r.method() !== 'GET') writes.push(r.url()); });
  await mount(page); const bar = page.locator('.gantt_task_line').first(); await bar.dblclick({ force: true });
  await expect(page.locator('.gantt_cal_light')).toHaveCount(0); expect(writes).toEqual([]);
  const link = page.locator('.gantt_cell a').first(); await expect(link).toHaveAttribute('href', /\/jira\/browse\/DEMO-\d+/);
});
test('mock visual capture', async ({ page }) => {
  await mount(page); await page.screenshot({ path: 'test-results/gantt-mock.png', fullPage: true });
});

test('rapid personal changes persist the newest choice in order', async ({ page }) => {
  await mount(page);
  await page.route('**/personal/1', async route => {
    if (route.request().method() === 'PUT') await new Promise(resolve => setTimeout(resolve, 180));
    await route.continue();
  });
  await page.evaluate(async () => {
    const item = window.items[0].instance;
    await Promise.all([item.changeFilter('10001'), item.changeFilter('10003'), item.changeScale('month')]);
  });
  await expect(page.locator('.fg-filter-name')).toHaveText('团队共享计划');
  await page.reload(); await page.evaluate(() => window.mount());
  await expect(page.locator('.fg-filter-name')).toHaveText('团队共享计划');
  await expect(page.getByLabel('时间刻度')).toHaveValue('month');
});

test('1000 issue cap is enforced for 1200 results', async ({ page, request }) => {
  await request.get('/__count?n=1200'); await mount(page, 1, { maxIssues: '1000' });
  await expect(page.locator('.fg-summary')).toContainText('1000 个任务');
  await expect(page.locator('.fg-warning')).toContainText('前 1000 / 总 1200');
  await expect(page.locator('.gantt_container')).toHaveCount(1);
});

test('five gadgets with 500 issues remain isolated and render without errors', async ({ page, request }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await request.get('/__count?n=500'); const started = Date.now(); await mount(page, 5);
  await expect(page.locator('.gantt_container')).toHaveCount(5);
  for (const summary of await page.locator('.fg-summary').all()) await expect(summary).toContainText('500 个任务');
  console.log(`MOCK_PERF five gadgets × 500 issues: ${Date.now() - started} ms (local Chrome/mock REST)`);
  expect(errors).toEqual([]);
});

test('manual refresh recovers after failed personal save', async ({ page }) => {
  await mount(page);
  await page.route('**/personal/1', async route => {
    if (route.request().method() === 'PUT') return route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
    await route.continue();
  });
  await page.evaluate(() => window.items[0].instance.changeFilter('10001'));
  await expect(page.getByRole('alert')).toContainText('暂时不可用');
  await page.getByRole('button', { name: '刷新', exact: true }).click();
  await expect(page.locator('.gantt_container')).toHaveCount(1);
  await expect(page.locator('.fg-filter-name')).toHaveText('团队共享计划');
});

test('removed date field is detected on refresh and old tasks disappear', async ({ page }) => {
  await mount(page);
  await page.route('**/rest/api/2/field', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.getByRole('button', { name: '刷新', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('日期字段已删除或不可访问');
  await expect(page.locator('.gantt_container')).toHaveCount(0);
});

test('boolean configured flag loads saved filter and false still shows setup hint', async ({ page }) => {
  await mount(page, 1, { isConfigured: true, showHierarchy: true, showDependencies: false });
  await expect(page.locator('.gantt_container')).toHaveCount(1);
  await page.evaluate(() => window.items[0].instance.renderEdit(window.items[0].host, window.items[0].preferences));
  await expect(page.locator('[name=showHierarchy]')).toBeChecked();
  await expect(page.locator('[name=showDependencies]')).not.toBeChecked();
  await page.evaluate(() => window.items[0].instance.render(window.items[0].host, {isConfigured: false}));
  await expect(page.locator('.fg-summary')).toContainText('先配置');
  await expect(page.locator('.gantt_container')).toHaveCount(0);
});

test('single dropdown searches, deduplicates and applies a shared default after saving', async ({ page }) => {
  await mount(page);
  await page.evaluate(() => window.items[0].instance.renderEdit(window.items[0].host, window.items[0].preferences));
  const picker = page.getByRole('combobox', { name: '默认筛选器', exact: true });
  await picker.click();
  await expect(page.getByRole('listbox').getByRole('option')).toHaveCount(3);
  await picker.fill('私有');
  await expect(page.getByRole('listbox').getByRole('option')).toHaveCount(2);
  await page.getByRole('listbox').getByRole('option', { name: /A 私有筛选器/ }).click();
  await expect(picker).toHaveValue('A 私有筛选器');
  await expect(page.getByRole('listbox')).toBeHidden();
  await page.getByRole('button', { name: '保存共享配置' }).click();
  await expect(page.locator('.fg-filter-name')).toHaveText('A 私有筛选器');
  expect(await page.evaluate(() => window.saved[0].defaultFilterId)).toBe('10001');
  await expect(page.locator('.gantt_container')).toHaveCount(1);
  await page.evaluate(() => window.items[0].instance.render(window.items[0].host, window.items[0].preferences));
  await expect(page.locator('.fg-filter-name')).toHaveText('A 私有筛选器');
});

test('picker supports keyboard, empty search, reset and failed search', async ({ page }) => {
  await mount(page);
  const picker = page.getByRole('combobox', { name: '筛选器', exact: true });
  await picker.click(); await picker.fill('不存在');
  await expect(page.locator('.fg-picker-status')).toContainText('没有匹配');
  await picker.press('Escape');
  await picker.click(); await picker.fill('私有');
  await expect(page.getByRole('listbox').getByRole('option')).toHaveCount(2);
  await picker.press('ArrowDown'); await picker.press('ArrowDown'); await picker.press('Enter');
  await expect(page.locator('.fg-filter-name')).toHaveText('A 私有筛选器');
  await picker.click(); await page.getByRole('listbox').getByRole('option', { name: '使用共享默认筛选器' }).click();
  await expect(page.locator('.fg-filter-name')).toHaveText('团队共享计划');
  await page.route('**/filters?**', route => route.fulfill({status:503,contentType:'application/json',body:'{}'}));
  await picker.click(); await expect(page.locator('.fg-picker-status')).toContainText('暂时不可用');
  await picker.press('Escape');
  await page.screenshot({path:'test-results/picker-compact.png',fullPage:true});
});
