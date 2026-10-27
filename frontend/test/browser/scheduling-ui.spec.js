import {test,expect} from '@playwright/test';
test.beforeEach(async({request})=>{await request.get('/__reset');await request.get('/__count?n=4');});
async function mount(page,count=1){await page.goto('/jira/');await page.evaluate(count=>window.mount(count),count);await expect(page.getByRole('button',{name:'自动排期',exact:true}).first()).toBeEnabled();}
async function editor(page){await page.getByRole('button',{name:'自动排期',exact:true}).first().click();return page.getByRole('dialog',{name:'自动排期',exact:true});}

test('person groups sort automatically, manual order is retained within each group and cross-person dragging is ignored',async({page})=>{
  await page.route('**/rest/api/2/search',async route=>{const response=await route.fetch(),result=await response.json();for(const issue of result.issues)issue.fields.assignee={key:Number(issue.id)%2?'B':'A',displayName:Number(issue.id)%2?'用户 B':'用户 A'};await route.fulfill({json:result});});
  await mount(page);const dialog=await editor(page);
  await expect(dialog.locator('.fg-person-heading')).toHaveText(['用户 A','用户 B']);
  expect(await dialog.locator('.fg-schedule-task').evaluateAll(rows=>rows.map(r=>r.dataset.issueId))).toEqual(['2','4','1','3']);
  await dialog.locator('[data-issue-id="4"] .fg-task-title').dragTo(dialog.locator('[data-issue-id="2"] .fg-task-title'));
  expect(await dialog.locator('.fg-schedule-task').evaluateAll(rows=>rows.map(r=>r.dataset.issueId))).toEqual(['4','2','1','3']);
  await expect(dialog.getByRole('button',{name:'DEMO-2 下移',exact:true})).toBeDisabled();
  await dialog.locator('[data-issue-id="2"] .fg-task-title').dragTo(dialog.locator('[data-issue-id="1"] .fg-task-title'));
  expect(await dialog.locator('.fg-schedule-task').evaluateAll(rows=>rows.map(r=>r.dataset.issueId))).toEqual(['4','2','1','3']);
  await dialog.getByRole('combobox',{name:'DEMO-2 负责人',exact:true}).fill('B');await dialog.getByRole('option',{name:'用户 B',exact:true}).click();
  expect(await dialog.locator('.fg-schedule-task').evaluateAll(rows=>rows.map(r=>r.dataset.assignee))).toEqual(['A','B','B','B']);
  await dialog.getByLabel('排期开始日期').fill('2026-10-30');const pending=page.waitForRequest(r=>r.url().endsWith('/schedule/1/preview'));await dialog.getByRole('button',{name:'自动排期',exact:true}).click();expect((await pending).postDataJSON().tasks.map(t=>t.issueId)).toEqual(['4','2','1','3']);
});

test('one editable people dropdown searches 100 users with one character, pages options and supports keyboard selection',async({page})=>{
  const people=Array.from({length:100},(_,i)=>({key:`U${i}`,displayName:`员工 ${String(i).padStart(2,'0')}`}));
  await page.route('**/user/assignable/search?*',async route=>{const url=new URL(route.request().url()),query=url.searchParams.get('username').toLowerCase(),offset=Number(url.searchParams.get('startAt'));await route.fulfill({json:people.filter(p=>`${p.key} ${p.displayName}`.toLowerCase().includes(query)).slice(offset,offset+30)});});
  await mount(page);const dialog=await editor(page),input=dialog.getByRole('combobox',{name:'DEMO-1 负责人',exact:true});
  await expect(dialog.getByPlaceholder('搜索其他人员')).toHaveCount(0);await input.click();await expect(dialog.getByRole('option',{name:'员工 29',exact:true})).toBeVisible();
  await dialog.getByRole('button',{name:'加载更多人员',exact:true}).click();await expect(dialog.getByRole('option',{name:'员工 59',exact:true})).toBeAttached();
  await input.fill('9');await expect(dialog.getByRole('option',{name:'员工 99',exact:true})).toBeAttached();expect(await dialog.locator('[role=listbox]:visible [role=option]').count()).toBe(19);
  await input.fill('99');await expect(dialog.locator('[role=listbox]:visible [role=option]')).toHaveCount(1);await input.press('ArrowDown');await input.press('Enter');await expect(dialog.getByRole('combobox',{name:'DEMO-1 负责人',exact:true})).toHaveValue('员工 99');
  await page.screenshot({path:'test-results/assignee-search-1.3.0.png',fullPage:true});
});

