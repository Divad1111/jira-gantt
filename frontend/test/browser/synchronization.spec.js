import {test,expect} from '@playwright/test';
test.beforeEach(async({request})=>{await request.get('/__reset');await request.get('/__count?n=2');});
async function mount(page){await page.goto('/jira/');await page.evaluate(()=>window.mount());await expect(page.getByRole('button',{name:'自动排期',exact:true})).toBeEnabled();}
async function auto(page){
  await page.getByRole('button',{name:'自动排期',exact:true}).click();const dialog=page.getByRole('dialog',{name:'自动排期',exact:true});
  await dialog.getByLabel('排期开始日期').fill('2026-10-30');await dialog.getByLabel('DEMO-1 预估时间',{exact:true}).fill('6h');await dialog.getByLabel('DEMO-2 预估时间',{exact:true}).fill('4h');
  await dialog.getByRole('button',{name:'自动排期',exact:true}).click();await expect(dialog.locator('.fg-schedule-dates').nth(1)).toContainText('2026-11-02');
  await dialog.getByRole('button',{name:'应用并同步到 Jira'}).click();await expect(dialog).toHaveCount(0);await expect(page.getByRole('button',{name:'自动排期',exact:true})).toBeEnabled();await expect(page.locator('.fg-schedule-access')).toContainText('同步到 Jira');
}
async function issue(page,id){return page.evaluate(async id=>(await fetch(`/jira/rest/api/2/issue/DEMO-${id}`)).json(),id);}

test('search timestamps lose milliseconds while actual issue snapshots preserve local assignee and estimate edits',async({page})=>{
  await mount(page);await page.getByRole('button',{name:'自动排期',exact:true}).click();const dialog=page.getByRole('dialog',{name:'自动排期',exact:true});
  await dialog.getByLabel('排期开始日期').fill('2026-10-30');await dialog.getByLabel('DEMO-1 预估时间',{exact:true}).fill('5h');await dialog.getByLabel('DEMO-1 负责人',{exact:true}).fill('B');
  await dialog.getByRole('option',{name:'用户 B',exact:true}).click();
  const pending=page.waitForRequest(r=>r.url().endsWith('/schedule/1/preview'));await dialog.getByRole('button',{name:'自动排期',exact:true}).click();const sent=(await pending).postDataJSON();expect(sent.tasks.find(t=>t.issueId==='1').updatedMillis).toBe(String(Date.parse('2026-10-27T00:00:00.135Z')));expect(sent.tasks.find(t=>t.issueId==='1').assigneeKey).toBe('B');expect(sent.tasks.find(t=>t.issueId==='1').estimate).toBe('5h');
  await dialog.getByRole('button',{name:'应用并同步到 Jira'}).click();await expect(dialog).toHaveCount(0);expect((await issue(page,1)).fields.assignee.key).toBe('B');expect((await issue(page,1)).fields.timeoriginalestimate).toBe(18000);
});

