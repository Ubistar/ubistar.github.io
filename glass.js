import { generateLiquidGlassMaps } from './lib/glass-maps.js';
const NS='http://www.w3.org/2000/svg';
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const filters=document.createElementNS(NS,'svg');filters.setAttribute('aria-hidden','true');filters.style.cssText='position:fixed;width:0;height:0;pointer-events:none';
const defs=document.createElementNS(NS,'defs');filters.append(defs);document.body.append(filters);
const chromium=/Chrome|Chromium|Edg\//.test(navigator.userAgent) && !/Firefox|FxiOS|CriOS/.test(navigator.userAgent);
const mapCache=new Map(),watched=new Map();let serial=0;
function filterFor(node,width,height){
  if(!chromium||width<10||height<10)return;
  const pending=watched.get(node);if(document.body.dataset.modalMotion==='true'){if(pending)pending.dirty=true;return;}if(pending)pending.dirty=false;
  const radius=Math.min(Number(node.dataset.radius)||parseFloat(getComputedStyle(node).borderTopLeftRadius)||30,width/2,height/2);
  const scale=Math.min(1,420/width,420/height),w=Math.round(width*scale),h=Math.round(height*scale);
  const bezel=Math.min(22,radius*.78),key=`${w}:${h}:${Math.round(radius*scale)}`;
  let maps=mapCache.get(key);
  if(!maps){maps=generateLiquidGlassMaps({width:w,height:h,radius:radius*scale,bezelWidth:bezel*scale,glassThickness:80*scale,refractiveIndex:1.5,specularAngleDeg:55,specularRimWidth:1.4*scale});mapCache.set(key,maps);if(mapCache.size>42)mapCache.delete(mapCache.keys().next().value);}
  let record=watched.get(node);if(!record)return;
  if(record.filter)record.filter.remove();
  const id=`lens-${++serial}`,filter=document.createElementNS(NS,'filter');
  filter.setAttribute('id',id);filter.setAttribute('x','-20%');filter.setAttribute('y','-20%');filter.setAttribute('width','140%');filter.setAttribute('height','140%');filter.setAttribute('color-interpolation-filters','sRGB');
  const make=(name,attrs)=>{const el=document.createElementNS(NS,name);Object.entries(attrs).forEach(([k,v])=>el.setAttribute(k,v));filter.append(el);return el;};
  make('feGaussianBlur',{in:'SourceGraphic',stdDeviation:1.1,result:'soft'});
  make('feImage',{href:maps.displacementUrl,x:0,y:0,width,height,result:'map',preserveAspectRatio:'none'});
  make('feDisplacementMap',{in:'soft',in2:'map',scale:2*bezel*.618,xChannelSelector:'R',yChannelSelector:'G',result:'bent'});
  make('feColorMatrix',{in:'bent',type:'saturate',values:1.15,result:'saturated'});
  make('feImage',{href:maps.specularUrl,x:0,y:0,width,height,result:'rim',preserveAspectRatio:'none'});
  make('feBlend',{in:'saturated',in2:'rim',mode:'screen'});
  defs.append(filter);record.filter=filter;node.style.setProperty('--glass-filter',`url(#${id})`);node.classList.add('is-refractive');
}
const observer=new ResizeObserver(entries=>{for(const e of entries){const node=e.target,r={width:node.offsetWidth,height:node.offsetHeight},record=watched.get(node);if(!record||r.width===0)continue;const key=`${Math.round(r.width)}:${Math.round(r.height)}`;if(key!==record.size){record.size=key;clearTimeout(record.timer);record.timer=setTimeout(()=>filterFor(node,r.width,r.height),70);}}});
export function refreshGlass(root=document){
  for(const [node,record] of watched){if(!node.isConnected){observer.unobserve(node);clearTimeout(record.timer);record.filter?.remove();watched.delete(node);}}
  root.querySelectorAll('.glass:not(.transition-card)').forEach(node=>{if(watched.has(node))return;watched.set(node,{});if(node.dataset.radius)node.style.setProperty('--radius',`${node.dataset.radius}px`);observer.observe(node);});
}
document.addEventListener('pointermove',e=>{if(e.pointerType!=='mouse'||reduced.matches)return;const el=e.target.closest('.glass');if(!el)return;const r=el.getBoundingClientRect();el.style.setProperty('--mx',`${(e.clientX-r.left)/r.width*100}%`);el.style.setProperty('--my',`${(e.clientY-r.top)/r.height*100}%`);},{passive:true});
export function paintWallpaper(canvas){
  const w=innerWidth,h=innerHeight,ratio=Math.min(devicePixelRatio||1,1.5);canvas.width=Math.round(w*ratio);canvas.height=Math.round(h*ratio);
  const c=canvas.getContext('2d');c.scale(ratio,ratio);
  let g=c.createLinearGradient(0,0,w,h);g.addColorStop(0,'#122d38');g.addColorStop(.48,'#41666b');g.addColorStop(1,'#102d35');c.fillStyle=g;c.fillRect(0,0,w,h);
  g=c.createRadialGradient(w*.73,h*.06,0,w*.73,h*.06,w*.9);g.addColorStop(0,'#8bafaa');g.addColorStop(.45,'#496d70');g.addColorStop(1,'#102e38');c.fillStyle=g;c.fillRect(0,0,w,h);
  const ribbons=[{y:.14,a:.15,color:'#173d48'},{y:.45,a:.21,color:'#234f57'},{y:.7,a:.24,color:'#103540'},{y:.92,a:.18,color:'#14303a'}];
  for(const [i,r]of ribbons.entries()){
    c.beginPath();c.moveTo(-w*.2,h*(r.y+.48));c.bezierCurveTo(w*.26,h*(r.y+.03),w*.29,h*(r.y+.28),w*.64,h*(r.y-.07));c.bezierCurveTo(w*.82,h*(r.y-.28),w*.93,h*(r.y-.15),w*1.2,h*(r.y-.53));c.lineTo(w*1.2,h*1.4);c.lineTo(-w*.2,h*1.4);c.closePath();
    const rg=c.createLinearGradient(w*.05,h*(r.y+.15),w*.9,h*(r.y+.37));rg.addColorStop(0,'#173641');rg.addColorStop(.38,i===1?'#8ca8a0':'#668c88');rg.addColorStop(.44,i===1?'#bbcec0':'#8cae9e');rg.addColorStop(.47,r.color);rg.addColorStop(.74,'#153b45');rg.addColorStop(1,'#18343f');c.fillStyle=rg;c.fill();
    c.save();c.clip();for(let j=0;j<20;j++){c.beginPath();c.moveTo(-w*.1,h*(r.y+.36)+j*13);c.bezierCurveTo(w*.22,h*(r.y-.1)+j*13,w*.58,h*(r.y+.18)+j*8,w*1.1,h*(r.y-.45)+j*14);c.strokeStyle=`rgba(191,220,199,${.02+(20-j)*.001})`;c.lineWidth=1;c.stroke();}c.restore();
  }
  const shade=c.createLinearGradient(0,0,0,h);shade.addColorStop(0,'rgba(5,25,35,.1)');shade.addColorStop(.7,'rgba(5,25,35,0)');shade.addColorStop(1,'rgba(5,20,28,.35)');c.fillStyle=shade;c.fillRect(0,0,w,h);
}
function luminance(r,g,b){const f=n=>{n/=255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4;};return .2126*f(r)+.7152*f(g)+.0722*f(b);}
// Choose the minimum tint that gives every sampled point a 6:1 foreground
// contrast margin. Work in sRGB for compositing, then linear luminance for contrast.
function readableTint(colors,light){
  const tint=light?[241,251,245]:[5,24,31],ink=light?[18,44,48]:[246,250,248],fg=luminance(...ink);
  const passes=alpha=>colors.every(rgb=>{const bg=luminance(...rgb.map((v,i)=>v*(1-alpha)+tint[i]*alpha));return (Math.max(fg,bg)+.05)/(Math.min(fg,bg)+.05)>=6;});
  let low=light?.08:.10,high=.88;if(passes(low))return low;
  for(let i=0;i<8;i++){const mid=(low+high)/2;if(passes(mid))high=mid;else low=mid;}
  return high;
}
export class BackgroundContrast{
  constructor(video,wallpaper){this.video=video;this.wallpaper=wallpaper;this.sample=document.createElement('canvas');this.sample.width=120;this.sample.height=80;this.ctx=this.sample.getContext('2d',{willReadFrequently:true});this.failedVideo=false;this.last=0;this.loop=this.loop.bind(this);requestAnimationFrame(this.loop);video.addEventListener('loadeddata',()=>{this.failedVideo=false;});}
  loop(now){if(!document.hidden&&document.body.dataset.modalMotion!=='true'&&now-this.last>650){this.last=now;this.update();}requestAnimationFrame(this.loop);}
  update(){
    const {ctx,video,sample}=this;let usable=true;
    try{
      if(document.body.dataset.media==='playing'&&video.readyState>=2&&!this.failedVideo){const vr=video.videoWidth/video.videoHeight,pr=innerWidth/innerHeight;let sw=video.videoWidth,sh=video.videoHeight;if(vr>pr)sw=sh*pr;else sh=sw/pr;ctx.drawImage(video,(video.videoWidth-sw)/2,(video.videoHeight-sh)/2,sw,sh,0,0,120,80);}
      else if(document.body.dataset.media==='playing'&&this.failedVideo){usable=false;}
      else ctx.drawImage(this.wallpaper,0,0,120,80);
      if(!usable)throw Error('cross-origin video');
      const pixels=ctx.getImageData(0,0,120,80).data;
      document.querySelectorAll('.glass,[data-contrast-zone]').forEach(node=>{
        const r=node.getBoundingClientRect();if(r.width===0||r.bottom<0||r.top>innerHeight)return;
        const colors=[];for(let y=1;y<=4;y++)for(let x=1;x<=5;x++){const px=Math.max(0,Math.min(119,Math.floor((r.left+r.width*x/6)/innerWidth*120))),py=Math.max(0,Math.min(79,Math.floor((r.top+r.height*y/5)/innerHeight*80))),i=(py*120+px)*4;colors.push([pixels[i],pixels[i+1],pixels[i+2]]);}
        const values=colors.map(rgb=>luminance(...rgb)),mean=values.reduce((a,b)=>a+b,0)/values.length,old=node.dataset.tone||'dark';const light=old==='light'?mean>.35:mean>.5;
        node.dataset.tone=light?'light':'dark';
        let alpha=readableTint(colors,light);
        if(node.closest('dialog'))alpha=Math.max(alpha,.46);
        node.style.setProperty('--tint',light?`rgba(241,251,245,${alpha})`:`rgba(5,24,31,${alpha})`);
      });
      document.body.dataset.contrast='sampled';
    }catch{this.failedVideo=true;sample.width=120;document.body.dataset.contrast='protected';document.querySelectorAll('.glass,[data-contrast-zone]').forEach(node=>{node.dataset.tone='dark';node.style.setProperty('--tint','rgba(5,24,31,.70)');});}
  }
}

document.addEventListener('glass-settled',()=>{refreshGlass();for(const[node,record]of watched){if(record.dirty&&node.offsetWidth)filterFor(node,node.offsetWidth,node.offsetHeight);}});
