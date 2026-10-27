import {el,button} from './dom.js';

let nextId=0;
/** One searchable, paginated Jira assignable-user combobox per task. */
export class AssigneePicker {
  constructor(client,task,people,onSelect){
    Object.assign(this,{client,task,onSelect});this.people=new Map(people);this.selectedLabel=task.assigneeKey?(task.assignee||task.assigneeKey):'';this.active=-1;this.serverMatches=new Set();
    const id=`fg-assignees-${++nextId}`;
    this.input=el('input',{role:'combobox','aria-label':`${task.key} 负责人`,'aria-autocomplete':'list','aria-expanded':'false','aria-controls':id,autocomplete:'off',placeholder:'选择或输入姓名…',value:this.selectedLabel,disabled:task.done});
    this.list=el('div',{role:'listbox',id,'aria-label':`${task.key} 可分配人员`});this.status=el('small',{role:'status'});
    this.more=button('加载更多人员',()=>this.search(true),{hidden:true});
    this.panel=el('div',{className:'fg-assignee-panel',hidden:true},this.list,this.status,this.more);this.node=el('div',{className:'fg-picker fg-person-select'},this.input,this.panel);
    this.input.addEventListener('focus',()=>{this.input.select();this.open();this.query='';this.render();this.search();});
    this.input.addEventListener('click',()=>{if(this.panel.hidden){this.open();this.query=this.input.value===this.selectedLabel?'':this.input.value.trim();this.render();this.search();}});
    this.input.addEventListener('input',()=>{this.query=this.input.value.trim();this.serverMatches.clear();this.open();this.controller?.abort();clearTimeout(this.timer);this.render();this.status.textContent='正在搜索…';this.more.hidden=true;this.timer=setTimeout(()=>this.search(),250);});
    this.input.addEventListener('keydown',event=>{
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();this.input.value=this.selectedLabel;this.close();}
      if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();if(this.panel.hidden){this.open();this.query='';this.render();this.search();}const options=[...this.list.children];if(!options.length)return;this.active=this.active<0?(event.key==='ArrowDown'?0:options.length-1):(this.active+(event.key==='ArrowDown'?1:-1)+options.length)%options.length;for(const [i,n] of options.entries())n.classList.toggle('fg-active',i===this.active);this.input.setAttribute('aria-activedescendant',options[this.active].id);options[this.active].scrollIntoView({block:'nearest'});}
      if(event.key==='Enter'&&!this.panel.hidden){event.preventDefault();this.list.children[this.active]?.click();}
    });
    this.node.addEventListener('focusout',event=>{if(!this.node.contains(event.relatedTarget))this.close();});
    // Fixed positioning keeps the menu outside the scrolling task list's clipping area.
    this.position=()=>{if(this.panel.hidden)return;const r=this.input.getBoundingClientRect(),height=Math.min(280,window.innerHeight-24);this.panel.style.width=`${Math.min(Math.max(r.width,220),window.innerWidth-24)}px`;this.panel.style.left=`${Math.max(12,Math.min(r.left,window.innerWidth-parseFloat(this.panel.style.width)-12))}px`;this.panel.style.maxHeight=`${height}px`;const below=window.innerHeight-r.bottom-12;this.panel.style.top=below>=Math.min(height,180)?`${r.bottom+6}px`:`${Math.max(12,r.top-Math.min(height,this.panel.scrollHeight)-6)}px`;};
    this.onScroll=event=>{if(!this.panel.contains(event.target))this.position();};window.addEventListener('resize',this.position);document.addEventListener('scroll',this.onScroll,true);
    this.abort=()=>this.destroy();client.signal?.addEventListener('abort',this.abort,{once:true});
  }
  open(){this.panel.hidden=false;this.input.setAttribute('aria-expanded','true');this.position?.();}
  close(){clearTimeout(this.timer);this.controller?.abort();this.panel.hidden=true;this.input.setAttribute('aria-expanded','false');this.input.removeAttribute('aria-activedescendant');}
  validate(){if(this.input.value!==this.selectedLabel)throw new Error(`${this.task.key}：请从下拉选项中选择负责人`);}
  render(){this.active=-1;this.input.removeAttribute('aria-activedescendant');const query=(this.query||'').toLocaleLowerCase();this.list.replaceChildren();for(const [key,name] of this.people){if(query&&!this.serverMatches.has(key)&&!`${key} ${name}`.toLocaleLowerCase().includes(query))continue;this.list.append(button(name,()=>{this.selectedLabel=name;this.input.value=name;this.task.assigneeKey=key;this.task.assignee=name;this.close();this.onSelect();},{role:'option',id:`${this.list.id}-${this.list.childElementCount}`,'aria-selected':String(key===this.task.assigneeKey),tabindex:-1}));}this.status.textContent=this.list.childElementCount?'':'没有匹配的人员';this.position?.();}
  async search(append=false){
    if(append&&this.loading)return;this.controller?.abort();const controller=this.controller=new AbortController();this.loading=true;if(!append){this.offset=0;this.serverMatches.clear();}this.status.textContent='正在搜索…';this.more.setAttribute('aria-disabled','true');
    try{const found=await this.client.assignees(this.task.key,this.query||'',this.offset,controller.signal);if(this.destroyed||controller.signal.aborted)return;for(const p of found){this.people.set(p.key||p.name,p.displayName||p.name||p.key);this.serverMatches.add(p.key||p.name);}this.offset+=found.length;this.render();this.more.hidden=found.length<30;}
    catch(e){if(!this.destroyed&&!controller.signal.aborted){this.status.textContent=e.message;this.more.hidden=true;}}
    finally{if(!controller.signal.aborted&&!this.destroyed){this.loading=false;this.more.setAttribute('aria-disabled','false');this.position();}}
  }
  destroy(){if(this.destroyed)return;this.destroyed=true;this.close();window.removeEventListener('resize',this.position);document.removeEventListener('scroll',this.onScroll,true);this.client.signal?.removeEventListener('abort',this.abort);}
}
