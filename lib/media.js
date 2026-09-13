import { stale } from './data.js?v=3.2.0';
export function coverCrop(vw,vh,pw,ph){const ratio=pw/ph;let w=vw,h=vh;if(vw/vh>ratio)w=vh*ratio;else h=vw/ratio;return {x:(vw-w)/2,y:(vh-h)/2,width:w,height:h};}
export function allowedMediaURL(value){try{const u=new URL(value);return u.protocol==='https:'&&/(^|\.)bilivideo\.(com|cn)$/.test(u.hostname)&&!u.username&&!u.password&&!u.port;}catch{return false;}}
let hlsScript;
function loadHls(){if(window.Hls)return Promise.resolve(window.Hls);if(!hlsScript)hlsScript=new Promise((resolve,reject)=>{const el=document.createElement('script');el.src=new URL('../vendor/hls.light.min.js',import.meta.url).href;el.onload=()=>window.Hls?resolve(window.Hls):reject(Error('播放器不可用'));el.onerror=()=>{hlsScript=null;el.remove();reject(Error('播放器加载失败'));};document.head.append(el);});return hlsScript;}
export class LiveBackground{
  constructor(video,client){this.video=video;this.client=client;this.enabled=true;this.sequence=0;this.hls=null;this.active=false;this.loading=false;this.lastAttempt=0;this.blocked=false;
    this.status=document.getElementById('mediaStatus');this.toggle=document.getElementById('mediaToggle');this.retry=document.getElementById('mediaRetry');
    video.muted=true;video.defaultMuted=true;video.volume=0;
    video.addEventListener('volumechange',()=>{if(!video.muted||video.volume!==0){video.muted=true;video.volume=0;}});
    video.addEventListener('playing',()=>{if(!this.active){video.pause();return;}document.body.dataset.media='playing';this.label('直播画面 · 静音播放');this.toggle.hidden=false;this.retry.hidden=true;});
    video.addEventListener('error',()=>{if(this.active&&!this.hls)this.fail('直播画面暂不可用');});
    this.toggle.addEventListener('click',()=>{this.enabled=false;this.stop();this.label('直播背景已暂停');this.retry.hidden=false;this.retry.setAttribute('aria-label','恢复直播背景');});
    this.retry.addEventListener('click',()=>{this.enabled=true;this.blocked=false;if(this.active&&video.src){video.play().catch(()=>this.fail('轻触此处播放背景'));}else this.update(this.dashboard,this.failed,true);});
    document.addEventListener('visibilitychange',()=>{if(document.hidden){video.pause();this.hls?.stopLoad();}else if(this.active&&this.enabled&&!stale(this.dashboard,this.failed)){this.hls?.startLoad(-1);video.play().catch(()=>this.fail('轻触此处播放背景'));}else this.update(this.dashboard,this.failed);});
  }
  label(text){this.status.textContent=text;}
  stop(){this.sequence++;this.active=false;this.loading=false;clearTimeout(this.expiryTimer);this.hls?.destroy();this.hls=null;this.video.pause();this.video.removeAttribute('src');this.video.load();document.body.dataset.media='wallpaper';this.toggle.hidden=true;this.retry.hidden=true;}
  fail(message){this.stop();this.blocked=true;this.label(message);this.retry.hidden=false;this.retry.setAttribute('aria-label','重试直播背景');}
  async update(d,failed=false,force=false){this.dashboard=d;this.failed=failed;
    if(!d||stale(d,failed)||!d.live){if(this.active||this.loading)this.stop();this.label(d?.live?'等待核验 · 静谧背景':'静谧背景 · 等待开播');return;}
    if(!this.enabled||document.hidden||this.active||this.loading||(!force&&(this.blocked||Date.now()-this.lastAttempt<120000)))return;
    this.lastAttempt=Date.now();this.loading=true;const seq=++this.sequence;this.label('正在连接直播画面…');
    try{
      const info=await this.client.get('stream',{force:true,ttl:0});if(seq!==this.sequence)return;
      const stream=info.streams?.find(s=>allowedMediaURL(s.url));if(!info.available||!stream)throw Error(info.reason||'直播画面暂不可用');
      this.active=true;const video=this.video;video.muted=true;video.volume=0;video.setAttribute('muted','');video.playsInline=true;
      if(video.canPlayType('application/vnd.apple.mpegurl')){video.src=stream.url;}
      else {const Hls=await loadHls();if(seq!==this.sequence)return;if(!Hls.isSupported())throw Error('此浏览器暂不支持直播背景');
        this.hls=new Hls({enableWorker:true,lowLatencyMode:false,backBufferLength:15,maxBufferLength:20,maxMaxBufferLength:30,
          xhrSetup(xhr,url){if(!allowedMediaURL(url))throw Error('非直播 CDN 地址');xhr.withCredentials=false;}});
        this.hls.on(Hls.Events.ERROR,(_,data)=>{if(data.fatal&&seq===this.sequence)this.fail('直播画面连接中断 · 点击重试');});
        this.hls.loadSource(stream.url);this.hls.attachMedia(video);
      }
      if(seq!==this.sequence)return;
      await video.play();
      if(seq!==this.sequence)return;
      const wait=Math.max(30000,(info.expiresAt||Date.now()+300000)-Date.now()-20000);
      this.expiryTimer=setTimeout(()=>{if(this.active&&this.enabled){this.stop();this.update(this.dashboard,this.failed,true);}},wait);
    }catch(error){if(seq===this.sequence)this.fail(error.name==='NotAllowedError'?'轻触此处播放背景':'直播画面暂不可用 · 点击重试');}
    finally{if(seq===this.sequence)this.loading=false;}
  }
  info(){return {playing:document.body.dataset.media==='playing',width:this.video.videoWidth,height:this.video.videoHeight,muted:this.video.muted,status:this.status.textContent};}
}
