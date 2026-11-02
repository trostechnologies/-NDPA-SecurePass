import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
let transform;
try {const esbuild=require('esbuild');transform=(s,file)=>esbuild.transformSync(s,{loader:'tsx',format:'cjs',jsx:'automatic',sourcefile:file}).code;}
catch {if(process.env.SECUREPASS_BABEL_BUNDLE){const b=require(process.env.SECUREPASS_BABEL_BUNDLE);transform=(s,file)=>b.babelTransform(s,file,false,[],[]).code;}}

// A deterministic hook/event harness tests component sequencing without a browser.
// It does not replace React integration or browser E2E coverage.
function component(file,name,props){
 const state=[];let cursor=0;const qr=[],badges=[];
 const react={useState(initial){const i=cursor++;if(!(i in state))state[i]=initial;return[state[i],v=>state[i]=typeof v==='function'?v(state[i]):v];},useRef(initial){const i=cursor++;if(!(i in state))state[i]={current:initial};return state[i];},useEffect(){cursor++;}};
 const jsx=(type,props)=>({type,props});const icons=new Proxy({},{get:(_,n)=>n==='__esModule'?true:()=>null});
 const notice={companyName:'Controller',facilityName:'Facility',privacyNoticeText:'Reviewed notice',noticeVersion:'test-1',dataRetentionDays:60};
 const modules={react:{...react,default:react,__esModule:true},'react/jsx-runtime':{jsx,jsxs:jsx,Fragment:'fragment'},'lucide-react':icons,qrcode:{toDataURL:async payload=>{qr.push(payload);return 'data:image/png;base64,test';}},'../../utils/security':{badgeReference:v=>`SECUREPASS-REFERENCE:${v.badgeId}`},'../../utils/ndpaCompliance':{NDPA_ORGANIZATION_INFO:notice,generateBadgeId:()=> 'client-badge',generatePassCode:()=> 'client-pass',generateWifiCode:()=> 'client-wifi'},'../../api':{api:async()=>{throw Error('Unexpected API call');},jsonBody:JSON.stringify},'./ConsentNoticeModal':{ConsentNoticeModal:()=>null}};
 const module={exports:{}};const source=fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
 vm.runInNewContext(transform(source,file),{module,exports:module.exports,Error,require:n=>{assert.ok(n in modules,`Unmocked ${n}`);return modules[n];},console,alert:message=>{throw Error(message);},setTimeout,window:{print(){}}});
 const render=()=>{cursor=0;return module.exports[name]({...props,onOpenBadge:v=>badges.push(v)});};
 const nodes=(tree)=>{if(!tree||typeof tree!=='object')return[];if(Array.isArray(tree))return tree.flatMap(nodes);return[tree,...nodes(tree.props?.children)];};
 const text=n=>Array.isArray(n)?n.map(text).join(''):typeof n==='string'?n:typeof n==='object'&&n?text(n.props?.children):'';
 const find=predicate=>{const found=nodes(render()).find(predicate);assert.ok(found,'Expected element');return found;};
 const input=(placeholder,value)=>find(n=>n.type==='input'&&n.props.placeholder?.includes(placeholder)).props.onChange({target:{value}});
 const click=label=>find(n=>n.type==='button'&&text(n).includes(label)).props.onClick();
 return {render,nodes,text,find,input,click,qr,badges};
}
const hosts=[{id:'host-id',name:'Host',department:'Reception',title:'Host',floor:'Ground'}];
for(const kind of ['kiosk','mobile'])test(`${kind}: rejected save preserves inputs, pending save blocks duplicates, saved pass uses server IDs`,{skip:!transform&&'Install dependencies or provide SECUREPASS_BABEL_BUNDLE'},async()=>{
 let mode='reject',calls=0,resolve;const saved={id:'server-id',badgeId:'server-badge',passCode:'server-pass',fullName:'Guest',organization:'Org',hostEmployeeName:'Host',securityClearance:'Standard',checkInTime:new Date().toISOString()};
 const complete=()=>{calls++;return mode==='reject'?Promise.reject(Error('Network failed')):new Promise(r=>resolve=r);};
 const c=component(kind==='kiosk'?'src/components/Kiosk/VisitorKiosk.tsx':'src/components/Mobile/MobileSelfCheckIn.tsx',kind==='kiosk'?'VisitorKiosk':'MobileSelfCheckIn',{hosts,invitations:[],onCheckInComplete:complete});
 c.input(kind==='kiosk'?'Babatunde':'Amina','Guest');c.input(kind==='kiosk'?'b.fashola':'a.bello','guest@example.test');c.input('+234 803','12345678');
 await c.click(kind==='kiosk'?'Proceed to Host Selection':'Continue to Host Selection');
 if(kind==='kiosk'){await c.click('Continue');await c.click('Continue to Privacy Review');}else await c.click('Consent');
 const checkbox=c.find(n=>n.type==='input'&&n.props.type==='checkbox');assert.equal(checkbox.props.checked,false);checkbox.props.onChange({target:{checked:true}});
 const label=kind==='kiosk'?'Complete Registration':'Check In &';
 await c.click(label);assert.equal(c.badges.length,0);assert.equal(c.qr.length,0);assert.ok(c.text(c.render()).includes('Network failed'));
 mode='pending';const pending=c.click(label);assert.equal(c.find(n=>n.type==='button'&&c.text(n).includes(label)).props.disabled,true);
 await c.click(label);assert.equal(calls,2);assert.equal(c.badges.length,0);assert.equal(c.qr.length,0);
 resolve(saved);await pending;
 if(kind==='kiosk')assert.equal(c.badges[0].id,'server-id');else{assert.equal(c.qr[0],'SECUREPASS-REFERENCE:server-badge');assert.ok(c.text(c.render()).includes('server-pass'));}
});
