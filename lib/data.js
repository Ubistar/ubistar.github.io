export const API_BASE = 'https://api.flyou.cc/v1';
export const STALE_AFTER = 180000;
export const number = value => Number.isFinite(Number(value)) && value !== null && value !== '' ? Math.max(0,Number(value)) : 0;
export const hasNumber = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
export const pad = n => String(n).padStart(2,'0');
export const stamp = value => {const n=number(value);return n && n<1e12?n*1000:n;};
export const esc = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function duration(value,short=false) {if(!hasNumber(value))return '—'; const n=Math.floor(value);return short?`${(n/3600).toFixed(1)} 小时`:`${Math.floor(n/3600)}小时 ${pad(Math.floor(n%3600/60))}分`;}
export function clock(n){n=Math.floor(number(n));return `${pad(Math.floor(n/3600))}:${pad(Math.floor(n%3600/60))}:${pad(n%60)}`;}
export function dateCN(ms=Date.now()){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(ms);}
export function time(value,full=false){const ms=stamp(value);if(!ms)return '—';return new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',...(full?{month:'2-digit',day:'2-digit'}:{}),hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(ms);}
export function normalize(raw){
  if(!raw || typeof raw.live!=='boolean' || !raw.today || !raw.week || !stamp(raw.lastCheckedAt))throw Error('监测数据不完整');
  return {...raw,history:(raw.history||[]).filter(d=>d&&/^\d{4}-\d{2}-\d{2}$/.test(d.date)).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,7),
    lastCheckedAt:stamp(raw.lastCheckedAt),lastSuccessAt:stamp(raw.lastSuccessAt),snapshotSavedAt:stamp(raw.snapshotSavedAt),launchAt:stamp(raw.launchAt),
    historyTotal:number(raw.historyTotal),checkCount:number(raw.checkCount),errorCount:number(raw.errorCount)};
}
export function stale(d,failed=false,now=Date.now()){return !d||failed||d.stale||d.verified===false||now-d.lastCheckedAt>STALE_AFTER||(d.snapshotSavedAt>0&&now-d.snapshotSavedAt>STALE_AFTER);}
export function current(d,failed=false,now=Date.now()){
  const delta=stale(d,failed,now)?0:Math.max(0,Math.floor((now-d.lastCheckedAt)/1000));
  const dailyDelta=d.today.date===dateCN(now)?delta:0;
  return {status:number(d.currentStatusSeconds)+delta,live:number(d.today.liveSeconds)+(d.live?dailyDelta:0),lazy:number(d.today.lazySeconds)+(d.live?0:dailyDelta),frozen:stale(d,failed,now)};
}
export function summarize(items){
  const known=items.filter(d=>hasNumber(d.liveSeconds)&&hasNumber(d.lazySeconds));
  const closed=known.filter(d=>!d.isToday), active=known.filter(d=>d.liveSeconds>0);
  const live=known.reduce((s,d)=>s+d.liveSeconds,0),lazy=known.reduce((s,d)=>s+d.lazySeconds,0);
  const best=closed.reduce((a,d)=>!a||d.liveSeconds>a.liveSeconds?d:a,null);
  return {known:known.length,closed:closed.length,active:active.length,live,lazy,share:live+lazy?live/(live+lazy)*100:0,
    average:closed.length?closed.reduce((s,d)=>s+d.liveSeconds,0)/closed.length:null,best,
    reconstructed:known.filter(d=>d.reconstructed).length,
    distribution:[closed.filter(d=>d.liveSeconds===0).length,closed.filter(d=>d.liveSeconds>0&&d.liveSeconds<3600).length,closed.filter(d=>d.liveSeconds>=3600&&d.liveSeconds<14400).length,closed.filter(d=>d.liveSeconds>=14400&&d.liveSeconds<28800).length,closed.filter(d=>d.liveSeconds>=28800).length]};
}
export function verdict(day,live=false){
  if(day.reconstructed)return {title:'历史重算',copy:day.report||'根据已保存的直播场次重新统计。'};
  const h=number(day.liveSeconds)/3600;
  if(live)return {title:h>=4?'持续营业中':'已开播，继续观察',copy:h>=4?'煮啵今天的出勤已经有了交代。再坚持一会儿，模范员工就是你。':'煮啵终于出现了。直播仍在继续，今天的评价，等收工再下结论。'};
  if(h>=8)return {title:'模范出勤',copy:'今天认真营业了八小时以上。这份出勤值得表扬，建议煮啵保持。'};
  if(h>=4)return {title:'勉强交差',copy:'四小时的出勤线已经越过。交差可以，评选劳模还得再努力一点。'};
  if(h>0)return {title:h>=1?'有待努力':'短暂露面',copy:`今天记录到 ${duration(number(day.liveSeconds))} 开播。煮啵，营业这件事，还可以更积极一点。`};
  return {title:'尚无开播记录',copy:'等待时间还在增加，煮啵的出勤记录却纹丝不动。严肃催播：请尽快到岗！'};
}
export function createClient(fetcher=fetch){
  const cache=new Map(),pending=new Map();
  return {async get(path,{force=false,signal,ttl=60000}={}){
    const saved=cache.get(path);if(!force&&saved&&Date.now()-saved.at<ttl)return saved.value;
    if(!force&&!signal&&pending.has(path))return pending.get(path);
    const controller=signal?null:new AbortController();const timer=controller?setTimeout(()=>controller.abort(),12000):null;
    const job=(async()=>{const response=await fetcher(`${API_BASE}/${path}`,{headers:{Accept:'application/json'},signal:signal||controller.signal});
      let value;try{value=await response.json();}catch{throw Error('数据服务暂不可用');}
      if(!response.ok)throw Error(value.error||value.reason||`请求失败（${response.status}）`);
      cache.set(path,{value,at:Date.now()});if(cache.size>16)cache.delete(cache.keys().next().value);return value;
    })();
    if(!signal)pending.set(path,job);
    try{return await job;}finally{if(timer)clearTimeout(timer);if(pending.get(path)===job)pending.delete(path);}
  }};
}
