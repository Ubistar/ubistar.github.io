import test from 'node:test';
import assert from 'node:assert/strict';
import {extractStreams} from '../cloudflare/functions/v1/stream.js';
import {coverCrop,allowedMediaURL} from '../lib/media.js';
const response=(host='https://example.bilivideo.com/')=>({code:0,data:{live_status:1,playurl_info:{playurl:{stream:[{protocol_name:'http_hls',format:[{format_name:'fmp4',codec:[{codec_name:'avc',current_qn:400,base_url:'live/test.m3u8',url_info:[{host,extra:'?expires=9999999999'}]}]}]}]}}}});
test('extracts only AVC HLS on HTTPS Bilibili CDN; rejects unrelated hosts and credentials',()=>{
  assert.equal(extractStreams(response()).length,1);
  for(const host of ['http://example.bilivideo.com/','https://bilivideo.com.attacker.test/','https://user:secret@example.bilivideo.com/','https://127.0.0.1/'])assert.equal(extractStreams(response(host)).length,0);
  assert.equal(extractStreams({...response(),code:-352}).length,0);
  assert.equal(allowedMediaURL('https://test.bilivideo.cn/segment.m4s'),true);
  assert.equal(allowedMediaURL('https://test.bilivideo.com:444/x'),false);
});
test('cover crops landscape video to portrait or landscape viewports without letterboxing',()=>{
  for(const [vw,vh,pw,ph] of [[1920,1080,390,844],[1920,1080,1440,900],[720,1280,1440,900]]){
    const c=coverCrop(vw,vh,pw,ph);assert.ok(Math.abs(c.width/c.height-pw/ph)<1e-9);assert.ok(c.x>=0&&c.y>=0);assert.ok(c.width<=vw&&c.height<=vh);
  }
});