test('unselected search text cannot silently schedule the previous assignee and Escape restores selection',async({page})=>{
  await mount(page);const dialog=await editor(page),input=dialog.getByRole('combobox',{name:'DEMO-1 负责人',exact:true});await input.fill('无人匹配');await expect(dialog.locator('.fg-assignee-panel:visible')).toContainText('没有匹配');
  await dialog.getByRole('button',{name:'自动排期',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('请从下拉选项中选择负责人');await expect(dialog.getByRole('button',{name:'应用并同步到 Jira',exact:true})).toBeDisabled();
  await input.focus();await input.press('Escape');await expect(input).toHaveValue('用户 A');await expect(dialog).toBeVisible();
});

test('calendar is a separate global setting shared by gadgets and scheduling uses the saved holidays',async({page})=>{
  await mount(page,2);await page.getByRole('button',{name:'全局工作日历',exact:true}).first().click();let calendar=page.getByRole('dialog',{name:'全局工作日历',exact:true});await calendar.getByLabel('非工作日期',{exact:true}).fill('2026-10-30');await calendar.getByLabel('补班日期',{exact:true}).fill('2026-10-31');await calendar.getByRole('button',{name:'保存全局工作日历'}).click();await expect(calendar).toHaveCount(0);
  await page.getByRole('button',{name:'全局工作日历',exact:true}).nth(1).click();calendar=page.getByRole('dialog',{name:'全局工作日历',exact:true});await expect(calendar.getByLabel('非工作日期',{exact:true})).toHaveValue('2026-10-30');await expect(calendar.getByLabel('补班日期',{exact:true})).toHaveValue('2026-10-31');await page.screenshot({path:'test-results/global-calendar-1.3.0.png',fullPage:true});await calendar.getByRole('button',{name:'关闭',exact:true}).click();
  const dialog=await editor(page);await expect(dialog.getByLabel('非工作日期',{exact:true})).toHaveCount(0);await expect(dialog.getByText('工作日设置',{exact:true})).toHaveCount(0);await dialog.getByLabel('排期开始日期').fill('2026-10-30');await dialog.getByRole('button',{name:'自动排期',exact:true}).click();await expect(dialog.locator('.fg-schedule-dates').first()).toContainText('2026-10-31');
});

test('nonadministrators can view the global calendar but cannot edit it through UI or a forged request',async({page,context,baseURL})=>{
  await context.addCookies([{name:'user',value:'B',url:baseURL}]);await page.goto('/jira/');await page.evaluate(()=>window.mount());await page.getByRole('button',{name:'全局工作日历',exact:true}).click();const calendar=page.getByRole('dialog',{name:'全局工作日历',exact:true});await expect(calendar).toContainText('只读');await expect(calendar.getByLabel('非工作日期',{exact:true})).toBeDisabled();await expect(calendar.getByRole('button',{name:'保存全局工作日历'})).toHaveCount(0);
  expect(await page.evaluate(async()=>(await fetch('/jira/rest/filter-gantt/1.0/calendar',{method:'PUT',headers:{'Content-Type':'application/json'},body:'{}'})).status)).toBe(403);
});

test('calendar changes invalidate an existing preview before any Jira update',async({page,request})=>{
  await mount(page);const dialog=await editor(page);await dialog.getByLabel('排期开始日期').fill('2026-10-30');await dialog.getByRole('button',{name:'自动排期',exact:true}).click();await expect(dialog.getByRole('button',{name:'应用并同步到 Jira'})).toBeEnabled();
  await request.put('/jira/rest/filter-gantt/1.0/calendar',{data:{revision:0,calendar:{weekdays:[1,2,3,4,5],holidays:['2026-10-30'],workDates:[]}}});
  await dialog.getByRole('button',{name:'应用并同步到 Jira'}).click();await expect(page.getByRole('status').filter({hasText:'同步未完成'})).toContainText('全局工作日历已更新');
  expect((await (await request.get('/jira/rest/api/2/issue/DEMO-1')).json()).fields.timeoriginalestimate).toBeUndefined();
});

test('desktop and narrow task forms leave room for focus outlines without intersecting adjacent controls',async({page})=>{
  await mount(page);const dialog=await editor(page);
  for(const width of [1440,800,480]){
    await page.setViewportSize({width,height:1000});await dialog.getByLabel('DEMO-1 预估时间',{exact:true}).focus();
    const errors=await dialog.locator('.fg-schedule-task').evaluateAll(rows=>rows.flatMap(row=>{const controls=[...row.querySelectorAll('input,button')].filter(n=>n.getClientRects().length).map(n=>n.getBoundingClientRect()),r=row.getBoundingClientRect();return controls.flatMap((a,i)=>[...(a.left<r.left||a.right>r.right?['overflow']:[]),...controls.slice(i+1).filter(b=>a.left-4<b.right+4&&a.right+4>b.left-4&&a.top-4<b.bottom+4&&a.bottom+4>b.top-4).map(()=> 'intersection')]);}));expect(errors).toEqual([]);
    await page.screenshot({path:`test-results/schedule-layout-${width}-1.3.0.png`,fullPage:true});
  }
});