test('no plan management, reorder tasks, preview then write Jira dates and estimates, reload reads Jira',async({page})=>{
  await mount(page);await page.getByRole('button',{name:'全局工作日历',exact:true}).click();const calendar=page.getByRole('dialog',{name:'全局工作日历',exact:true});await calendar.getByLabel('非工作日期',{exact:true}).fill('2026-11-02');await calendar.getByRole('button',{name:'保存全局工作日历',exact:true}).click();await expect(calendar).toHaveCount(0);for(const text of ['新建我的计划','复制为我的计划','保存计划'])await expect(page.getByRole('button',{name:text})).toHaveCount(0);
  await expect(page.getByLabel('排期计划')).toHaveCount(0);await expect(page.getByRole('button',{name:'配置',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'自动排期',exact:true}).click();const dialog=page.getByRole('dialog',{name:'自动排期',exact:true});
  await dialog.getByLabel('排期开始日期').fill('2026-10-30');await dialog.getByLabel('DEMO-1 预估时间',{exact:true}).fill('6h');await dialog.getByLabel('DEMO-2 预估时间',{exact:true}).fill('4h');
  await dialog.getByRole('button',{name:'DEMO-2 上移'}).click();await expect(dialog.locator('.fg-task-title').first()).toContainText('DEMO-2');
  await dialog.getByRole('button',{name:'自动排期',exact:true}).click();await expect(dialog.locator('.fg-schedule-dates').nth(1)).toContainText('2026-11-03');
  expect((await issue(page,1)).fields.customfield_10000).toBeUndefined();
  await page.screenshot({path:'test-results/schedule-sync-editor.png',fullPage:true});
  await dialog.getByRole('button',{name:'应用并同步到 Jira'}).click();await expect(dialog).toHaveCount(0);await expect(page.getByRole('status').filter({hasText:'已同步到 Jira'})).toContainText('2 个任务');
  const first=await issue(page,1);expect(first.fields.customfield_10000).toBe('2026-11-03');expect(first.fields.timeoriginalestimate).toBe(21600);
  await page.reload();await page.evaluate(()=>window.mount());await expect(page.locator('.gantt_task_line')).toHaveCount(2);await expect(page.locator('.fg-schedule-access')).toContainText('同步到 Jira');
  await page.screenshot({path:'test-results/schedule-sync-chart.png',fullPage:true});
});

test('double click updates original estimate, start date and Jira comment, reads them again after reload',async({page})=>{
  await mount(page);await auto(page);await page.locator('.gantt_task_line[task_id="1"]').dblclick({force:true});
  const dialog=page.getByRole('dialog',{name:'DEMO-1 · Jira 任务'});await dialog.getByLabel('原始预估时间').fill('1d');await dialog.getByLabel('开始日期',{exact:true}).fill('2026-11-04');await dialog.getByLabel('新增 Jira 评论').fill('排期说明 <b>原样文本</b>');
  await dialog.getByRole('button',{name:'保存到 Jira'}).click();await expect(dialog).toHaveCount(0);await expect(page.getByRole('status').filter({hasText:'已同步到 Jira'})).toBeVisible();
  const first=await issue(page,1),second=await issue(page,2);expect(first.fields.customfield_10000).toBe('2026-11-04');expect(first.fields.timeoriginalestimate).toBe(28800);expect(second.fields.customfield_10000).toBe('2026-11-05');
  await page.reload();await page.evaluate(()=>window.mount());await expect(page.locator('.fg-schedule-access')).toContainText('同步到 Jira');
  await page.locator('.gantt_task_line[task_id="1"]').dblclick({force:true});await expect(page.getByRole('dialog')).toContainText('排期说明 <b>原样文本</b>');await expect(page.getByLabel('新增 Jira 评论')).toHaveValue('');
});

test('moving and right resizing bars write Jira and cascade; resource filtering does not update issues',async({page})=>{
  await mount(page);await auto(page);
  // Hold the source response to deterministically exercise the scale-change loading window.
  // The status text also matches "正在同步到 Jira", so it is not a readiness signal.
  let releaseSource;const sourceGate=new Promise(resolve=>{releaseSource=resolve;});
  const holdSource=async route=>{await sourceGate;await route.continue();};
  await page.route('**/schedule/1/source',holdSource);
  const reload=page.waitForResponse(r=>r.url().endsWith('/schedule/1/source'));
  const sourceRequest=page.waitForRequest(r=>r.url().endsWith('/schedule/1/source'));
  try{
    await page.getByLabel('时间刻度').selectOption('day');await sourceRequest;
    await expect(page.getByRole('button',{name:'自动排期',exact:true})).toBeDisabled();
  }finally{releaseSource();}
  await reload;await expect(page.getByRole('button',{name:'自动排期',exact:true})).toBeEnabled();
  await page.unroute('**/schedule/1/source',holdSource);
  let bar=page.locator('.gantt_task_line[task_id="1"]');await expect(bar).toBeVisible();let box=await bar.boundingBox();expect(box).not.toBeNull();
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+120,box.y+box.height/2,{steps:12});await page.mouse.up();
  await expect.poll(async()=>(await issue(page,1)).fields.customfield_10000).not.toBe('2026-10-30');await expect(page.getByRole('button',{name:'自动排期',exact:true})).toBeEnabled();
  bar=page.locator('.gantt_task_line[task_id="1"]');await bar.hover();const handle=bar.locator('.gantt_task_drag.task_right');await expect(handle).toBeVisible();box=await handle.boundingBox();expect(box).not.toBeNull();
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width+82,box.y+box.height/2,{steps:12});await page.mouse.up();
  await expect.poll(async()=>(await issue(page,1)).fields.timeoriginalestimate).not.toBe(21600);await expect(page.getByRole('button',{name:'自动排期',exact:true})).toBeEnabled();
  await page.getByText('人员：全部',{exact:true}).click();await page.locator('.fg-people').getByRole('button',{name:'清空',exact:true}).click();await expect(page.locator('.gantt_task_line')).toHaveCount(0);
  await page.locator('.fg-people').getByRole('button',{name:'全选',exact:true}).click();await expect(page.locator('.gantt_task_line')).toHaveCount(2);
});

