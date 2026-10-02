import {spawn, execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {createInterface} from 'node:readline';
import {fileURLToPath} from 'node:url';
import {resolve,dirname,join} from 'node:path';
import {existsSync} from 'node:fs';

const server='taejeon-core';
const salesTool='erp_live_sales_summary';
/** Resolve official npm native payloads without executing a Windows shell wrapper. */
export function nativeNpmCandidates(env=process.env, platform=process.platform) {
  const triple=platform==='win32'?(process.arch==='arm64'?'aarch64-pc-windows-msvc':'x86_64-pc-windows-msvc'):platform==='darwin'?(process.arch==='arm64'?'aarch64-apple-darwin':'x86_64-apple-darwin'):(process.arch==='arm64'?'aarch64-unknown-linux-musl':'x86_64-unknown-linux-musl');
  const executable=platform==='win32'?'codex.exe':'codex';
  const packageName=platform==='win32'?(process.arch==='arm64'?'codex-win32-arm64':'codex-win32-x64'):platform==='darwin'?(process.arch==='arm64'?'codex-darwin-arm64':'codex-darwin-x64'):(process.arch==='arm64'?'codex-linux-arm64':'codex-linux-x64');
  return (env.PATH??env.Path??'').split(platform==='win32'?';':':').flatMap(dir=>[
    join(dir,'node_modules','@openai',packageName),
    join(dirname(dir),'lib','node_modules','@openai',packageName),
    join(dir,'node_modules','@openai','codex','node_modules','@openai',packageName),
    join(dirname(dir),'lib','node_modules','@openai','codex','node_modules','@openai',packageName),
    join(dir,'node_modules','@openai','codex'),
  ].flatMap(root=>['bin','codex'].map(folder=>join(root,'vendor',triple,folder,executable)))).filter(path=>existsSync(path));
}
export function codexCandidates({explicit,env=process.env,platform=process.platform}={}) {
  return [...new Set([explicit,env.CODEX_CLI_PATH,
    ...(platform==='darwin'?['/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex']:[]),
    ...nativeNpmCandidates(env,platform),...(platform==='win32'?['codex.exe']:['codex'])].filter(Boolean))];
}
export function classifyConnection(row) {
  const toolNames=Object.values(row.tools??{}).map(x=>x.name).filter(Boolean);
  // Some app-server versions key the catalog by the unqualified tool name.
  const hasSales=toolNames.includes(salesTool)||Object.hasOwn(row.tools??{},salesTool);
  let stage;
  if(row.authStatus==='notLoggedIn'||row.runtimeStatus==='authenticationRequired'||/Auth required/i.test(row.toolsError??'')) stage='authentication';
  else if(row.toolsError||['failed','cancelled','disabled'].includes(row.runtimeStatus)) stage='discovery';
  else if(row.runtimeStatus&&row.runtimeStatus!=='connected') stage='connection_not_ready';
  else if(!['oAuth','bearerToken'].includes(row.authStatus)) stage='authentication_unconfirmed';
  else if(row.runtimeStatus!=='connected') stage='connection_unconfirmed';
  else if(!hasSales) stage='sales_tool_missing';
  else stage='ready';
  return {stage,canQuerySales:stage==='ready',salesToolAdvertised:hasSales,authStatus:row.authStatus??'unknown',
    runtimeStatus:row.runtimeStatus??null,toolCount:Object.keys(row.tools??{}).length,
    serverVersion:row.serverInfo?.version??null};
}
/** Bounded discovery settling; auth and terminal failures are never retried here. */
export async function readSettledCatalog(rpc, params, sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))) {
  let result;
  for(let attempt=0;attempt<3;attempt++) {
    result=await rpc.request('mcpServerStatus/list',{...params,detail:'full'});
    const row=result.data?.find(x=>x.name===server);
    const state=classifyConnection(row??{});
    if(!row||row.toolsError||state.stage==='authentication'||!['oAuth','bearerToken'].includes(row.authStatus)||Object.keys(row.tools??{}).length||['failed','cancelled','disabled'].includes(row.runtimeStatus))break;
    if(attempt<2)await sleep(500);
  }
  return result;
}
export function canAttemptRead(state) {
  // Only an explicit verified read can settle unknown runtime; the call itself rechecks server authorization.
  return state.canQuerySales||(state.stage==='connection_unconfirmed'&&state.salesToolAdvertised);
}
export function summarizeSales(result) {
  let data=result.structuredContent;
  if(!data) for(const item of result.content??[]) {
    if(item.type!=='text')continue;
    const open='<<<TAEJEON_UNTRUSTED_ERP_DATA>>>', close='<<<END_TAEJEON_UNTRUSTED_ERP_DATA>>>';
    const start=item.text.indexOf(open),end=item.text.indexOf(close,start+open.length);
    if(start<0||end<0)continue;
    try {data=JSON.parse(item.text.slice(start+open.length,end));break;}catch{}
  }
  const summary=data?.extra??data;
  if(result.isError||summary?.outcome==='failed')return {stage:'sales_failed',complete:false};
  if(!summary||typeof summary.complete!=='boolean')return {stage:'sales_contract_unconfirmed',complete:false};
  const fragment=summary.collectionScope==='recovery_fragment';
  const stage=fragment?'sales_fragment':!summary.complete?'sales_partial':summary.outcome==='empty_verified'?'sales_empty_verified':'sales_complete';
  return {stage,complete:summary.complete&&!fragment,lineCount:summary.lineCount??null,
    totalKrw:summary.complete&&!fragment?summary.totalKrw??null:null,
    observedSubtotalKrw:summary.observedSubtotalKrw??null,source:summary.source??null,
    fetchedAt:summary.fetchedAt??null,sourceAsOf:summary.sourceAsOf??null,
    missingJobs:(summary.coverage??[]).filter(x=>x.state!=='complete').length};
}
export function createRpc({file,args=['app-server','--stdio'],timeoutMs=45000,env=process.env}) {
  const child=spawn(file,args,{stdio:['pipe','pipe','pipe'],shell:false,windowsHide:true,env});
  const pending=new Map();let sequence=0;let closed=false;
  const rejectAll=()=>{closed=true;for(const item of pending.values()){clearTimeout(item.timer);item.reject(new Error('app_server_closed'));}pending.clear();};
  child.on('error',rejectAll);child.on('exit',rejectAll);child.stdin.on('error',rejectAll);
  // Drain diagnostics without printing raw config, URLs, headers or credentials.
  child.stderr.resume();
  const lines=createInterface({input:child.stdout});
  lines.on('line',line=>{
    let message;try{message=JSON.parse(line);}catch{return;}
    if(message.method){
      // No automatic browser login, consent, elicitation or approval handling.
      if(Object.hasOwn(message,'id'))child.stdin.write(JSON.stringify({id:message.id,error:{code:-32601,message:'Interactive action requires the user in the original client'}})+'\n');
      return;
    }
    const item=pending.get(message.id);if(!item)return;
    pending.delete(message.id);clearTimeout(item.timer);
    if(message.error)item.reject(new Error('rpc_request_failed'));else item.resolve(message.result);
  });
  return {
    request(method,params,requestTimeoutMs=timeoutMs){return new Promise((resolveResult,reject)=>{
      if(closed){reject(new Error('app_server_closed'));return;}
      const id=++sequence;
      const timer=setTimeout(()=>{pending.delete(id);reject(new Error('bounded_timeout'));},requestTimeoutMs);
      pending.set(id,{resolve:resolveResult,reject,timer});
      child.stdin.write(JSON.stringify({id,method,params})+'\n');
    });},
    notify(method){child.stdin.write(JSON.stringify({method})+'\n');},
    close(){
      lines.close();rejectAll();
      return new Promise(resolveClosed=>{
        if(child.exitCode!==null||child.signalCode!==null){resolveClosed();return;}
        const timer=setTimeout(()=>{child.kill();resolveClosed();},2000);
        child.once('exit',()=>{clearTimeout(timer);resolveClosed();});
        // Let the host release files and OS jobs before bounded forced termination.
        child.stdin.end();
      });
    }
  };
}
export function validateSalesRequest(input) {
  if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('invalid_sales_request');
  const allowed=['custno','from','to','detail','companies'];
  if(Object.keys(input).some(k=>!allowed.includes(k)))throw new Error('invalid_sales_request');
  if(!Array.isArray(input.custno)||!input.custno.length||input.custno.length>1000||input.custno.some(x=>typeof x!=='string'||! /^[A-Za-z0-9]{1,5}$/.test(x)))throw new Error('verified_customer_codes_required');
  for(const date of [input.from,input.to])if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)throw new Error('invalid_period');
  if(input.from>input.to||Date.parse(input.to)-Date.parse(input.from)>365*86400000)throw new Error('invalid_period');
  if(input.detail!==undefined&&!['products','lines'].includes(input.detail))throw new Error('invalid_detail');
  if(input.companies!==undefined&&(!Array.isArray(input.companies)||!input.companies.length||input.companies.length>4||input.companies.some(x=>!['1','2','3','5'].includes(x))))throw new Error('invalid_companies');
  return {...input,detail:input.detail??'lines'};
}
export async function main(argv=process.argv.slice(2)) {
  const options={};
  for(let i=0;i<argv.length;i++) {
    if(!['--codex','--thread','--sales-args'].includes(argv[i])||!argv[i+1])throw new Error('usage');
    options[argv[i].slice(2)]=argv[++i];
  }
  if(Boolean(options.thread)!==Boolean(options['sales-args']))throw new Error('thread_and_sales_args_required_together');
  const query=options['sales-args']?validateSalesRequest(JSON.parse(readFileSync(options['sales-args'],'utf8'))):null;
  const report={executionEnvironment:process.env.WSL_DISTRO_NAME?'wsl':process.env.SSH_CONNECTION?'ssh':'local',platform:process.platform,operation:'read_only',evidenceScope:'independent_process',checkedAt:new Date().toISOString()};
  let binary;
  for(const candidate of codexCandidates({explicit:options.codex})) {
    // Windows npm .cmd wrappers require shell execution. Use the real executable.
    if(/\.(cmd|bat)$/i.test(candidate))continue;
    if(options.codex&&candidate!==options.codex)break;
    try {report.codexVersion=execFileSync(candidate,['--version'],{encoding:'utf8',timeout:10000,stdio:['ignore','pipe','ignore']}).trim();binary=candidate;break;}catch{}
  }
  if(!binary)return {...report,stage:'executable_unavailable',canQuerySales:false};
  report.executable=binary;
  try {
    const listing=JSON.parse(execFileSync(binary,['plugin','list','--marketplace','taejeon','--json'],{encoding:'utf8',timeout:20000,stdio:['ignore','pipe','ignore']}));
    const plugin=listing.installed?.find(x=>x.pluginId==='taejeon-core@taejeon');
    report.plugin={installed:!!plugin,enabled:plugin?.enabled??false,version:plugin?.version??null};
    if(!plugin||!plugin.enabled)return {...report,stage:'plugin_unavailable',canQuerySales:false};
  } catch{return {...report,stage:'configuration_or_cli_failure',canQuerySales:false};}
  const rpc=createRpc({file:binary});
  let phase='initialize';
  try {
    await rpc.request('initialize',{clientInfo:{name:'taejeon-connection-doctor',version:'0.1.0'},capabilities:{experimentalApi:true}});
    rpc.notify('initialized');phase='discovery';
    let result=await readSettledCatalog(rpc,{serverName:server});
    const row=result.data?.find(x=>x.name===server);
    if(!row)return {...report,stage:'server_unavailable',canQuerySales:false};
    const state=classifyConnection(row);
    if(!canAttemptRead(state)||!query)return {...report,...state};
    // Resume only the explicit existing local chat. No new chat or model turn.
    phase='thread_binding';
    await rpc.request('thread/resume',{threadId:options.thread});
    result=await readSettledCatalog(rpc,{serverName:server,threadId:options.thread});
    const bound=classifyConnection(result.data?.find(x=>x.name===server)??{});
    if(!canAttemptRead(bound))return {...report,...bound};
    phase='sales_call';
    const sales=await rpc.request('mcpServer/tool/call',{server,threadId:options.thread,tool:salesTool,arguments:query},75000);
    const summary=summarizeSales(sales);
    const readVerified=!sales.isError&&summary.source&&['sales_complete','sales_empty_verified','sales_partial','sales_fragment'].includes(summary.stage);
    return {...report,...bound,...(readVerified?{stage:'ready',canQuerySales:true}:{}),sales:summary};
  } catch(error){return {...report,stage:`${phase}_failed`,canQuerySales:false,errorCategory:error.message==='bounded_timeout'?'timeout':'client_protocol_failure'};}
  finally{await rpc.close();}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  main().then(report=>{
    console.log(JSON.stringify(report,null,2));
    process.exitCode=report.stage==='ready'&&(!report.sales||['sales_complete','sales_empty_verified'].includes(report.sales.stage))?0:2;
  }).catch(()=>{console.error('Usage: node connection-doctor.mjs [--codex EXECUTABLE] [--thread EXISTING_LOCAL_CHAT --sales-args VERIFIED_QUERY_JSON]');process.exitCode=2;});
}
