import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as crypto from 'node:crypto';
import { promisify } from 'node:util';
import { DatabaseSync } from 'node:sqlite';
import { stripTypeScriptTypes } from 'node:module';

const root=new URL('../',import.meta.url);
// Execute actual server code, SQL and middleware against a temporary SQLite database.
// Only the Express transport/parser and listening socket are replaced. HTTP/browser tests
// remain separate checks; this harness does not claim to reproduce Express itself.
async function fixture(directory){
 const dir=directory||fs.mkdtempSync(path.join(os.tmpdir(),'securepass-security-'));
 const uses=[],routes=new Map();
 const app={disable(){},set(){},listen(){}};
 app.use=(...args)=>{const prefix=typeof args[0]==='string'?args.shift():'';for(const fn of args)if(fn.length!==4)uses.push({prefix,fn});};
 for(const method of ['get','post','patch','delete'])app[method]=(route,...handlers)=>routes.set(`${method.toUpperCase()} ${route}`,[...uses.filter(x=>route.startsWith(x.prefix)).map(x=>x.fn),...handlers]);
 const express=()=>app;express.json=()=> (_req,_res,next)=>next();express.static=()=> (_req,_res,next)=>next();
 const env={SECUREPASS_DATA_DIR:dir,SECUREPASS_MAX_RECORDS:'100',SECUREPASS_MAX_AUDITS:'20',SECUREPASS_ORIGIN:'http://localhost:3000',SECUREPASS_COOKIE_SECURE:'false',SECUREPASS_ADMIN_EMAIL:'admin@example.test',SECUREPASS_ADMIN_PASSWORD:'unique-password-for-test-only-123'};
 const context={express,DatabaseSync,...crypto,promisify,Buffer,mkdirSync:fs.mkdirSync,chmodSync:fs.chmodSync,readFileSync:fs.readFileSync,path,process:{env},URL,console:{log(){},error(){}},setInterval:()=>({unref(){}})};
 const source=fs.readFileSync(new URL('server.mjs',root),'utf8').replace(/^import .*;\r?\n/gm,'').replaceAll('import.meta.url',JSON.stringify(new URL('server.mjs',root).href));
 const runtime=await vm.runInNewContext(`(async()=>{${source}\nreturn {db,purge,consume};})()`,context);
 async function request(method,url,{body={},cookie='',origin=env.SECUREPASS_ORIGIN,ip='127.0.0.1'}={}){
  const u=new URL(url,env.SECUREPASS_ORIGIN);let match=routes.get(`${method} ${u.pathname}`),params={};
  if(!match)for(const [key,stack]of routes){const [m,route]=key.split(' ');const names=[];const pattern=route.replace(/:([^/]+)/g,(_,n)=>{names.push(n);return '([^/]+)';});const found=u.pathname.match(new RegExp(`^${pattern}$`));if(m===method&&found){match=stack;params=Object.fromEntries(names.map((n,i)=>[n,found[i+1]]));break;}}
  assert.ok(match,`No route ${method} ${url}`);
  const req={method,body,ip,headers:{cookie},params,query:Object.fromEntries(u.searchParams),get:n=>n.toLowerCase()==='origin'?origin:undefined};
  const res={code:200,headers:{},status(n){this.code=n;return this;},setHeader(n,v){this.headers[n.toLowerCase()]=v;},json(v){this.body=JSON.parse(JSON.stringify(v));return this;}};
  async function run(i){if(i>=match.length)return;let pending;await match[i](req,res,e=>{pending=e?Promise.reject(e):run(i+1);return pending;});if(pending)await pending;}
  await run(0);return res;
 }
 const login=()=>request('POST','/api/login',{body:{email:env.SECUREPASS_ADMIN_EMAIL,password:env.SECUREPASS_ADMIN_PASSWORD}});
 const cleanup=()=>{runtime.db.close();for(const suffix of ['','-wal','-shm']){const file=path.join(dir,'securepass.sqlite'+suffix);if(fs.existsSync(file))fs.unlinkSync(file);}fs.rmdirSync(dir);};
 return {...runtime,request,login,cleanup,dir,env};
}