test('other viewer is readonly and forged sync requests are denied',async({page,context,baseURL})=>{
  await context.addCookies([{name:'user',value:'B',url:baseURL}]);await page.goto('/jira/');await page.evaluate(()=>window.mount());await expect(page.locator('.fg-schedule-access')).toContainText('只读');await expect(page.getByRole('button',{name:'自动排期',exact:true})).toBeDisabled();
  const status=await page.evaluate(async()=>(await fetch('/jira/rest/filter-gantt/1.0/schedule/1',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status);expect(status).toBe(403);
  await page.locator('.gantt_task_line[task_id="1"]').dblclick({force:true});await expect(page.getByRole('button',{name:'保存到 Jira'})).toHaveCount(0);
});

test('searching an assignable user and selecting them writes the Jira assignee',async({page})=>{
  await mount(page);await auto(page);await page.locator('.gantt_task_line[task_id="1"]').dblclick({force:true});const dialog=page.getByRole('dialog');
  await dialog.getByLabel('DEMO-1 负责人',{exact:true}).fill('B');await dialog.getByRole('option',{name:'用户 B',exact:true}).click();
  await dialog.getByRole('button',{name:'保存到 Jira'}).click();await expect(dialog).toHaveCount(0);
  expect((await issue(page,1)).fields.assignee.key).toBe('B');await page.reload();await page.evaluate(()=>window.mount());await expect(page.locator('.gantt_row[task_id="1"]')).toContainText('用户 B');
});

test('partial Jira failure lists successful and failed tasks then refreshes real values',async({page,request})=>{
  await mount(page);await request.get('/__fail?id=2');await auto(page);
  await expect(page.getByRole('status').filter({hasText:'已同步到 Jira'})).toContainText('DEMO-2: Jira 拒绝更新');
  expect((await issue(page,1)).fields.timeoriginalestimate).toBe(21600);expect((await issue(page,2)).fields.timeoriginalestimate).toBeUndefined();
});

test('concurrent update rejects preview without any Jira write',async({page})=>{
  await mount(page);await page.locator('.gantt_task_line[task_id="1"]').dblclick({force:true});const dialog=page.getByRole('dialog');await dialog.getByLabel('原始预估时间').fill('2d');
  await page.route('**/schedule/1/preview',r=>r.fulfill({status:409,contentType:'application/json',body:JSON.stringify({message:'任务已被其他人修改，请刷新'})}));
  await dialog.getByRole('button',{name:'保存到 Jira'}).click();await expect(dialog.getByRole('alert')).toContainText('其他人修改');expect((await issue(page,1)).fields.timeoriginalestimate).toBeUndefined();
});

test('people and status dropdowns search and combine without resizing the toolbar or updating Jira',async({page,request})=>{
  await request.get('/__count?n=3');await page.route('**/rest/api/2/search',async route=>{const response=await route.fetch();const result=await response.json();result.issues[1].fields.assignee={key:'B',displayName:'用户 B'};await route.fulfill({json:result});});
  await mount(page);await expect(page.locator('.gantt_task_line')).toHaveCount(3);const before=await page.locator('.fg-schedule-toolbar').boundingBox();
  await page.getByRole('button',{name:'人员：全部',exact:true}).click();const people=page.getByRole('dialog',{name:'人员筛选',exact:true});await people.getByLabel('搜索人员').fill('B');await expect(people.getByRole('checkbox')).toHaveCount(1);
  const after=await page.locator('.fg-schedule-toolbar').boundingBox();expect(after.height).toBe(before.height);await page.screenshot({path:'test-results/search-filters-1.2.1.png',fullPage:true});
  await people.getByRole('button',{name:'清空',exact:true}).click();await people.getByRole('checkbox',{name:'用户 B',exact:true}).check();await expect(page.locator('.gantt_task_line')).toHaveCount(1);await expect(page.locator('.gantt_task_line[task_id="2"]')).toBeVisible();
  await people.getByLabel('搜索人员').fill('不存在');await expect(people).toContainText('没有匹配结果');await people.getByLabel('搜索人员').press('Escape');await expect(people).toBeHidden();
  await page.getByRole('button',{name:'状态：全部',exact:true}).click();const statuses=page.getByRole('dialog',{name:'状态筛选',exact:true});await statuses.getByLabel('搜索状态').fill('完成');await statuses.getByRole('button',{name:'清空',exact:true}).click();await statuses.getByRole('checkbox',{name:'完成',exact:true}).check();await expect(page.locator('.gantt_task_line')).toHaveCount(0);
  await page.locator('.fg-people .fg-multi-trigger').click();await people.getByRole('button',{name:'全选',exact:true}).click();await expect(page.locator('.gantt_task_line')).toHaveCount(1);await expect(page.locator('.gantt_task_line[task_id="3"]')).toBeVisible();expect((await issue(page,1)).fields.timeoriginalestimate).toBeUndefined();
});

test('invalid legacy date mapping explains disabled controls and links to a valid repair',async({page})=>{
  await page.route('**/schedule/1?filterId=*',async route=>{const response=await route.fetch();await route.fulfill({json:{...await response.json(),canEdit:false,configurationRequired:true,reason:'开始字段：创建日期 (created)，由 Jira 自动维护，不能修改。请选择 Target start。'}});});
  await page.goto('/jira/');await page.evaluate(()=>window.mount(1,{startDateFieldId:'created'}));await expect(page.locator('.fg-schedule-access')).toContainText('created');await expect(page.getByRole('button',{name:'自动排期',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'选择排期日期字段',exact:true}).click();await expect(page.locator('.fg-warning')).toContainText('创建日期');await page.getByRole('combobox',{name:'开始日期字段',exact:true}).selectOption('customfield_10109');await page.getByRole('combobox',{name:'结束日期字段',exact:true}).selectOption('customfield_10110');
  await page.unroute('**/schedule/1?filterId=*');await page.getByRole('button',{name:'保存共享配置',exact:true}).click();await expect(page.getByRole('button',{name:'自动排期',exact:true})).toBeEnabled();expect(await page.evaluate(()=>window.saved[0].startDateFieldId)).toBe('customfield_10109');
});
