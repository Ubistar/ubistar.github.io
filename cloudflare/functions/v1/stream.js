import { json, readSnapshot, ROOM_ID } from '../_shared.js';

// Only resolve this station's public playback metadata. Media bytes always go
// from Bilibili's CDN to the visitor; this is not a video proxy or URL fetcher.
export function extractStreams(body) {
  if (body?.code !== 0 || body?.data?.live_status !== 1) return [];
  const found = [];
  for (const stream of body.data.playurl_info?.playurl?.stream || []) {
    if (stream.protocol_name !== 'http_hls') continue;
    for (const format of stream.format || []) {
      for (const codec of format.codec || []) {
        if (codec.codec_name !== 'avc') continue;
        for (const info of codec.url_info || []) {
          try {
            const url = new URL(info.host + codec.base_url + info.extra);
            if (url.protocol !== 'https:' || !/(^|\.)bilivideo\.(com|cn)$/.test(url.hostname) ||
                url.username || url.password || url.port || !url.pathname.endsWith('.m3u8')) continue;
            if (!found.some(item => item.url === url.href)) found.push({ url: url.href,
              format: format.format_name, quality: codec.current_qn, codec: 'avc' });
          } catch { /* Ignore malformed upstream candidates. */ }
        }
      }
    }
  }
  return found.sort((a,b) => Number(b.format === 'fmp4') - Number(a.format === 'fmp4')).slice(0,3);
}

export async function onRequestGet({ env }) {
  if (!env.DB) return json({ available: false, reason: '监测服务暂不可用' }, 503);
  try {
    const snapshot = await readSnapshot(env);
    if (!snapshot || snapshot.stale || !snapshot.payload.live)
      return json({ available: false, reason: snapshot?.stale ? '等待直播状态核验' : '当前未开播' });
    const endpoint = new URL('https://api.live.bilibili.com/xlive/web-room/v2/index/getRoomPlayInfo');
    endpoint.search = new URLSearchParams({room_id:ROOM_ID,protocol:'1',format:'1,2',codec:'0',
      qn:'400',platform:'web',ptype:'8'}).toString();
    const response = await fetch(endpoint, { headers: { Accept:'application/json',
      'User-Agent':'LiWaiMonitor/3.0', Referer:`https://live.bilibili.com/${ROOM_ID}` },
      signal:AbortSignal.timeout(8000), cf:{cacheTtl:30,cacheEverything:true} });
    if (!response.ok) {
      console.warn('Bilibili play-info failed', {
        roomId: ROOM_ID,
        upstreamStatus: response.status
      });
      return json({
        available: false,
        reason: `获取直播地址失败：B站接口返回 HTTP ${response.status}`,
        upstreamStatus: response.status
      }, 503);
    }

    const body = await response.json();
    if (body.code !== 0) {
      console.warn('Bilibili play-info rejected', {
        roomId: ROOM_ID,
        upstreamCode: body.code
      });
      return json({
        available: false,
        reason: `获取直播地址失败：B站业务错误码 ${body.code}`,
        upstreamCode: body.code
      }, 503);
    }

    const streams = extractStreams(body);
    if (!streams.length) return json({available:false,reason:'直播画面暂不可用'},503);
    const expires = streams.map(item=>Number(new URL(item.url).searchParams.get('expires'))*1000).filter(x=>x>Date.now());
    return json({available:true,roomId:ROOM_ID,streams,
      expiresAt:Math.min(Date.now()+300000,...expires), resolvedAt:Date.now()},200,
      {'Cache-Control':'public, max-age=20, s-maxage=30'});
  } catch { return json({available:false,reason:'直播画面连接暂不可用'},503); }
}
