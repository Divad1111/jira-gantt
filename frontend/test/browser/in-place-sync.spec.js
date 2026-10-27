import {test,expect} from '@playwright/test';
test.beforeEach(async({request})=>{await request.get('/__reset');await request.get('/__count?n=2');});
async function mount(page){await page.goto('/jira/');await page.evaluate(()=>window.mount());await expect(page.getByRole('button',{name:'自动排期',exact:true})).toBeEnabled();await page.getByRole('button',{name:'自动排期',exact:true}).click();const dialog=page.getByRole('dialog',{name:'自动排期',exact:true});await dialog.getByLabel('排期开始日期').fill('2026-10-30');await dialog.getByRole('button',{name:'自动排期',exact:true}).click();await dialog.getByRole('button',{name:'应用并同步到 Jira'}).click();await expect(dialog).toHaveCount(0);await expect(page.getByRole('button',{name:'自动排期',exact:true})).toBeEnabled();const reload=page.waitForResponse(r=>r.url().endsWith('/schedule/1/source'));await page.getByLabel('时间刻度').selectOption('day');await reload;await expect(page.getByRole('button',{name:'自动排期',exact:true})).toBeEnabled();}
async function capture(page){await page.evaluate(()=>{const app=window.items[0].instance;window.stable={chart:app.chart,workspace:app.workspace,container:document.querySelector('.gantt_container'),toolbar:document.querySelector('.fg-schedule-toolbar'),loads:0};const load=app.load.bind(app);app.load=(...args)=>{window.stable.loads++;return load(...args);};});}
async function unchanged(page){expect(await page.evaluate(()=>{const app=window.items[0].instance,s=window.stable;return {chart:s.chart===app.chart,workspace:s.workspace===app.workspace,container:s.container===document.querySelector('.gantt_container'),toolbar:s.toolbar===document.querySelector('.fg-schedule-toolbar'),loads:s.loads};})).toEqual({chart:true,workspace:true,container:true,toolbar:true,loads:0});}
async function move(page,id=1){const bar=page.locator(`.gantt_task_line[task_id="${id}"]`),box=await bar.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+85,box.y+box.height/2,{steps:12});await page.mouse.up();await expect(page.getByRole('button',{name:'自动排期',exact:true})).toBeEnabled();}
async function issue(page,id){return page.evaluate(async id=>(await fetch(`/jira/rest/api/2/issue/DEMO-${id}`)).json(),id);}

test('successive move and resize reuse the chart, preserve filters and collapsed rows, refresh tokens without searching all issues',async({page})=>{
  await mount(page);await page.getByRole('button',{name:'人员：全部',exact:true}).click();await page.getByRole('dialog',{name:'人员筛选',exact:true}).getByRole('checkbox',{name:'用户 A',exact:true}).uncheck();await page.getByRole('dialog',{name:'人员筛选',exact:true}).getByRole('checkbox',{name:'用户 A',exact:true}).check();await page.getByRole('button',{name:'人员：用户 A',exact:true}).click();
  await page.locator('.gantt_row[task_id="1"] .gantt_close').click({timeout:4000});await expect(page.locator('.gantt_row[task_id="2"]')).toHaveCount(0);await capture(page);
  const searches=[];page.on('request',request=>{if(/\/rest\/api\/2\/(search|field|myself)$/.test(request.url())||request.url().includes('/personal/'))searches.push(request.url());});
  const before=(await issue(page,1)).fields.customfield_10000;await move(page);await expect.poll(async()=>(await issue(page,1)).fields.customfield_10000).not.toBe(before);await unchanged(page);await expect(page.getByRole('button',{name:'人员：用户 A',exact:true})).toBeVisible();await expect(page.locator('.gantt_row[task_id="2"]')).toHaveCount(0);
  const bar=page.locator('.gantt_task_line[task_id="1"]');await bar.hover();const handle=bar.locator('.gantt_task_drag.task_right'),box=await handle.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+82,box.y+box.height/2,{steps:12});await page.mouse.up();await expect(page.getByRole('button',{name:'自动排期',exact:true})).toBeEnabled();await expect.poll(async()=>(await issue(page,1)).fields.timeoriginalestimate).not.toBe(28800);await unchanged(page);expect(searches).toEqual([]);await expect(page.locator('.fg-error:visible')).toHaveCount(0);
});

test('a partially failed cascade reconciles saved and failed tasks in the same chart',async({page,request})=>{
  await mount(page);await capture(page);const second=(await issue(page,2)).fields.customfield_10000;await request.get('/__fail?id=2');await move(page);await expect(page.getByRole('status').filter({hasText:'已同步到 Jira'})).toContainText('DEMO-2: Jira 拒绝更新');await unchanged(page);expect((await issue(page,2)).fields.customfield_10000).toBe(second);
  await page.locator('.gantt_task_line[task_id="2"]').dblclick({force:true});await expect(page.getByRole('dialog').getByLabel('开始日期',{exact:true})).toHaveValue(second);
});

test('a lost apply response reads actual Jira values without repeating the write or recreating the chart',async({page})=>{
  await mount(page);await capture(page);let applies=0;await page.route('**/schedule/1',async route=>{applies++;await route.fetch();await route.abort('failed');});const before=(await issue(page,1)).fields.customfield_10000;await move(page);await expect(page.getByRole('status').filter({hasText:'同步未完成'})).toBeVisible();await expect.poll(async()=>(await issue(page,1)).fields.customfield_10000).not.toBe(before);expect(applies).toBe(1);await unchanged(page);await page.unroute('**/schedule/1');await move(page);await unchanged(page);await expect(page.locator('.fg-error:visible')).toHaveCount(0);
});

test('unavailable readback keeps the current view and blocks additional edits until manual refresh',async({page})=>{
  await mount(page);await capture(page);await page.route('**/schedule/1/source',route=>route.fulfill({status:503,json:{message:'暂时无法读取任务'}}));
  const bar=page.locator('.gantt_task_line[task_id="1"]'),box=await bar.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+85,box.y+box.height/2,{steps:12});await page.mouse.up();await expect(page.getByRole('status').filter({hasText:'未能核实最新 Jira 数据'})).toBeVisible();await expect(page.getByRole('button',{name:'自动排期',exact:true})).toBeDisabled();await unchanged(page);
  await page.locator('.gantt_task_line[task_id="1"]').dblclick({force:true});await expect(page.getByRole('button',{name:'保存到 Jira',exact:true})).toHaveCount(0);
});

test('scroll position and chart position remain stable while a moved task and its successors save',async({page,request})=>{
  await request.get('/__count?n=20');await mount(page);await page.locator('.gantt_task_line[task_id="4"]').scrollIntoViewIfNeeded();
  await page.evaluate(()=>{document.querySelector('.gantt_hor_scroll').scrollLeft=40;document.querySelector('.gantt_ver_scroll').scrollTop=34;});
  await expect.poll(()=>page.locator('.gantt_hor_scroll').evaluate(n=>n.scrollLeft)).toBe(40);
  const before=await page.evaluate(()=>({x:document.querySelector('.gantt_hor_scroll').scrollLeft,y:document.querySelector('.gantt_ver_scroll').scrollTop,top:document.querySelector('.gantt_container').getBoundingClientRect().top}));await capture(page);await move(page,4);await unchanged(page);
  expect(await page.evaluate(()=>({x:document.querySelector('.gantt_hor_scroll').scrollLeft,y:document.querySelector('.gantt_ver_scroll').scrollTop,top:document.querySelector('.gantt_container').getBoundingClientRect().top}))).toEqual(before);
});
