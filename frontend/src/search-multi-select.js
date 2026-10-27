import {el,button} from './dom.js';
let nextId=0;

/** Local display filter. Selection never changes Jira issue data. */
export class SearchMultiSelect {
  constructor(label,onChange,className='') {
    Object.assign(this,{label,onChange,options:[],value:null});
    const panelId=`fg-multi-${++nextId}`;
    this.trigger=button(`${label}：全部`,()=>this.toggle(),{'aria-label':`${label}：全部`,'aria-expanded':'false','aria-controls':panelId,'aria-haspopup':'dialog',className:'fg-multi-trigger'});
    this.query=el('input',{type:'search','aria-label':`搜索${label}`,placeholder:label==='人员'?'输入姓名或账号…':'输入状态名称…',autocomplete:'off',onInput:()=>this.renderOptions()});
    this.list=el('div',{className:'fg-multi-options'});
    this.panel=el('div',{id:panelId,role:'dialog','aria-label':`${label}筛选`,className:'fg-multi-panel',hidden:true},this.query,
      el('div',{className:'fg-multi-actions'},button('全选',()=>this.choose(null)),button('清空',()=>this.choose(new Set()))),this.list);
    this.node=el('div',{className:`fg-multiselect ${className}`},this.trigger,this.panel);
    this.outside=event=>{if(!this.node.contains(event.target))this.close();};document.addEventListener('pointerdown',this.outside);
    this.node.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();this.close();this.trigger.focus();}if(event.key==='ArrowDown'&&event.target===this.trigger){event.preventDefault();this.open();}});
    this.node.addEventListener('focusout',event=>{if(event.relatedTarget&&!this.node.contains(event.relatedTarget))this.close();});
  }
  setOptions(options) {
    const signature=JSON.stringify(options);if(signature===this.signature)return;this.signature=signature;this.options=options;
    if(this.value!==null)this.value=new Set([...this.value].filter(id=>options.some(o=>o.id===id)));
    this.renderOptions();this.summary();
  }
  summary(){const count=this.value===null?this.options.length:this.value.size;this.trigger.textContent=`${this.label}：${this.value===null?'全部':count===0?'未选择':this.options.filter(o=>this.value.has(o.id)).map(o=>o.label).slice(0,2).join('、')+(count>2?` 等${count}项`:'')}`;this.trigger.setAttribute('aria-label',this.trigger.textContent);this.trigger.title=`${this.label}筛选，已选 ${count} / ${this.options.length}`;}
  renderOptions(){
    const query=this.query.value.trim().toLocaleLowerCase(),visible=this.options.filter(o=>`${o.label} ${o.search||''}`.toLocaleLowerCase().includes(query));
    this.list.replaceChildren(...visible.map(option=>{
      const input=el('input',{type:'checkbox',checked:this.value===null||this.value.has(option.id),'aria-label':option.label});
      input.addEventListener('change',()=>{if(this.value===null)this.value=new Set(this.options.map(o=>o.id));input.checked?this.value.add(option.id):this.value.delete(option.id);this.summary();this.onChange(this.value);});
      return el('label',{className:'fg-multi-option'},input,el('span',{},option.label),el('small',{},String(option.count)));
    }),...(visible.length?[]:[el('p',{className:'fg-multi-empty'},'没有匹配结果')]));
  }
  choose(value){this.value=value;this.summary();this.renderOptions();this.onChange(value);}
  open(){this.panel.hidden=false;this.trigger.setAttribute('aria-expanded','true');this.query.focus();}
  close(){this.panel.hidden=true;this.trigger.setAttribute('aria-expanded','false');}
  toggle(){this.panel.hidden?this.open():this.close();}
  destroy(){document.removeEventListener('pointerdown',this.outside);this.node.remove();}
}
