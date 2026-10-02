// Real Codex client + isolated local OAuth/MCP fixtures. No production credentials.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createHash,randomUUID} from 'node:crypto';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createRpc} from '../plugins/taejeon-core/scripts/connection-doctor.mjs';
const binary=process.env.CODEX_FIXTURE_EXECUTABLE;
assert(binary,'CODEX_FIXTURE_EXECUTABLE must name a real native Codex binary');
const version=execFileSync(binary,['--version'],{encoding:'utf8'}).trim();
const home=mkdtempSync(join(tmpdir(),'태전 OAuth cold start '));
const codes=new Map(),access=new Set(),refresh=new Set();
let origin,exchanges=0,reads=0;
const json=(res,status,data)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(data));};
const server=createServer(async(req,res)=>{
 try {
  const url=new URL(req.url,origin);let body='';for await(const part of req)body+=part;
  if(url.pathname.startsWith('/.well-known/oauth-protected-resource'))return json(res,200,{resource:origin+'/mcp',authorization_servers:[origin],scopes_supported:['mcp:read']});
  if(url.pathname.startsWith('/.well-known/oauth-authorization-server'))return json(res,200,{issuer:origin,authorization_endpoint:origin+'/authorize',token_endpoint:origin+'/token',registration_endpoint:origin+'/register',response_types_supported:['code'],grant_types_supported:['authorization_code','refresh_token'],code_challenge_methods_supported:['S256'],token_endpoint_auth_methods_supported:['none']});
  if(url.pathname==='/register') {const input=JSON.parse(body);return json(res,201,{client_id:'fixture-public-client',...input});}
  if(url.pathname==='/authorize') {
   assert.equal(url.searchParams.get('code_challenge_method'),'S256');
   const callback=new URL(url.searchParams.get('redirect_uri'));assert(['127.0.0.1','localhost','[::1]'].includes(callback.hostname));
   const code=randomUUID();codes.set(code,{challenge:url.searchParams.get('code_challenge'),redirect:callback.href});
   callback.searchParams.set('code',code);callback.searchParams.set('state',url.searchParams.get('state'));
   res.writeHead(302,{location:callback.href});return res.end();
  }
  if(url.pathname==='/token') {
   const input=new URLSearchParams(body);
   if(input.get('grant_type')==='authorization_code') {
    const code=input.get('code'),saved=codes.get(code);assert(saved,'code once');codes.delete(code);
    assert.equal(saved.challenge,createHash('sha256').update(input.get('code_verifier')).digest('base64url'));assert.equal(saved.redirect,input.get('redirect_uri'));
   }else{assert(refresh.delete(input.get('refresh_token')),'refresh once');}
   const token=randomUUID(),next=randomUUID();access.add(token);refresh.add(next);exchanges++;
   return json(res,200,{access_token:token,refresh_token:next,token_type:'Bearer',expires_in:3600,scope:'mcp:read'});
  }
  if(url.pathname==='/mcp') {
   if(!access.has((req.headers.authorization??'').replace(/^Bearer /,''))){res.setHeader('WWW-Authenticate',`Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource"`);return json(res,401,{error:'authentication_required'});}
   if(req.method==='GET'){res.writeHead(405);return res.end();}
   const q=JSON.parse(body);if(!('id'in q)){res.writeHead(202);return res.end();}
   let result;
   if(q.method==='initialize')result={protocolVersion:'2025-03-26',capabilities:{tools:{}},serverInfo:{name:'taejeon-fixture',version:'0.4.0'}};
   else if(q.method==='tools/list')result={tools:[{name:'erp_live_sales_summary',description:'Fixture read only',inputSchema:{type:'object',properties:{},additionalProperties:true}}]};
   else if(q.method==='tools/call'){reads++;result={content:[{type:'text',text:'fixture read verified'}],structuredContent:{outcome:'complete',complete:true,lineCount:1,source:'local_fixture'}};}
   else result={};
   return json(res,200,{jsonrpc:'2.0',id:q.id,result});
  }
  json(res,404,{error:'not_found'});
 }catch{json(res,400,{error:'fixture_validation_failed'});}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
origin='http://127.0.0.1:'+server.address().port;
writeFileSync(join(home,'config.toml'),`mcp_oauth_credentials_store = "file"\n[mcp_servers.taejeon-fixture]\nurl = "${origin}/mcp"\n`);
const env={...process.env,CODEX_HOME:home};let rpc;
const start=async()=>{const client=createRpc({file:binary,env,timeoutMs:20000});await client.request('initialize',{clientInfo:{name:'taejeon-ci-fixture',version:'1.0.0'},capabilities:{experimentalApi:true}});client.notify('initialized');return client;};
try {
 rpc=await start();
 const login=await rpc.request('mcpServer/oauth/login',{name:'taejeon-fixture',timeoutSecs:20,clientRegistration:'dcr'});
 // Simulate consent only against our local fixture. No browser/company login.
 assert.equal(new URL(login.authorizationUrl).origin,origin);
 await fetch(login.authorizationUrl);
 for(let i=0;i<100&&exchanges===0;i++)await new Promise(resolve=>setTimeout(resolve,50));
 assert(exchanges>0,'OAuth token exchange reached fixture');
 await new Promise(resolve=>setTimeout(resolve,500));await rpc.close();rpc=null;
 // Cold start must load its own persisted credentials without authorizing again.
 rpc=await start();
 const status=await rpc.request('mcpServerStatus/list',{serverName:'taejeon-fixture',detail:'toolsAndAuthOnly'});
 const row=status.data.find(x=>x.name==='taejeon-fixture');assert.equal(row.authStatus,'oAuth');assert(!row.toolsError,'cold start discovery must succeed');
 assert(Object.values(row.tools??{}).some(x=>x.name==='erp_live_sales_summary')||Object.hasOwn(row.tools??{},'erp_live_sales_summary'));
 const started=await rpc.request('thread/start',{cwd:home,ephemeral:true});
 const read=await rpc.request('mcpServer/tool/call',{server:'taejeon-fixture',threadId:started.thread.id,tool:'erp_live_sales_summary',arguments:{}});
 assert(!read.isError);assert.equal(read.structuredContent?.source,'local_fixture');assert(reads>0);
 console.log(JSON.stringify({platform:process.platform,codexVersion:version,oauthFixture:'verified',coldStart:'verified',read:'verified',credentialBackend:'isolated_file',productionCredentials:false}));
}finally{await rpc?.close();await new Promise(resolve=>server.close(resolve));rmSync(home,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
