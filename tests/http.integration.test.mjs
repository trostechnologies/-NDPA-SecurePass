import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { mkdtempSync, readdirSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));

test('real HTTP server enforces authentication, Origin, JSON limits and persisted check-in',async()=>{
  const listener=createServer();listener.listen(0,'127.0.0.1');await once(listener,'listening');
  const port=listener.address().port;await new Promise(resolve=>listener.close(resolve));
  const origin=`http://127.0.0.1:${port}`;
  const dir=mkdtempSync(path.join(tmpdir(),'securepass-http-'));
  const child=spawn(process.execPath,['server.mjs'],{cwd:root,windowsHide:true,env:{...process.env,NODE_ENV:'development',HOST:'127.0.0.1',PORT:String(port),SECUREPASS_ORIGIN:origin,SECUREPASS_DATA_DIR:dir,SECUREPASS_COOKIE_SECURE:'false',SECUREPASS_ADMIN_EMAIL:'http-admin@example.test',SECUREPASS_ADMIN_PASSWORD:'unique-http-test-password-12345',SECUREPASS_NOTICE_VERSION:'http-test-1'},stdio:['ignore','pipe','pipe']});
  let diagnostics='';let connectionError='';
  child.stderr.on('data',data=>{diagnostics=(diagnostics+data).slice(-2000);});
  child.stdout.on('data',data=>{diagnostics=(diagnostics+data).slice(-2000);});
  const exited=once(child,'exit');
  const send=(route,body,headers={})=>fetch(origin+route,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...headers},body:typeof body==='string'?body:JSON.stringify(body)});
  try{
    let ready=false;
    for(let n=0;n<200;n++){
      if(child.exitCode!==null)throw Error(`Server exited: ${diagnostics}`);
      try{if((await fetch(origin+'/api/health')).ok){ready=true;break;}}catch(e){connectionError=String(e.cause||e);}
      await new Promise(resolve=>setTimeout(resolve,50));
    }
    assert.ok(ready,`Server did not start: ${diagnostics}; ${connectionError}`);
    assert.equal((await fetch(origin+'/api/users')).status,401);
    assert.equal((await send('/api/login',{}, {Origin:'https://other.example'})).status,403);
    assert.equal((await send('/api/checkin','{')).status,400);
    assert.equal((await send('/api/checkin',{fullName:'x'.repeat(17000)})).status,413);
    const response=await send('/api/login',{email:' HTTP-ADMIN@EXAMPLE.TEST ',password:'unique-http-test-password-12345'});
    assert.equal(response.status,200);assert.match(response.headers.get('set-cookie'),/HttpOnly; SameSite=Strict/);
    const cookie=response.headers.get('set-cookie').split(';')[0];
    const hosts=await (await fetch(origin+'/api/hosts')).json();
    const saved=await send('/api/checkin',{fullName:'HTTP Guest',email:'http-guest@example.test',phone:'12345678',hostEmployeeId:hosts[0].id,generalConsentGranted:true,noticeVersion:'http-test-1'});
    assert.equal(saved.status,201);const visitor=await saved.json();
    const state=await (await fetch(origin+'/api/data',{headers:{Cookie:cookie}})).json();assert.equal(state.visitors[0].id,visitor.id);
    assert.equal((await send('/api/logout',{}, {Cookie:cookie})).status,200);
    assert.equal((await fetch(origin+'/api/session',{headers:{Cookie:cookie}})).status,401);
    assert.equal((await send('/api/unknown',{})).status,404);
  }finally{
    child.kill();await exited;
    for(const file of readdirSync(dir))unlinkSync(path.join(dir,file));rmdirSync(dir);
  }
});
