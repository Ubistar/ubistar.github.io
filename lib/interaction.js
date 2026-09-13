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
    const video=document.getElementById('liveVideo');
    if(value&&!this.videoHeld){this.videoHeld=true;this.resumeVideo=video&&!video.paused;if(this.resumeVideo)video.pause();}
    if(!value){this.videoHeld=false;if(this.resumeVideo&&document.body.dataset.media==='playing'&&!document.hidden)video.play().catch(()=>{});this.resumeVideo=false;document.dispatchEvent(new Event('glass-settled'));}
  }
  // Freeze only the optical surface. Text stays live DOM, never stretched.
  surface(source,r,target){
    const style=getComputedStyle(source),tint=style.getPropertyValue('--tint').trim()||'rgba(8,29,35,.55)',shell=document.createElement('div');
    shell.className='motion-shell';shell.setAttribute('aria-hidden','true');
    Object.assign(shell.style,{left:`${target.left}px`,top:`${target.top}px`,width:`${target.width}px`,height:`${target.height}px`,backgroundColor:tint});
    try{
      const video=document.getElementById('liveVideo'),wallpaper=document.getElementById('wallpaper'),live=document.body.dataset.media==='playing'&&video.readyState>=2,src=live?video:wallpaper;
      const cw=live?video.videoWidth:wallpaper.width,ch=live?video.videoHeight:wallpaper.height;
      let sw=cw,sh=ch;if(cw/ch>innerWidth/innerHeight)sw=ch*innerWidth/innerHeight;else sh=cw*innerHeight/innerWidth;
      const scale=Math.min(1,640/r.width,640/r.height),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(r.width*scale));canvas.height=Math.max(1,Math.round(r.height*scale));const ctx=canvas.getContext('2d');
      ctx.fillStyle='#183b43';ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.drawImage(src,(cw-sw)/2+r.left/innerWidth*sw,(ch-sh)/2+r.top/innerHeight*sh,r.width/innerWidth*sw,r.height/innerHeight*sh,0,0,canvas.width,canvas.height);
      ctx.fillStyle=tint;ctx.fillRect(0,0,canvas.width,canvas.height);shell.style.backgroundImage=`url(${canvas.toDataURL('image/jpeg',.84)})`;
    }catch{shell.style.backgroundColor='rgba(8,29,35,.94)';}
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
    const shell=this.surface(source,from,to),clone=this.copyCard(source,from),duration=680,frames=springFrames(duration),token=this.epoch;
    this.moving(true);source.classList.add('module-lifted');
    this.animate(this.scrim,frames.map(({offset,p})=>({offset,opacity:Math.max(0,Math.min(1,p))})),duration);
    this.animate(shell,frames.map(({offset,p})=>({offset,transform:`translate3d(${-x*(1-p)}px,${-y*(1-p)}px,0) scale(${sw+(1-sw)*p},${sh+(1-sh)*p})`})),duration);
    this.animate(clone,frames.map(({offset,p})=>({offset,transform:`translate3d(${x*p}px,${y*p}px,0) scale(${1+.018*Math.sin(Math.PI*Math.min(1,p))})`,opacity:1-smooth(.55,.94,p)})),duration);
    const finish=this.animate(this.panel,frames.map(({offset,p})=>({offset,transform:`translate3d(${-x*.12*(1-p)}px,${-y*.12*(1-p)}px,0) scale(${.975+.025*p})`,opacity:smooth(.75,1,p)})),duration);
    try{await finish.finished;}catch{return;}if(token!==this.epoch)return;
    this.cancelMotion();this.moving(false);
    if(this.pendingContent!==null){const html=this.pendingContent;this.pendingContent=null;this.replaceContent(html);document.dispatchEvent(new Event('glass-settled'));}
  }
  async close(){
    if(!this.dialog.open||this.busy)return;this.busy=true;this.cancelMotion();this.pendingContent=null;
    let source=this.source;if(!source?.isConnected&&this.sourceKey)source=document.querySelector(`[data-module="${CSS.escape(this.sourceKey)}"]`);
    const from=this.panel.getBoundingClientRect(),to=source?.getBoundingClientRect(),visible=to&&to.bottom>0&&to.top<innerHeight;this.dialog.dataset.closing='true';
    if(!this.reduce.matches){
      const duration=470,frames=springFrames(duration,true),x=visible?to.left+to.width/2-from.left-from.width/2:0,y=visible?to.top+to.height/2-from.top-from.height/2:35,sw=visible?to.width/from.width:.96,sh=visible?to.height/from.height:.96;
      const shell=this.surface(this.panel,from,from),clone=visible?this.copyCard(source,to):null;this.moving(true);source?.classList.add('module-lifted');
      this.animate(this.scrim,frames.map(({offset,p})=>({offset,opacity:1-Math.min(1,p)})),duration);
      this.animate(shell,frames.map(({offset,p})=>({offset,transform:`translate3d(${x*p}px,${y*p}px,0) scale(${1+(sw-1)*p},${1+(sh-1)*p})`,opacity:visible?1:1-p})),duration);
      if(clone)this.animate(clone,frames.map(({offset,p})=>({offset,transform:`translate3d(${-x*(1-p)}px,${-y*(1-p)}px,0) scale(1)`,opacity:smooth(.3,.82,p)})),duration);
      const finish=this.animate(this.panel,frames.map(({offset,p})=>({offset,transform:`translate3d(${x*.12*p}px,${y*.12*p}px,0) scale(${1-.025*p})`,opacity:1-smooth(0,.5,p)})),duration);
      try{await finish.finished;}catch{}
    }
    this.dialog.close();this.cancelMotion();this.moving(false);this.source?.classList.remove('module-lifted');source?.classList.remove('module-lifted');document.documentElement.style.overflow=this.previousOverflow||'';source?.focus({preventScroll:true});this.busy=false;
  }
}
