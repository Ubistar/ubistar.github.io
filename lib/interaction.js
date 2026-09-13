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
// A damped mass-spring response, sampled ahead of time for compositor animations.
// No layout reads, map generation or JavaScript animation loop runs per frame.
function springFrames(duration,closing=false){
  const z=closing?.96:.84,w=closing?21:15.5,d=w*Math.sqrt(1-z*z),frames=[];
  for(let i=0;i<=72;i++){const t=i/72*duration/1000,p=i===72?1:1-Math.exp(-z*w*t)*(Math.cos(d*t)+z/Math.sqrt(1-z*z)*Math.sin(d*t));frames.push({offset:i/72,p});}
  return frames;
}
const smooth=(from,to,x)=>{const p=Math.max(0,Math.min(1,(x-from)/(to-from)));return p*p*(3-2*p);};
function cornerRadii(node,rect){
  const style=getComputedStyle(node),sx=rect.width/node.offsetWidth,sy=rect.height/node.offsetHeight;
  return ['borderTopLeftRadius','borderTopRightRadius','borderBottomRightRadius','borderBottomLeftRadius'].map(key=>{
    const pair=style[key].split(/\s+/),horizontal=pair[0],vertical=pair[1]||horizontal;
    const x=horizontal.endsWith('%')?parseFloat(horizontal)*rect.width/100:parseFloat(horizontal)*sx;
    const y=vertical.endsWith('%')?parseFloat(vertical)*rect.height/100:parseFloat(vertical)*sy;
    return {x:Math.min(rect.width/2,x||0),y:Math.min(rect.height/2,y||0)};
  });
}
function scaledRadii(from,to,p,sx,sy){
  // Counter-scale each corner so its visible radius matches the source/target.
  const r=from.map((v,i)=>({x:v.x+(to[i].x-v.x)*p,y:v.y+(to[i].y-v.y)*p}));
  return r.map(v=>`${Math.max(0,v.x/sx)}px`).join(' ')+' / '+r.map(v=>`${Math.max(0,v.y/sy)}px`).join(' ');
}
export class ModuleDialog{
  constructor(dialog,panel,close){
    this.dialog=dialog;this.panel=panel;this.reduce=matchMedia('(prefers-reduced-motion: reduce)');this.animations=[];this.epoch=0;this.busy=false;
    this.scrim=document.createElement('div');this.scrim.className='dialog-scrim';this.scrim.setAttribute('aria-hidden','true');dialog.prepend(this.scrim);
    close.addEventListener('click',()=>this.close());dialog.addEventListener('cancel',e=>{e.preventDefault();this.close();});
    dialog.addEventListener('click',e=>{if(e.target===dialog||e.target===this.scrim)this.close();});
  }
  animate(node,frames,duration){const a=node.animate(frames,{duration,easing:'linear',fill:'both'});this.animations.push(a);return a;}
  cancelMotion(){this.epoch++;this.animations.forEach(a=>a.cancel());this.animations=[];this.clone?.remove();this.shell?.remove();this.clone=null;this.shell=null;}
  moving(value){
    document.body.dataset.modalMotion=String(value);this.dialog.classList.toggle('is-morphing',value);
    if(!value)document.dispatchEvent(new Event('glass-settled'));
  }
  muteOptics(node){
    if(!node)return;node.dataset.optics='muted';node.style.setProperty('--optical-opacity','0');node.classList.add('optics-bypass');
  }
  restoreOptics(node){
    if(!node)return;node.dataset.optics='recovering';node.classList.remove('optics-bypass');
    // Install the stationary filter at zero opacity, then fade its optical layer.
    requestAnimationFrame(()=>requestAnimationFrame(()=>{if(node.dataset.optics!=='recovering')return;node.style.removeProperty('--optical-opacity');delete node.dataset.optics;}));
  }
  surface(target){
    const shell=document.createElement('div');shell.className='motion-shell';shell.setAttribute('aria-hidden','true');
    Object.assign(shell.style,{left:`${target.left}px`,top:`${target.top}px`,width:`${target.width}px`,height:`${target.height}px`});
    this.dialog.append(shell);this.shell=shell;return shell;
  }
  copyCard(source,rect){
    const clone=source.cloneNode(true),style=getComputedStyle(source);clone.removeAttribute('id');clone.removeAttribute('data-module');clone.removeAttribute('tabindex');clone.setAttribute('aria-hidden','true');clone.inert=true;
    clone.querySelectorAll('[id]').forEach(n=>n.removeAttribute('id'));clone.classList.remove('module-lifted','is-pressing');clone.classList.add('transition-card');
    Object.assign(clone.style,{position:'fixed',left:`${rect.left}px`,top:`${rect.top}px`,width:`${rect.width}px`,height:`${rect.height}px`,minHeight:'0',maxHeight:'none',margin:'0',visibility:'visible',transform:'none'});
    for(const v of ['--ink','--muted','--accent','--line','--shadow'])clone.style.setProperty(v,style.getPropertyValue(v));this.dialog.append(clone);this.clone=clone;return clone;
  }
  replaceContent(html){
    const body=this.panel.querySelector('.detail-content');if(this.dialog.classList.contains('is-morphing')){this.pendingContent=html;return;}
    body.innerHTML=html;this.panel.removeAttribute('data-loading');
    if(!this.reduce.matches)body.animate([{opacity:.3,transform:'translateY(6px)'},{opacity:1,transform:'none'}],{duration:200,easing:'cubic-bezier(.2,.8,.2,1)'});
  }
  async show(source){
    this.cancelMotion();this.busy=false;this.source?.classList.remove('module-lifted');this.source=source;this.sourceKey=source?.dataset.module;this.pendingContent=null;
    const from=source?.getBoundingClientRect();this.dialog.dataset.closing='false';
    if(!this.dialog.open){this.previousOverflow=document.documentElement.style.overflow;this.dialog.showModal();document.documentElement.style.overflow='hidden';}
    this.panel.querySelector('.detail-scroll').scrollTop=0;if(!from||this.reduce.matches)return;
    const to=this.panel.getBoundingClientRect(),x=to.left+to.width/2-from.left-from.width/2,y=to.top+to.height/2-from.top-from.height/2,sw=from.width/to.width,sh=from.height/to.height;
    const sourceRadii=cornerRadii(source,from),targetRadii=cornerRadii(this.panel,to),shell=this.surface(to),clone=this.copyCard(source,from),duration=680,frames=springFrames(duration),token=this.epoch;
    this.muteOptics(this.panel);
    this.moving(true);source.classList.add('module-lifted');
    this.animate(this.scrim,frames.map(({offset,p})=>({offset,opacity:Math.max(0,Math.min(1,p))})),duration);
    this.animate(shell,frames.map(({offset,p})=>{const sx=sw+(1-sw)*p,sy=sh+(1-sh)*p;return {offset,transform:`translate3d(${-x*(1-p)}px,${-y*(1-p)}px,0) scale(${sx},${sy})`,borderRadius:scaledRadii(sourceRadii,targetRadii,p,sx,sy)};}),duration);
    this.animate(clone,frames.map(({offset,p})=>({offset,transform:`translate3d(${x*p}px,${y*p}px,0) scale(${1+.018*Math.sin(Math.PI*Math.min(1,p))})`,opacity:1-smooth(.55,.94,p)})),duration);
    const finish=this.animate(this.panel,frames.map(({offset,p})=>({offset,transform:`translate3d(${-x*.12*(1-p)}px,${-y*.12*(1-p)}px,0) scale(${.975+.025*p})`,opacity:smooth(.75,1,p)})),duration);
    try{await finish.finished;}catch{return;}if(token!==this.epoch)return;
    this.cancelMotion();this.moving(false);this.restoreOptics(this.panel);
    if(this.pendingContent!==null){const html=this.pendingContent;this.pendingContent=null;this.replaceContent(html);document.dispatchEvent(new Event('glass-settled'));}
  }
  async close(){
    if(!this.dialog.open||this.busy)return;this.busy=true;this.cancelMotion();this.pendingContent=null;
    let source=this.source;if(!source?.isConnected&&this.sourceKey)source=document.querySelector(`[data-module="${CSS.escape(this.sourceKey)}"]`);
    const from=this.panel.getBoundingClientRect(),to=source?.getBoundingClientRect(),visible=to&&to.bottom>0&&to.top<innerHeight;this.dialog.dataset.closing='true';
    if(!this.reduce.matches){
      const duration=470,frames=springFrames(duration,true),x=visible?to.left+to.width/2-from.left-from.width/2:0,y=visible?to.top+to.height/2-from.top-from.height/2:35,sw=visible?to.width/from.width:.96,sh=visible?to.height/from.height:.96;
      const sourceRadii=cornerRadii(this.panel,from),targetRadii=visible?cornerRadii(source,to):sourceRadii,shell=this.surface(from),clone=visible?this.copyCard(source,to):null;this.muteOptics(this.panel);this.muteOptics(source);this.moving(true);source?.classList.add('module-lifted');
      this.animate(this.scrim,frames.map(({offset,p})=>({offset,opacity:1-Math.min(1,p)})),duration);
      this.animate(shell,frames.map(({offset,p})=>{const sx=1+(sw-1)*p,sy=1+(sh-1)*p;return {offset,transform:`translate3d(${x*p}px,${y*p}px,0) scale(${sx},${sy})`,borderRadius:scaledRadii(sourceRadii,targetRadii,p,sx,sy),opacity:visible?1:1-p};}),duration);
      if(clone)this.animate(clone,frames.map(({offset,p})=>({offset,transform:`translate3d(${-x*(1-p)}px,${-y*(1-p)}px,0) scale(1)`,opacity:smooth(.3,.82,p)})),duration);
      const finish=this.animate(this.panel,frames.map(({offset,p})=>({offset,transform:`translate3d(${x*.12*p}px,${y*.12*p}px,0) scale(${1-.025*p})`,opacity:1-smooth(0,.5,p)})),duration);
      try{await finish.finished;}catch{}
    }
    this.dialog.close();this.cancelMotion();this.moving(false);this.source?.classList.remove('module-lifted');source?.classList.remove('module-lifted');this.restoreOptics(source);this.restoreOptics(this.panel);document.documentElement.style.overflow=this.previousOverflow||'';source?.focus({preventScroll:true});this.busy=false;
  }
}
