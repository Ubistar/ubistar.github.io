import {API_BASE,number,hasNumber,pad,stamp,esc,duration,clock,dateCN,time,normalize,stale,current,summarize,verdict,createClient} from './lib/data.js?v=3.1.0';
import {refreshGlass,paintWallpaper,BackgroundContrast} from './glass.js?v=3.1.0';
import {attachModuleInteractions,ModuleDialog} from './lib/interaction.js?v=3.1.0';
import {LiveBackground} from './lib/media.js?v=3.1.0';
const $=id=>document.getElementById(id), client=createClient(),CACHE='liwai-observatory-v3';
const state={d:null,failed:false,loading:false,view:'overview',period:30,insights:new Map(),insightRequests:new Map(),detail:null,detailSequence:0,
  history:{page:1,limit:10,from:'',to:'',pages:1,total:0,items:[],loading:false,sequence:0,controller:null}};
const icon=name=>`<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
const arrow=`<span class="expand-icon">${icon('arrow')}</span>`;
const label=(name,symbol)=>`<span class="module-label">${icon(symbol)}${name}</span>`;
function card(key,title,symbol,content,classes=''){return `<article class="glass module ${classes}" data-module="${key}" tabindex="0" role="button" aria-label="展开${title}详情" aria-haspopup="dialog"><div class="module-top">${label(title,symbol)}${arrow}</div>${content}</article>`;}
function stats(items){return `<dl class="detail-stat-grid">${items.map(([k,v])=>`<div class="glass detail-stat" data-radius="20"><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`;}
function section(title,content){return `<section class="detail-section"><h3>${esc(title)}</h3>${content}</section>`;}
function list(items){return `<div class="detail-list">${items.map(([k,v])=>`<div><span>${esc(k)}</span><strong>${esc(v)}</strong></div>`).join('')}</div>`;}
function compactHours(n){return hasNumber(n)?(n/3600).toFixed(1):'—';}
function percent(a,b){return b>0?Math.min(100,a/b*100):0;}
function chart(days,end=state.d?.today.date){
  if(!end)return '<p class="empty-state">暂无趋势记录</p>';
  const byDate=new Map(days.map(d=>[d.date,d])),anchor=Date.parse(`${end}T12:00:00+08:00`);
  const dates=Array.from({length:7},(_,i)=>dateCN(anchor-(6-i)*86400000));
  return `<div class="chart-legend"><span><i></i>开播</span><span><i></i>未开播</span></div><div class="week-chart"><div class="chart-scale"><span>24h</span><span>12h</span><span>0h</span></div><div class="chart-gridlines"><i></i><i></i><i></i></div>${dates.map(date=>{const d=byDate.get(date),known=d&&hasNumber(d.liveSeconds)&&hasNumber(d.lazySeconds),live=known?d.liveSeconds:0,lazy=known?d.lazySeconds:0,scale=Math.max(86400,live+lazy),description=known?`${date}，开播${duration(live)}，未开播${duration(lazy)}`:`${date}，暂无记录`;
    return `<div class="bar-group" role="img" aria-label="${esc(description)}" title="${esc(description)}"><div class="bar-space"><div class="bar-stack"><div class="bar-live" style="height:${live/scale*100}%"></div><div class="bar-lazy" style="height:${lazy/scale*100}%"></div></div></div><span>${date===dateCN()?'今天':date.slice(5).replace('-','/')}</span></div>`;}).join('')}</div>`;
}
function lineChart(items){
  if(!items.length)return '<p class="empty-state">暂无趋势数据</p>';
  const max=Math.ceil(Math.max(8,...items.map(d=>number(d.liveSeconds)/3600))),first=Date.parse(items[0].date),span=Math.max(86400000,Date.parse(items.at(-1).date)-first),points=items.map(d=>[35+(Date.parse(d.date)-first)/span*540,140-number(d.liveSeconds)/3600/max*115]);
  const path=points.map((p,i)=>`${i?'L':'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  return `<svg class="line-chart" viewBox="0 0 600 170" preserveAspectRatio="none" role="img" aria-label="${esc(items[0].date)}至${esc(items.at(-1).date)}每日开播趋势，${items.length}个已记录日期"><path d="M35 25H575 M35 82H575 M35 140H575" stroke="currentColor" stroke-opacity=".15" stroke-dasharray="3 5"/><path d="${path} L${points.at(-1)[0]},140 L35,140Z" fill="currentColor" fill-opacity=".06"/><path d="${path}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>${points.map((p,i)=>`<circle cx="${p[0]}" cy="${p[1]}" r="${items.length>35?1.6:3}" fill="var(--accent)"><title>${esc(items[i].date)} · ${duration(items[i].liveSeconds)}</title></circle>`).join('')}<text x="0" y="29">${max.toFixed(0)}h</text><text x="0" y="86">${max/2}h</text><text x="0" y="144">0h</text><text x="35" y="165">${esc(items[0].date.slice(5))}</text><text x="575" y="165" text-anchor="end">${esc(items.at(-1).date.slice(5))}</text></svg>`;
}
function heatmap(info){
  const byDate=new Map(info.items.map(d=>[d.date,d])),start=Date.parse(`${info.from}T12:00:00+08:00`);
  return `<div class="heatmap" role="img" aria-label="${info.days}天开播日历，色块越亮表示开播时间越长">${Array.from({length:info.days},(_,i)=>{const date=dateCN(start+i*86400000),d=byDate.get(date),known=d&&hasNumber(d.liveSeconds);return `<i data-empty="${!known}" style="--intensity:${known?d.liveSeconds===0?.1:.3+Math.min(1,d.liveSeconds/36000)*.7:0}" title="${date}：${known?duration(d.liveSeconds):'暂无记录'}"></i>`;}).join('')}</div><div class="heat-legend"><span>空心方格为缺失记录</span><span>少 ${[.1,.35,.6,.8,1].map(v=>`<i style="--intensity:${v}"></i>`).join('')} 多</span></div>`;
}
function distribution(items){const s=summarize(items),max=Math.max(1,...s.distribution),names=['未记录开播','不足 1h','1–4h','4–8h','8h 以上'];return `<div class="distribution">${s.distribution.map((n,i)=>`<div class="distribution-row"><span>${names[i]}</span><div class="distribution-track"><i style="--w:${n/max*100}%"></i></div><span>${n} 天</span></div>`).join('')}</div>`;}
function smallBars(days){const last=[...days].reverse(),max=Math.max(1,...last.map(d=>number(d.liveSeconds)));return `<div class="mini-wave" aria-hidden="true">${last.map(d=>`<span style="height:${Math.max(8,number(d.liveSeconds)/max*100)}%"></span>`).join('')}</div>`;}
function overview(){const d=state.d;if(!d)return;const c=current(d,state.failed),t=d.today,v=verdict(t,d.live&&!c.frozen),share=percent(c.live,c.live+c.lazy);
  $('overviewGrid').innerHTML=`<article class="glass module status-module" data-module="status" role="button" tabindex="0" aria-label="展开实时直播详情" aria-haspopup="dialog"><div class="module-top"><span class="live-badge" data-live="${d.live&&!c.frozen}"><i></i><span data-status-label>${c.frozen?'等待最近核验':d.live?'LIVE · 正在开播':'OFF AIR · 暂未开播'}</span></span><span class="status-room">ROOM 1863473244</span>${arrow}</div><div class="status-main"><h2 data-hero-title>${c.frozen?'最近一次直播状态':d.live?'煮啵正在营业。':'煮啵，何时营业？'}</h2><p data-clock-label>${c.frozen?'上次核验时的持续时间':d.live?'本次连续开播':'本次连续未开播'}</p><div class="big-clock" data-status-clock>${clock(c.status)}</div><div class="clock-units"><span>HOURS</span><span>MINUTES</span><span>SECONDS</span></div></div><div class="status-bottom"><div><strong>${esc(d.room?.title||'蠡歪的直播间')}</strong><small>最近核验 ${time(d.lastCheckedAt)}</small></div><a href="https://live.bilibili.com/1863473244" class="room-link" target="_blank" rel="noopener noreferrer">去直播间 ↗</a></div></article>`+
  card('todaylive','今日开播','sun',`<div class="metric"><span data-live-hours>${compactHours(c.live)}</span><small>小时</small></div><div class="metric-track"><i data-live-track style="--progress:${share}%"></i></div><div class="metric-note"><span>${number(t.sessionCount)} 个直播时段</span><span data-live-share>${share.toFixed(0)}% 的已记录时间</span></div>`,'stat-module')+
  card('todaylazy','今日摸鱼','moon',`<div class="metric"><span data-lazy-hours>${compactHours(c.lazy)}</span><small>小时</small></div><div class="metric-track"><i style="--progress:${100-share}%;opacity:.4" data-lazy-track></i></div><div class="metric-note"><span>已记录的未开播时间</span><span>${d.live?'暂时停止增长':'继续等待中'}</span></div>`,'stat-module')+
  card('attendance','本周出勤','chart',`<div class="metric">${number(d.week.attendanceRate)}<small>%</small></div>${smallBars(d.history)}<div class="metric-note"><span>${number(d.week.activeDays)} 天记录到开播</span><span>本周累计</span></div>`,'stat-module')+
  card('streak','连续缺席','clock',`<div class="metric">${number(d.streakDays)}<small>天</small></div><div class="metric-note"><span>连续无开播记录</span></div><div class="metric-note"><span>${number(d.streakDays)>0?'煮啵，你的观众在等你。':'今天的出勤，已经有迹可循。'}</span></div>`,'stat-module')+
  card('week','时间都去哪儿了','chart',`<p class="module-caption">近七日，开播与未开播的时间切片。</p>${chart(d.history)}`,'chart-module')+
  card('verdict','今日观察手记','eye',`<div class="note-date">${esc(t.date)} · DAILY NOTE</div><h3>${esc(v.title)}</h3><p>${esc(v.copy)}</p><div class="note-signoff"><span>来自出勤观察员</span><span>阅读完整报告 ↗</span></div>`,'note-module')+
  `<article class="glass module archive-module" role="button" tabindex="0" aria-haspopup="dialog" aria-label="展开历史档案详情" data-module="archive"><div class="calendar-symbol" aria-hidden="true">${Array.from({length:35},(_,i)=>`<i style="--o:${[.2,.4,.6,.85,.3,.95,.45][i%7]}"></i>`).join('')}</div><div><div class="eyebrow">EVERY DAY COUNTS</div><h3>${d.historyTotal} 天，都记得。</h3><p>翻阅完整台账，回看煮啵的每一天。</p></div>${arrow}</article>`+
  card('health','观察线路','signal',`<div class="health-bottom"><strong data-health-state>${c.frozen?'等待更新':'监测正常'}</strong><small>${d.checkCount.toLocaleString('zh-CN')} 次累计检测</small></div><div class="health-track" data-stale="${c.frozen}" aria-hidden="true">${'<i></i>'.repeat(29)}</div>`,'health-module');
  refreshGlass();tick();
}
function tick(){if(!state.d)return;const d=state.d,c=current(d,state.failed),share=percent(c.live,c.live+c.lazy);
  document.querySelectorAll('[data-status-clock]').forEach(el=>el.textContent=clock(c.status));
  document.querySelectorAll('[data-live-hours]').forEach(el=>el.textContent=compactHours(c.live));document.querySelectorAll('[data-lazy-hours]').forEach(el=>el.textContent=compactHours(c.lazy));
  document.querySelectorAll('[data-live-track]').forEach(el=>el.style.setProperty('--progress',`${share}%`));document.querySelectorAll('[data-lazy-track]').forEach(el=>el.style.setProperty('--progress',`${100-share}%`));
  document.querySelectorAll('[data-live-share]').forEach(el=>el.textContent=`${share.toFixed(0)}% 的已记录时间`);
  $('connection').innerHTML=`<i></i>${c.frozen?'等待更新':'监测正常'}`;$('connection').dataset.state=c.frozen?'stale':'ok';
  document.querySelectorAll('[data-health-state]').forEach(el=>el.textContent=c.frozen?'等待更新':'监测正常');
  if(c.frozen){document.querySelectorAll('[data-status-label]').forEach(el=>el.textContent='等待最近核验');document.querySelectorAll('[data-clock-label]').forEach(el=>el.textContent='上次核验时的持续时间 · 计时已暂停');if(!state.loading&&!state.failed)notice('监测数据暂未更新。当前显示最后一次记录，计时已暂停。');}
  if(c.frozen&&(media.active||media.loading))media.update(d,state.failed);
}
function notice(text=''){$('notice').hidden=!text;$('noticeText').textContent=text;}
async function loadOverview(force=false){if(state.loading)return;state.loading=true;$('refresh').disabled=true;$('refresh').classList.add('is-loading');
  try{const raw=await client.get('overview',{force,ttl:45000});if(number(raw.archiveVersion)<2)throw Error('数据接口正在更新');state.d=normalize(raw);state.failed=false;
    try{localStorage.setItem(CACHE,JSON.stringify(state.d));}catch{}
    notice();overview();$('footerStatus').textContent=`最近核验 ${time(state.d.lastCheckedAt,true)} · 北京时间`;
    media.update(state.d,false);if(state.view==='reports')loadReports();
  }catch(e){state.failed=true;notice(`${e.name==='AbortError'?'连接暂时超时':e.message}。${state.d?'保留最近记录，计时已暂停。':'稍后将自动重试。'}`);if(state.d){tick();media.update(state.d,true);}else{$('connection').innerHTML='<i></i>等待连接';$('connection').dataset.state='stale';}}
  finally{state.loading=false;$('refresh').disabled=false;$('refresh').classList.remove('is-loading');}
}
async function insights(days=state.period,force=false){const old=state.insights.get(days);if(!force&&old&&Date.now()-old.at<60000)return old.data;if(state.insightRequests.has(days))return state.insightRequests.get(days);
  const job=client.get(`insights?days=${days}`,{force,ttl:60000}).then(data=>{if(!Array.isArray(data.items)||data.items.length>days)throw Error('统计数据不完整');state.insights.set(days,{data,at:Date.now()});return data;}).finally(()=>state.insightRequests.delete(days));state.insightRequests.set(days,job);return job;
}
async function loadReports(){const period=state.period;if(!state.insights.has(period))$('reportsGrid').innerHTML='<div class="glass empty-state">正在整理这段时间的出勤记录…</div>';refreshGlass();
  try{const info=await insights(period);if(state.period!==period)return;const s=summarize(info.items);
    $('reportsGrid').innerHTML=card('trend',`近 ${period} 天开播`,'play',`<div class="metric">${compactHours(s.live)}<small>小时</small></div><p class="metric-note">${s.active} 天有开播记录 · ${s.known} 天已归档</p>`,'report-summary')+
      card('attendance','开播时间占比','chart',`<div class="metric">${s.share.toFixed(1)}<small>%</small></div><div class="metric-track"><i style="--progress:${s.share}%"></i></div><p class="metric-note">所选区间的已记录时间</p>`,'report-summary')+
      card('records','完整日日均','award',`<div class="metric">${compactHours(s.average)}<small>小时</small></div><p class="metric-note">${s.closed} 个已结束日期 · 不含今日</p>`,'report-summary')+
      card('trend','出勤曲线','chart',`<p class="module-caption">${esc(info.from)} — ${esc(info.to)} · 仅绘制已保存日期</p>${lineChart(info.items)}`,'report-wide')+
      card('distribution','煮啵的营业习惯','clock',`<p class="module-caption">已结束日期的每日开播时长分布</p>${distribution(info.items)}`,'report-side')+
      card('heatmap','把每一天点亮','calendar',`<p class="module-caption">近 ${period} 天出勤日历</p>${heatmap(info)}`,'report-half')+
      card('records','这段时间的高光','award',`<div class="note-date">${s.best?esc(s.best.date):'等待记录'}</div><h3 style="font-size:30px;font-weight:400;margin-top:10px">${s.best?duration(s.best.liveSeconds):'—'}</h3><p class="module-caption">区间内最长开播日</p><div class="note-signoff"><span>${s.reconstructed?`${s.reconstructed} 天标记为历史重算`:'每一天，均有记录可查'}</span><span>查看纪录 ↗</span></div>`,'report-half');refreshGlass();
  }catch(e){if(state.period===period){$('reportsGrid').innerHTML=`<div class="glass empty-state"><p>${esc(e.message)}</p><button class="text-button" data-action="retry-reports">重新读取统计</button></div>`;refreshGlass();}}
}
function pagination(){const h=state.history;$('prevPage').disabled=h.loading||h.page<=1;$('nextPage').disabled=h.loading||h.page>=h.pages;$('pageNumber').textContent=`${h.page} / ${h.pages}`;}
function historyMessage(text=''){$('historyMessage').textContent=text;$('historyMessage').hidden=!text;}
function renderHistory(data){const h=state.history;h.items=data.items;h.total=data.total;h.pages=data.pages;$('historyTotal').textContent=`${h.total} 天记录`;
  $('historyRows').innerHTML=h.items.length?h.items.map((d,i)=>`<div class="ledger-row" tabindex="0" role="button" aria-haspopup="dialog" aria-label="展开 ${esc(d.date)} 详情" data-module="day:${i}"><span class="ledger-date"><strong>${esc(d.date)}${d.isToday?'<em>今日</em>':''}</strong><small>${esc(d.reconstructed?'历史重算':d.rating||'当日记录')}</small></span><span class="live-value"><small class="mobile-label">开播时长</small>${duration(d.liveSeconds)}</span><span><small class="mobile-label">未开播时长</small>${duration(d.lazySeconds)}</span><span>${time(d.firstLiveAt)}</span><span>${hasNumber(d.sessionCount)?d.sessionCount:'—'}</span><span>${icon('arrow')}</span></div>`).join(''):'<p class="empty-state">所选日期范围内暂无记录。</p>';
  $('pageSummary').textContent=h.total?`第 ${(h.page-1)*h.limit+1}–${Math.min(h.page*h.limit,h.total)} 条，共 ${h.total} 条`:'暂无符合条件的记录';
  historyMessage(data.stale?'当前监测同步有延迟，以下是已经保存的历史记录。':'');pagination();refreshGlass();
}
async function loadHistory(force=false){const h=state.history;h.controller?.abort();const seq=++h.sequence;h.controller=new AbortController();const controller=h.controller,timer=setTimeout(()=>controller.abort(),12000);h.loading=true;pagination();historyMessage();$('historyRows').innerHTML='<p class="empty-state">正在翻阅这一页…</p>';
  const params=new URLSearchParams({page:String(h.page),limit:String(h.limit)});if(h.from)params.set('from',h.from);if(h.to)params.set('to',h.to);
  try{const data=await client.get(`history?${params}`,{force,signal:controller.signal});if(seq!==h.sequence)return;if(!Array.isArray(data.items)||data.items.length>h.limit||!Number.isInteger(data.total)||!Number.isInteger(data.pages))throw Error('历史数据格式异常');if(h.page>data.pages){h.page=Math.max(1,data.pages);return loadHistory(force);}renderHistory(data);}
  catch(e){if(seq===h.sequence){historyMessage(e.name==='AbortError'?'这一页读取超时，请点击查询重试。':e.message);$('historyRows').innerHTML='<p class="empty-state">这一页暂时无法读取。</p>';$('pageSummary').textContent='等待重新查询';}}
  finally{clearTimeout(timer);if(seq===h.sequence){h.loading=false;pagination();}}
}
const detailTitles={status:['LIVE OBSERVATION','此刻，煮啵在做什么'],todaylive:['TODAY’S ATTENDANCE','今日开播，逐项看'],todaylazy:['THE WAITING HOURS','等待的时间，也记得'],attendance:['ATTENDANCE REPORT','出勤这件事'],streak:['WAITING FOR YOU','连续缺席观察'],week:['SEVEN DAYS IN VIEW','这一周，时间的去向'],verdict:['DAILY OBSERVATION','今日观察手记'],archive:['THE COMPLETE ARCHIVE','那些已经记下的日子'],health:['MONITOR HEALTH','观察线路的近况'],trend:['TIME, IN PERSPECTIVE','时间拉长，再看出勤'],heatmap:['DAYS WITH A TRACE','每一天，都有自己的颜色'],distribution:['THE DAILY RHYTHM','煮啵的营业习惯'],records:['THE HIGHLIGHTS','那些认真营业的日子']};
const qualityNote='<p class="detail-note">统计以已保存记录为准。没有记录到开播，不能证明当时一定没有直播；历史重算也无法补出未被监测到的场次。</p>';
function dayDetail(day){const live=number(day.liveSeconds),lazy=number(day.lazySeconds),v=verdict(day,day.isToday&&state.d?.live&&!stale(state.d,state.failed));
  return `<p class="report-quote">${esc(v.copy)}</p><div class="day-split" role="img" aria-label="开播占已记录时间的${percent(live,live+lazy).toFixed(1)}%"><i style="--p:${percent(live,live+lazy)}%"></i><span></span></div>`+
    stats([['开播时长',duration(day.liveSeconds)],['未开播时长',duration(day.lazySeconds)],['开播时间占比',`${percent(live,live+lazy).toFixed(1)}%`],['日场次数',hasNumber(day.sessionCount)?`${day.sessionCount} 次`:'—'],['首次开播',time(day.firstLiveAt)],['最后开播记录',time(day.lastLiveAt)]])+
    section('这份记录如何理解',list([['记录日期',day.date],['统计口径',day.reconstructed?'从本机直播场次重算':'监测快照'],['已记录时间',duration(hasNumber(day.monitoredSeconds)?day.monitoredSeconds:live+lazy)],['是否仍在更新',day.isToday?'今日统计随监测更新':'已结束日期']])+qualityNote)+
    section('当日原始报告',`<p>${esc(day.report||'本日没有保存文字报告。')}</p>`);
}
function detailBody(key,info){const d=state.d;if(!d)return '<p>等待监测数据。</p>';const c=current(d,state.failed),t=d.today,s=info?summarize(info.items):null;
  if(key.startsWith('day:'))return dayDetail(state.detail.day);
  if(key==='status'){const video=media.info();return `<p>${c.frozen?'当前显示的是最近一次核验状态，计时已经暂停。':d.live?'煮啵已到岗。当前直播与当日累计分开统计，跨午夜不会丢失本场计时。':'直播间暂未开播。观察仍在继续，以下是最近一次核验到的真实状态。'}</p><div class="detail-hero-number" data-status-clock>${clock(c.status)}</div>`+stats([['当前状态',c.frozen?'等待核验':d.live?'正在直播':'未开播'],['今日开播',duration(c.live)],['今日未开播',duration(c.lazy)],['状态开始于',time(d.statusSince,true)],['最近核验',time(d.lastCheckedAt,true)],['今日直播时段',`${number(t.sessionCount)} 次`]])+section('直播间与实时背景',list([['直播间',d.room?.title||'蠡歪直播间'],['房间号','1863473244'],['背景画面',video.status],['画面尺寸',video.width?`${video.width} × ${video.height}`:'尚未读取画面'],['声音','始终静音'],['显示方式',innerWidth<innerHeight?'竖向居中裁剪，铺满窗口':'横向居中裁剪，铺满窗口']]))+`<div class="detail-actions"><a href="https://live.bilibili.com/1863473244" target="_blank" rel="noopener noreferrer">打开 B 站直播间 ↗</a><button data-action="retry-media">重新连接直播背景</button></div>`;}
  if(key==='todaylive'||key==='todaylazy'){const live=key==='todaylive';return `<p>${live?'今日营业了多久，分成了几次，以及和最近几天相比的表现。':'这里统计的是监测记录中的未开播时间。记录缺失与真正未开播需要区分。'}</p><div class="detail-hero-number">${duration(live?c.live:c.lazy)}</div>`+stats([['首次开播',time(t.firstLiveAt)],['最后开播记录',time(t.lastLiveAt)],['日场次',`${number(t.sessionCount)} 次`],['开播时间占比',`${percent(c.live,c.live+c.lazy).toFixed(1)}%`],['今日日期',t.date],['计时状态',c.frozen?'已暂停':d.live?(live?'增长中':'暂停增长'):(live?'暂停增长':'增长中')]])+section('放进七天里看看',chart(d.history))+qualityNote;}
  if(key==='verdict')return dayDetail({...t,liveSeconds:c.live,lazySeconds:c.lazy,isToday:true})+section('本周观察',`<p>${esc(d.week.report||'本周数据仍在持续记录。')}</p>`);
  if(key==='health'){const age=Math.max(0,Math.floor((Date.now()-d.lastCheckedAt)/1000));return `<p>这里展示监测是否及时、最近一次同步和累计检查次数。画面能否播放与状态监测分别处理，背景加载失败不会改变直播记录。</p>`+stats([['监测状态',c.frozen?'等待更新':'正常'],['核验距今',`${age} 秒`],['累计检查',d.checkCount.toLocaleString('zh-CN')],['累计请求错误',hasNumber(d.errorCount)?d.errorCount.toLocaleString('zh-CN'):'—'],['历史归档',`${d.historyTotal} 天`],['开始观察',d.launchAt?dateCN(d.launchAt):'—']])+section('最近同步',list([['最近检查',time(d.lastCheckedAt,true)],['最近成功',time(d.lastSuccessAt,true)],['云端接收',time(d.snapshotSavedAt,true)],['前端刷新','页面可见时约每分钟一次'],['过期处理','超过三分钟暂停外推计时']]))+'<p class="detail-note">累计检查错误不能还原每一天的实际监测覆盖范围。旧日期没有场次时，不将其解释为“整天都监测正常”。</p>';}
  if(key==='streak')return `<p class="report-quote">${number(d.streakDays)>0?'煮啵，缺席的日子已经连起来了。建议立刻停止摸鱼，尽快到岗。':'今天已经留下了开播记录。继续保持，观众都看在眼里。'}</p><div class="detail-hero-number">${number(d.streakDays)}<small>天连续无开播记录</small></div>`+section('最近一周的出勤',chart(d.history))+qualityNote;
  if(key==='week')return `<p>${esc(d.week.report||'本周开播记录持续更新中。')}</p>`+stats([['本周开播',duration(d.week.liveSeconds)],['本周未开播',duration(d.week.lazySeconds)],['本周开播占比',`${number(d.week.attendanceRate)}%`],['有开播记录',`${number(d.week.activeDays)} 天`],['周起始',d.week.weekStart||'—'],['统计截至',d.today.date]])+section('近七日记录',chart(d.history))+qualityNote;
  if(!info)return '<p class="empty-state">正在整理完整统计…</p>';
  if(key==='archive')return `<p>按日期保存的直播台账。补回的早期记录继续保留，访问页面时只读取需要的范围。</p>`+stats([['已归档',`${info.allTime.days} 天`],['最早记录',info.allTime.firstDate||'—'],['最近记录',info.allTime.lastDate||'—'],['累计记录开播',duration(number(info.allTime.liveSeconds))],['有开播记录的日期',`${number(info.allTime.activeDays)} 天`],['近90天重算日期',`${s.reconstructed} 天`]])+section('最近 90 天出勤日历',heatmap(info))+`<div class="detail-actions"><button data-action="open-history">翻阅完整历史台账 ↗</button></div>`+qualityNote;
  if(key==='heatmap')return `<p>每个方格是一日。颜色深浅对应保存的开播时长，空心格表示没有日记录。</p>`+stats([['统计区间',`${info.days} 天`],['已记录日期',`${s.known} 天`],['有开播记录',`${s.active} 天`]])+heatmap(info)+section('最近的记录',list(info.items.slice(-7).reverse().map(d=>[d.date,duration(d.liveSeconds)])))+qualityNote;
  if(key==='distribution')return `<p>按完整日期的开播总时长分组，今日仍在变化的记录不计入分布。</p>`+stats([['完整日期',`${s.closed} 天`],['完整日日均',duration(s.average)],['区间最长',s.best?duration(s.best.liveSeconds):'—']])+distribution(info.items)+qualityNote;
  if(key==='records'){const ranked=info.items.filter(d=>!d.isToday&&hasNumber(d.liveSeconds)).sort((a,b)=>b.liveSeconds-a.liveSeconds).slice(0,5);return `<p>所选区间中开播时间最长的已结束日期。这里只比较真实保存的时长，不将今日未完成的统计拿来排位。</p>`+stats([['最长开播日',s.best?.date||'—'],['单日最长',s.best?duration(s.best.liveSeconds):'—'],['完整日日均',duration(s.average)]])+section('出勤高光 · TOP 5',list(ranked.map((d,i)=>[`${pad(i+1)} · ${d.date}`,duration(d.liveSeconds)])))+section('时长分布',distribution(info.items))+qualityNote;}
  return `<p>${esc(info.from)} 至 ${esc(info.to)} 的出勤观察。开播占比按已记录的开播与未开播时长计算。</p>`+stats([['累计开播',duration(s.live)],['累计未开播',duration(s.lazy)],['开播时间占比',`${s.share.toFixed(1)}%`],['完整日日均',duration(s.average)],['有开播记录',`${s.active} 天`],['已有日记录',`${s.known} 天`]])+section('每日开播趋势',lineChart(info.items))+section('时间如何分布',distribution(info.items))+qualityNote;
}
const modal=new ModuleDialog($('detailDialog'),$('detailPanel'),$('closeDetail'));
async function openModule(node){if(!state.d)return;const key=node.dataset.module,day=key.startsWith('day:')?state.history.items[Number(key.split(':')[1])]:null;if(key.startsWith('day:')&&!day)return;const seq=++state.detailSequence;state.detail={key,day};const title=day?['DAILY ARCHIVE',day.date]:detailTitles[key]||['DETAIL','详细观察'];$('detailEyebrow').textContent=title[0];$('detailTitle').textContent=title[1];
  const needs=['attendance','archive','trend','heatmap','distribution','records'].includes(key),days=key==='archive'?90:state.view==='reports'?state.period:30,info=needs?state.insights.get(days)?.data:null;
  $('detailPanel').dataset.loading=String(needs&&!info);$('detailContent').innerHTML=detailBody(key,info);modal.show(node);refreshGlass();
  if(needs){try{const data=await insights(days);if(seq!==state.detailSequence||!$('detailDialog').open)return;modal.replaceContent(detailBody(key,data));refreshGlass();}catch(e){if(seq===state.detailSequence&&$('detailDialog').open){$('detailContent').innerHTML=`<p>${esc(e.message)}</p><button class="text-button" data-action="retry-detail">重试读取详情</button>`;}}}
}
let toastTimer;function toast(){$('pressToast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('pressToast').classList.remove('visible'),1800);}
attachModuleInteractions(document,{open:openModule,toast});
function navigate(){const key=location.hash.slice(1);state.view=['overview','reports','history'].includes(key)?key:'overview';document.querySelectorAll('.view').forEach(node=>node.hidden=node.id!==`view-${state.view}`);document.querySelectorAll('[data-view]').forEach(node=>node.dataset.view===state.view?node.setAttribute('aria-current','page'):node.removeAttribute('aria-current'));if(state.view==='history')loadHistory();if(state.view==='reports')loadReports();refreshGlass();}
$('historyFilter').addEventListener('submit',e=>{e.preventDefault();if($('dateFrom').value&&$('dateTo').value&&$('dateFrom').value>$('dateTo').value){historyMessage('起始日期不能晚于结束日期。');return;}Object.assign(state.history,{page:1,from:$('dateFrom').value,to:$('dateTo').value});loadHistory(true);});
$('resetFilter').addEventListener('click',()=>{$('dateFrom').value='';$('dateTo').value='';Object.assign(state.history,{page:1,from:'',to:''});loadHistory();});
$('pageSize').addEventListener('change',()=>{state.history.limit=Number($('pageSize').value);state.history.page=1;loadHistory();});
$('prevPage').addEventListener('click',()=>{if(!state.history.loading&&state.history.page>1){state.history.page--;loadHistory();}});$('nextPage').addEventListener('click',()=>{if(!state.history.loading&&state.history.page<state.history.pages){state.history.page++;loadHistory();}});
$('refresh').addEventListener('click',()=>{loadOverview(true);if(state.view==='history')loadHistory(true);});$('retry').addEventListener('click',()=>loadOverview(true));
document.addEventListener('click',async e=>{const period=e.target.closest('[data-period]');if(period){state.period=Number(period.dataset.period);document.querySelectorAll('[data-period]').forEach(el=>el.setAttribute('aria-pressed',String(el===period)));loadReports();}
  const action=e.target.closest('[data-action]')?.dataset.action;if(action==='retry-reports')loadReports();if(action==='retry-detail'&&modal.source)openModule(modal.source);
  if(action==='open-history'){await modal.close();location.hash='history';if(state.view==='history')loadHistory();}
  if(action==='retry-media'){media.blocked=false;media.enabled=true;media.stop();media.update(state.d,state.failed,true);modal.close();}
});
window.addEventListener('hashchange',navigate);document.addEventListener('visibilitychange',()=>{if(!document.hidden){loadOverview();if(state.view==='history')loadHistory();if(state.view==='reports')loadReports();}});
const wallpaper=$('wallpaper');paintWallpaper(wallpaper);let resizeTimer;window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>paintWallpaper(wallpaper),120);});
const media=new LiveBackground($('liveVideo'),client),contrast=new BackgroundContrast($('liveVideo'),wallpaper);
$('interactionHint').textContent=matchMedia('(pointer: coarse)').matches?'长按卡片 · 展开更多':'点击卡片 · 展开更多';
function updateDate(){$('localDate').textContent=`${new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'long',day:'numeric',weekday:'long'}).format(Date.now())} · 北京时间`;}
try{const old=localStorage.getItem(CACHE)||localStorage.getItem('liwai-overview-v2');if(old){state.d=normalize(JSON.parse(old));state.failed=true;overview();notice('正在核验最近的监测记录…');}}catch{}
updateDate();navigate();loadOverview(true);refreshGlass();
setInterval(()=>{if(!document.hidden)tick();},1000);setInterval(()=>{if(!document.hidden){updateDate();loadOverview();}},60000);