test('authentication, immutable host ownership, redemption and linked erasure',async()=>{
 const f=await fixture();try{
  assert.equal((await f.request('GET','/api/users')).code,401);
  assert.equal((await f.request('POST','/api/login',{origin:'https://other.test'})).code,403);
  const logged=await f.login();assert.equal(logged.code,200);
  const cookie=logged.headers['set-cookie'].split(';')[0];assert.match(logged.headers['set-cookie'],/HttpOnly; SameSite=Strict/);
  const staff=await f.request('POST','/api/users',{cookie,body:{name:'Same Display Name',email:'staff@example.test',password:'test-staff-password-12345',role:'staff'}});assert.equal(staff.code,201);
  const staffLogin=await f.request('POST','/api/login',{body:{email:'staff@example.test',password:'test-staff-password-12345'}});const staffCookie=staffLogin.headers['set-cookie'].split(';')[0];
  assert.equal((await f.request('GET','/api/users',{cookie:staffCookie})).code,403);
  const hosts=(await f.request('GET','/api/hosts')).body;assert.equal(hosts.find(h=>h.id===staff.body.id).userId,staff.body.id);
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Lagos',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const inviteBody={guestName:'Guest',guestEmail:'guest@example.test',hostEmployeeId:staff.body.id,expectedDate:today,expectedTime:'12:00'};
  assert.equal((await f.request('POST','/api/invitations',{cookie:staffCookie,body:{...inviteBody,hostEmployeeId:logged.body.user.id}})).code,403);
  assert.equal((await f.request('POST','/api/invitations',{cookie:staffCookie,body:{...inviteBody,photoUrl:'sensitive'}})).code,400);
  const invite=await f.request('POST','/api/invitations',{cookie:staffCookie,body:inviteBody});assert.equal(invite.code,201);assert.equal(invite.body.createdByUserId,staff.body.id);
  assert.equal((await f.request('GET','/api/data',{cookie:staffCookie})).body.invitations.length,1);
  const lookup=await f.request('POST','/api/invitations/lookup',{body:{inviteCode:invite.body.inviteCode}});assert.equal(lookup.code,200);assert.equal(lookup.body.guestName,undefined);assert.equal(lookup.body.guestEmail,undefined);
  const checkin={fullName:'=1+1',email:'guest@example.test',phone:'+2348000000000',hostEmployeeId:staff.body.id,generalConsentGranted:true,noticeVersion:'development-1',inviteCode:invite.body.inviteCode};
  assert.equal((await f.request('POST','/api/checkin',{body:{...checkin,noticeVersion:'old'}})).code,400);
  assert.equal((await f.request('POST','/api/checkin',{body:{...checkin,email:'other@example.test'}})).code,409);
  const saved=await f.request('POST','/api/checkin',{body:checkin});assert.equal(saved.code,201);assert.equal(saved.body.visitType,'pre_registered');assert.equal(saved.body.photoUrl,undefined);assert.equal(saved.body.wifiAccessGranted,false);
  assert.equal((await f.request('POST','/api/checkin',{body:checkin})).code,409);
  assert.equal((await f.request('POST',`/api/visitors/${saved.body.id}/erase`,{cookie:staffCookie})).code,403);
  assert.equal((await f.request('POST',`/api/visitors/${saved.body.id}/erase`,{cookie})).code,200);
  assert.equal((await f.request('GET','/api/data',{cookie:staffCookie})).body.invitations.length,0);
  await f.request('PATCH',`/api/users/${staff.body.id}`,{cookie,body:{status:'suspended'}});
  assert.equal((await f.request('GET','/api/session',{cookie:staffCookie})).code,401);
 }finally{f.cleanup();}
});

test('login normalization and durable account throttling',async()=>{
 const f=await fixture();let second;
 try{
  for(let n=0;n<10;n++)assert.equal((await f.request('POST','/api/login',{body:{email:n%2?' ADMIN@EXAMPLE.TEST ':f.env.SECUREPASS_ADMIN_EMAIL,password:'wrong'}})).code,401);
  assert.equal((await f.request('POST','/api/login',{body:{email:'\tadmin@example.test',password:f.env.SECUREPASS_ADMIN_PASSWORD}})).code,429);
  f.db.close();second=await fixture(f.dir);
  assert.equal((await second.request('POST','/api/login',{ip:'192.0.2.1',body:{email:'admin@example.test',password:f.env.SECUREPASS_ADMIN_PASSWORD}})).code,429);
 }finally{if(second)second.cleanup();else f.cleanup();}
});

test('public issuance limits, capacity, indexed retention and bounded logs',async()=>{
 const f=await fixture();try{
  const cookie=(await f.login()).headers['set-cookie'].split(';')[0];
  const host=(await f.request('GET','/api/hosts')).body[0];
  const body={fullName:'Visitor',email:'visitor@example.test',phone:'12345678',hostEmployeeId:host.id,generalConsentGranted:true,noticeVersion:'development-1'};
  for(let n=0;n<10;n++)assert.equal((await f.request('POST','/api/checkin',{body})).code,201);
  assert.equal((await f.request('POST','/api/checkin',{body})).code,429);
  for(let n=0;n<25;n++)f.db.prepare('INSERT INTO audits VALUES (?,?,?,?,?,?)').run(crypto.randomUUID(),new Date().toISOString(),'test','TEST','','');
  f.db.prepare('UPDATE record_expiry SET expires=?').run(Date.now()-1);f.purge();
  assert.ok(f.db.prepare('SELECT COUNT(*) AS n FROM audits').get().n<=20);
  assert.equal((await f.request('GET','/api/data',{cookie})).body.visitors.length,0);
  const insert=f.db.prepare('INSERT INTO records VALUES (?,?,?)');
  for(let n=0;n<100;n++)insert.run('invitations',String(n),JSON.stringify({id:String(n)}));
  assert.equal((await f.request('POST','/api/checkin',{body,ip:'192.0.2.5'})).code,503);
  assert.equal((await f.request('GET','/api/data',{cookie})).body.invitations.length,100);
  assert.equal((await f.request('GET','/api/data?offset=-1',{cookie})).code,400);
 }finally{f.cleanup();}
});

test('CSV neutralizes formulas and escapes every value; QR excludes personal data',async()=>{
 const source=fs.readFileSync(new URL('src/utils/security.ts',root),'utf8');
 const mod=await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(source)).toString('base64'));
 for(const input of ['=1+1',' +SUM(A1:A2)','\t@SUM(1)','-1','\r=1'])assert.ok(mod.csvCell(input).startsWith('"\''));
 assert.equal(mod.csvCell('a"b\nc'),'"a""b\nc"');
 assert.equal(mod.badgeReference({badgeId:'opaque-id',fullName:'Private Name',email:'private@example.test'}),'SECUREPASS-REFERENCE:opaque-id');
});
