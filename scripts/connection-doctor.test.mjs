import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const module = await import('../plugins/taejeon-core/scripts/connection-doctor.mjs').catch(() => ({}));
test('unknown runtime with a cached catalog is not ready',()=>assert.equal(module.classifyConnection({authStatus:'oAuth',runtimeStatus:null,tools:{erp_live_sales_summary:{name:'erp_live_sales_summary'}}}).canQuerySales,false));
test('accepts the Core alphanumeric code contract',()=>assert.deepEqual(module.validateSalesRequest({custno:['E0000'],from:'2026-09-01',to:'2026-09-30'}).custno,['E0000']));

test('authentication-required initialization cannot become empty sales or ready', () => {
  assert.equal(typeof module.classifyConnection, 'function', 'connection diagnosis is missing');
  const result = module.classifyConnection({authStatus:'notLoggedIn', tools:{}, toolsError:'Auth required, when send initialize request'});
  assert.equal(result.stage, 'authentication');
  assert.equal(result.canQuerySales, false);
});
test('valid OAuth with no catalog reports discovery failure rather than missing ERP data', () => {
  assert.equal(typeof module.classifyConnection, 'function');
  assert.equal(module.classifyConnection({authStatus:'oAuth',tools:{},toolsError:'connection closed'}).stage,'discovery');
});
test('connected catalog without sales tool reports capability unavailable', () => {
  assert.equal(typeof module.classifyConnection, 'function');
  assert.equal(module.classifyConnection({authStatus:'oAuth',tools:{erp_data_catalog:{}}}).stage,'sales_tool_missing');
});
test('sales is ready only when its authenticated catalog is available', () => {
  assert.equal(typeof module.classifyConnection, 'function');
  assert.equal(module.classifyConnection({authStatus:'oAuth',runtimeStatus:'connected',tools:{erp_live_sales_summary:{}}}).canQuerySales,true);
  assert.equal(module.classifyConnection({authStatus:'unknown',tools:{erp_live_sales_summary:{}}}).canQuerySales,false);
});
test('explicit and host-provided executables precede fallback paths on both platforms', () => {
  assert.equal(typeof module.codexCandidates, 'function');
  for (const platform of ['darwin','win32']) {
    const candidates=module.codexCandidates({explicit:'chosen',env:{CODEX_CLI_PATH:'host'},platform});
    assert.deepEqual(candidates.slice(0,2),['chosen','host']);
  }
});
test('diagnostic output excludes raw headers, tokens and catalog tool metadata', () => {
  assert.equal(typeof module.classifyConnection, 'function');
  const output=JSON.stringify(module.classifyConnection({authStatus:'oAuth',tools:{erp_live_sales_summary:{_meta:{token:'secret'}}},toolsError:'Bearer secret'}));
  assert.equal(output.includes('secret'),false);
});
test('failed or partial sales cannot report a verified complete result', () => {
  assert.equal(typeof module.summarizeSales, 'function');
  const wrap=x=>({content:[{type:'text',text:`<<<TAEJEON_UNTRUSTED_ERP_DATA>>>${JSON.stringify(x)}<<<END_TAEJEON_UNTRUSTED_ERP_DATA>>>`} ]});
  assert.equal(module.summarizeSales(wrap({complete:false,lineCount:0,outcome:'failed'})).stage,'sales_failed');
  assert.equal(module.summarizeSales(wrap({complete:false,lineCount:2,outcome:'partial'})).stage,'sales_partial');
  assert.equal(module.summarizeSales(wrap({complete:true,lineCount:0,outcome:'empty_verified'})).stage,'sales_empty_verified');
});
test('a cached catalog while connection is starting cannot authorize sales',()=>{
  assert.equal(module.classifyConnection({authStatus:'oAuth',runtimeStatus:'starting',tools:{erp_live_sales_summary:{}}}).canQuerySales,false);
});
test('verified request retains leading zeros and rejects invalid dates and extra actions',()=>{
  assert.deepEqual(module.validateSalesRequest({custno:['00001'],from:'2026-09-01',to:'2026-09-30'}),{custno:['00001'],from:'2026-09-01',to:'2026-09-30',detail:'lines'});
  assert.throws(()=>module.validateSalesRequest({custno:['00001'],from:'2026-02-30',to:'2026-09-30'}));
  assert.throws(()=>module.validateSalesRequest({custno:['00001'],from:'2026-09-01',to:'2026-09-30',command:'reset'}));
});
test('fragment completion is never whole-request completion',()=>{
  const result=module.summarizeSales({structuredContent:{extra:{complete:true,collectionScope:'recovery_fragment',totalKrw:'100',lineCount:2}}});
  assert.equal(result.stage,'sales_fragment');assert.equal(result.complete,false);assert.equal(result.totalKrw,null);
});
test('JSON-RPC matches responses around notifications using real child I/O',async()=>{
  const code=`const r=require('node:readline').createInterface({input:process.stdin});r.on('line',l=>{const q=JSON.parse(l);if(q.id){console.log('not JSON');console.log(JSON.stringify({method:'progress',params:{}}));console.log(JSON.stringify({id:q.id,result:{method:q.method}}));}});`;
  const rpc=module.createRpc({file:process.execPath,args:['-e',code],timeoutMs:1000});
  try{assert.deepEqual(await rpc.request('initialize',{}),{method:'initialize'});assert.deepEqual(await rpc.request('mcpServerStatus/list',{}),{method:'mcpServerStatus/list'});}finally{rpc.close();}
});
test('silent subprocess has a bounded timeout and is closed',async()=>{
  const rpc=module.createRpc({file:process.execPath,args:['-e','process.stdin.resume()'],timeoutMs:80});
  try{await assert.rejects(rpc.request('initialize',{}),/bounded_timeout/);}finally{rpc.close();}
});
test('subprocess exit rejects outstanding requests',async()=>{
  const rpc=module.createRpc({file:process.execPath,args:['-e','process.exit(1)'],timeoutMs:1000});
  try{await assert.rejects(rpc.request('initialize',{}),/app_server_closed/);}finally{rpc.close();}
});
test('CLI usage validation does not invoke a configured executable',()=>{
  const script=new URL('../plugins/taejeon-core/scripts/connection-doctor.mjs',import.meta.url);
  assert.throws(()=>execFileSync(process.execPath,[fileURLToPath(script),'--thread','chat'],{stdio:'ignore'}));
});
