(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.TableColumnEditor=api;
})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  const minimum=8,round=value=>Number(value.toFixed(6));
  let drag=null,observers=[];
  function resizeColumns(columns,boundary,delta){
    if(!Array.isArray(columns)||columns.length!==3||!columns.every(Number.isFinite)||![0,1].includes(boundary)||!Number.isFinite(delta))throw new Error('表格欄寬調整無效');
    const next=[...columns],pair=next[boundary]+next[boundary+1];
    next[boundary]=round(Math.max(minimum,Math.min(pair-minimum,next[boundary]+delta)));next[boundary+1]=round(pair-next[boundary]);return next;
  }
  const editable=()=>Boolean(window.generalRoadEditor?.editing&&!window.visualLayoutEditor?.busy);
  const headers=table=>[...table.querySelectorAll('thead th')];
  function measured(table){
    const widths=headers(table).map(header=>header.getBoundingClientRect().width),total=widths.reduce((sum,width)=>sum+width,0),columns=widths.map(width=>width/total*100);columns[2]=100-columns[0]-columns[1];return columns;
  }
  const current=table=>[...(window.visualLayoutEditor.store.config.tableColumns[table.dataset.tableColumns]||measured(table))];
  function apply(table,columns){
    [...table.querySelectorAll('col')].forEach((col,index)=>{col.style.width=columns[index]+'%';});table.dataset.customColumns='';
    for(const handle of table.querySelectorAll('[data-table-boundary]')){const index=Number(handle.dataset.tableBoundary);handle.setAttribute('aria-valuenow',round(columns[index]));handle.setAttribute('aria-valuemax',round(columns[index]+columns[index+1]-minimum));}
  }
  function restore(record){
    [...record.table.querySelectorAll('col')].forEach((col,index)=>{col.style.width=record.widths[index];});if(!record.custom)delete record.table.dataset.customColumns;
    for(const handle of record.table.querySelectorAll('[data-table-boundary]')){const index=Number(handle.dataset.tableBoundary);handle.setAttribute('aria-valuenow',round(record.columns[index]));handle.setAttribute('aria-valuemax',round(record.columns[index]+record.columns[index+1]-minimum));}
  }
  function finish(cancel=false){
    if(!drag)return;const record=drag;drag=null;document.body.classList.remove('is-table-resizing');try{record.handle.releasePointerCapture(record.pointerId);}catch{}
    if(cancel||!record.next||record.next.every((width,index)=>Math.abs(width-record.columns[index])<.00001)){restore(record);return;}
    if(!save(record.table,record.next,record.boundary))restore(record);
  }
  function cleanup(){finish(true);for(const observer of observers)observer.disconnect();observers=[];}
  function save(table,columns,boundary,reset=false){
    const key=table.dataset.tableColumns,editor=window.visualLayoutEditor;
    if(editor.transact(config=>{if(reset)delete config.tableColumns[key];else config.tableColumns[key]=columns;})){
      document.querySelector('[data-table-columns="'+key+'"] [data-table-boundary="'+boundary+'"]')?.focus({preventScroll:true});editor.report(reset?'已恢復預設欄寬，請儲存設定。':'表格欄寬已調整，請儲存設定。');
      return true;
    }else if(!reset){const stored=editor.store.config.tableColumns[key];if(stored)apply(table,stored);}
    return false;
  }
  function mount(root){
    cleanup();const config=window.visualLayoutEditor?.store?.config;if(!config)return;
    for(const table of root.querySelectorAll('table[data-table-columns]')){
      const saved=config.tableColumns[table.dataset.tableColumns];if(saved)apply(table,saved);if(!editable())continue;
      const columns=current(table);
      headers(table).slice(0,-1).forEach((header,index)=>{
        const handle=document.createElement('span');handle.className='table-column-resizer';handle.dataset.tableBoundary=String(index);handle.dataset.editorUi='table-columns';handle.tabIndex=0;handle.setAttribute('role','separator');handle.setAttribute('aria-orientation','vertical');handle.setAttribute('aria-label','調整第 '+(index+1)+' 與第 '+(index+2)+' 欄寬度');handle.setAttribute('aria-valuemin',minimum);handle.setAttribute('aria-valuenow',round(columns[index]));handle.setAttribute('aria-valuemax',round(columns[index]+columns[index+1]-minimum));handle.title='左右拖曳調整欄寬；方向鍵微調；雙擊恢復預設';header.append(handle);
      });
      const size=()=>{for(const handle of table.querySelectorAll('[data-table-boundary]'))handle.style.height=table.getBoundingClientRect().height+'px';};size();const observer=new ResizeObserver(size);observer.observe(table);observers.push(observer);
    }
  }
  if(typeof document==='object'){
    document.addEventListener('pointerdown',event=>{
      const handle=event.target.closest('[data-table-boundary]');if(!handle||!editable()||event.button!==0||event.isPrimary===false)return;
      event.preventDefault();event.stopImmediatePropagation();finish(true);const table=handle.closest('[data-table-columns]');handle.focus({preventScroll:true});
      drag={handle,table,boundary:Number(handle.dataset.tableBoundary),pointerId:event.pointerId,x:event.clientX,tableWidth:table.getBoundingClientRect().width,columns:current(table),widths:[...table.querySelectorAll('col')].map(col=>col.style.width),custom:table.hasAttribute('data-custom-columns'),next:null};
      try{handle.setPointerCapture(event.pointerId);}catch{}document.body.classList.add('is-table-resizing');
    },true);
    document.addEventListener('pointermove',event=>{
      if(!drag||drag.pointerId!==event.pointerId)return;if(!editable()){finish(true);return;}event.preventDefault();event.stopImmediatePropagation();
      if(Math.abs(event.clientX-drag.x)<.5&&!drag.next)return;drag.next=resizeColumns(drag.columns,drag.boundary,(event.clientX-drag.x)/drag.tableWidth*100);apply(drag.table,drag.next);
    },{capture:true,passive:false});
    document.addEventListener('pointerup',event=>{if(drag?.pointerId===event.pointerId){event.preventDefault();event.stopImmediatePropagation();finish();}},true);
    document.addEventListener('pointercancel',event=>{if(drag?.pointerId===event.pointerId)finish(true);},true);
    document.addEventListener('keydown',event=>{
      if(drag&&event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();finish(true);return;}
      const handle=event.target.closest('[data-table-boundary]');if(!handle||!editable()||event.ctrlKey||event.metaKey||event.altKey||!['ArrowLeft','ArrowRight','Home'].includes(event.key))return;
      event.preventDefault();event.stopImmediatePropagation();const table=handle.closest('[data-table-columns]'),boundary=Number(handle.dataset.tableBoundary);
      if(event.key==='Home')save(table,null,boundary,true);else save(table,resizeColumns(current(table),boundary,(event.key==='ArrowLeft'?-1:1)*(event.shiftKey?5:1)),boundary);
    },true);
    document.addEventListener('dblclick',event=>{const handle=event.target.closest('[data-table-boundary]');if(handle&&editable()){event.preventDefault();event.stopImmediatePropagation();finish(true);save(handle.closest('[data-table-columns]'),null,Number(handle.dataset.tableBoundary),true);}},true);
    window.addEventListener('blur',()=>finish(true));
  }
  return {resizeColumns,mount,cleanup};
});
