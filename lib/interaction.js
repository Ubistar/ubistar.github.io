export function attachModuleInteractions(root,{open,toast=()=>{},setTimer=setTimeout,clearTimer=clearTimeout}){
  let press=null,suppressUntil=0;
  const cancel=()=>{if(!press)return;clearTimer(press.timer);press.node.classList.remove('is-pressing');press=null;};
  const find=target=>target.closest?.('[data-module]');
  const nested=target=>target.closest?.('a,input,select,button:not([data-module])');
  root.addEventListener('pointerdown',e=>{
    const node=find(e.target);if(!node||nested(e.target)||e.button>0||e.pointerType==='mouse')return;
    cancel();const held={node,x:e.clientX,y:e.clientY,id:e.pointerId,timer:null};press=held;node.classList.add('is-pressing');
    held.timer=setTimer(()=>{if(press!==held)return;node.classList.remove('is-pressing');suppressUntil=Date.now()+900;press=null;open(node);},430);
  },{passive:true});
  root.addEventListener('pointermove',e=>{if(press&&(Math.hypot(e.clientX-press.x,e.clientY-press.y)>10))cancel();},{passive:true});
  root.addEventListener('pointerup',cancel,{passive:true});root.addEventListener('pointercancel',cancel,{passive:true});
  root.addEventListener('scroll',cancel,{passive:true,capture:true});
  root.addEventListener('contextmenu',e=>{if(find(e.target)){e.preventDefault();}});
  root.addEventListener('click',e=>{const node=find(e.target);if(!node||nested(e.target))return;if(Date.now()<suppressUntil){e.preventDefault();return;}if(e.pointerType==='touch'){toast();return;}open(node);});
  root.addEventListener('keydown',e=>{const node=find(e.target);if(node&&e.target===node&&(e.key==='Enter'||e.key===' ')){e.preventDefault();cancel();open(node);}});
  return cancel;
}
export class ModuleDialog{
  constructor(dialog,panel,close){
    this.dialog=dialog;this.panel=panel;this.reduce=matchMedia('(prefers-reduced-motion: reduce)');this.animations=[];this.epoch=0;this.busy=false;
    this.scrim=document.createElement('div');this.scrim.className='dialog-scrim';this.scrim.setAttribute('aria-hidden','true');dialog.prepend(this.scrim);
    close.addEventListener('click',()=>this.close());dialog.addEventListener('cancel',e=>{e.preventDefault();this.close();});
    dialog.addEventListener('click',e=>{if(e.target===dialog||e.target===this.scrim)this.close();});
  }
  animate(node,frames,options){const a=node.animate(frames,{fill:'both',...options});this.animations.push(a);return a;}
  cancelMotion(){this.epoch++;this.animations.forEach(a=>a.cancel());this.animations=[];this.clone?.remove();this.clone=null;}
  moving(value){document.body.dataset.modalMotion=String(value);this.dialog.classList.toggle('is-morphing',value);if(!value)document.dispatchEvent(new Event('glass-settled'));}
  copyCard(source,rect){
    const clone=source.cloneNode(true),style=getComputedStyle(source);clone.removeAttribute('id');clone.removeAttribute('data-module');clone.removeAttribute('tabindex');clone.setAttribute('aria-hidden','true');
    clone.querySelectorAll('[id]').forEach(n=>n.removeAttribute('id'));
    clone.classList.remove('module-lifted','is-pressing');clone.classList.add('transition-card');
    Object.assign(clone.style,{position:'fixed',left:`${rect.left}px`,top:`${rect.top}px`,width:`${rect.width}px`,height:`${rect.height}px`,minHeight:'0',maxHeight:'none',margin:'0',visibility:'visible',transform:'none'});
    for(const v of ['--ink','--muted','--accent','--line','--tint','--shadow','--glass-filter'])clone.style.setProperty(v,style.getPropertyValue(v));
    this.dialog.append(clone);this.clone=clone;return clone;
  }
  replaceContent(html){
    const body=this.panel.querySelector('.detail-content');
    if(this.dialog.classList.contains('is-morphing')){this.pendingContent=html;return;}
    body.innerHTML=html;this.panel.removeAttribute('data-loading');
    if(!this.reduce.matches)body.animate([{opacity:.3,transform:'translateY(8px)'},{opacity:1,transform:'none'}],{duration:240,easing:'cubic-bezier(.2,.8,.2,1)'});
  }
  async show(source){
    this.cancelMotion();this.busy=false;this.source?.classList.remove('module-lifted');this.source=source;this.sourceKey=source?.dataset.module;this.pendingContent=null;
    const from=source?.getBoundingClientRect();this.dialog.dataset.closing='false';
    if(!this.dialog.open){this.previousOverflow=document.documentElement.style.overflow;this.dialog.showModal();document.documentElement.style.overflow='hidden';}
    this.panel.querySelector('.detail-scroll').scrollTop=0;
    if(!from||this.reduce.matches)return;
    this.moving(true);const token=this.epoch,to=this.panel.getBoundingClientRect(),clone=this.copyCard(source,from);
    source.classList.add('module-lifted');
    const x=to.left+to.width/2-from.left-from.width/2,y=to.top+to.height/2-from.top-from.height/2,sw=from.width/to.width,sh=from.height/to.height;
    const options={duration:640,easing:'cubic-bezier(.22,.76,.22,1)'};
    this.animate(this.scrim,[{opacity:0},{opacity:1}],options);
    this.animate(clone,[{transform:'translate3d(0,0,0) scale(1)',opacity:1},{transform:`translate3d(${x}px,${y}px,0) scale(1)`,opacity:1,offset:.42},{transform:`translate3d(${x}px,${y}px,0) scale(${1/sw},${1/sh})`,opacity:0}],options);
    const finish=this.animate(this.panel,[{transform:`translate3d(${-x}px,${-y}px,0) scale(${sw},${sh})`,opacity:0},{transform:`translate3d(0,0,0) scale(${sw},${sh})`,opacity:0,offset:.42},{transform:'translate3d(0,0,0) scale(1)',opacity:1}],options);
    try{await finish.finished;}catch{return;}if(token!==this.epoch)return;
    this.cancelMotion();this.moving(false);
    if(this.pendingContent!==null){const html=this.pendingContent;this.pendingContent=null;this.replaceContent(html);document.dispatchEvent(new Event('glass-settled'));}
  }
  async close(){
    if(!this.dialog.open||this.busy)return;this.busy=true;this.cancelMotion();this.pendingContent=null;
    let source=this.source;if(!source?.isConnected&&this.sourceKey)source=document.querySelector(`[data-module="${CSS.escape(this.sourceKey)}"]`);
    const from=this.panel.getBoundingClientRect(),to=source?.getBoundingClientRect(),visible=to&&to.bottom>0&&to.top<innerHeight;
    this.dialog.dataset.closing='true';this.moving(true);
    if(!this.reduce.matches){
      const options={duration:440,easing:'cubic-bezier(.3,0,.2,1)'},x=visible?to.left+to.width/2-from.left-from.width/2:0,y=visible?to.top+to.height/2-from.top-from.height/2:30,sw=visible?to.width/from.width:.94,sh=visible?to.height/from.height:.94;
      this.animate(this.scrim,[{opacity:1},{opacity:0}],options);
      if(visible){const clone=this.copyCard(source,to);source.classList.add('module-lifted');this.animate(clone,[{transform:`translate3d(${-x}px,${-y}px,0) scale(${1/sw},${1/sh})`,opacity:0},{transform:`translate3d(${-x}px,${-y}px,0) scale(1)`,opacity:1,offset:.5},{transform:'translate3d(0,0,0) scale(1)',opacity:1}],options);}
      const finish=this.animate(this.panel,[{transform:'translate3d(0,0,0) scale(1)',opacity:1},{transform:`translate3d(0,0,0) scale(${sw},${sh})`,opacity:0,offset:.5},{transform:`translate3d(${x}px,${y}px,0) scale(${sw},${sh})`,opacity:0}],options);
      try{await finish.finished;}catch{}
    }
    this.dialog.close();this.cancelMotion();this.moving(false);this.source?.classList.remove('module-lifted');source?.classList.remove('module-lifted');
    document.documentElement.style.overflow=this.previousOverflow||'';source?.focus({preventScroll:true});this.busy=false;
  }
}
