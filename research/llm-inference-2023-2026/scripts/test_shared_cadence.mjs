import * as c from '../../../src/components/llm-evolution/chart-core.js';
import fs from 'node:fs';import assert from 'node:assert/strict';
const R=new URL('../',import.meta.url),d=JSON.parse(fs.readFileSync(new URL('../../dist/__llm-research-data.json',R)));
for (const key of ['input', 'output', 'context', 'pricing']) {
  const fresh = c.initialState(key, d);
  for (const role of ['flagship', 'all', 'premium', 'flagship-premium']) {
    const saved = { ...fresh, view: 'latest', scopeVersion: 6, role, companies: ['Google'], cadenceMode: 'overall', access: 'closed' };
    const state = c.initialState(key, d, { [key]: saved });
    assert.ok(!('view' in state), key + ' ignores the former evidence view');
    assert.equal(state.access, 'all');
    assert.equal(state.role, saved.role);
    assert.equal(state.cadenceMode, saved.cadenceMode);
    assert.deepEqual(Array.from(state.companies), saved.companies);
  }
}
const expectations=[];
for(const companies of [['OpenAI','Anthropic','Google'],['Google'],d.articleCoverage.companies])for(const role of ['economy','balanced','flagship','premium','flagship-premium','all'])for(const mode of ['company','overall']){
 const state={companies,role,access:'all'},cd=c.cadenceData(d,state),roles=role==='all'?c.classes:role==='flagship-premium'?['flagship','premium']:[role],singles=roles.flatMap(role=>c.cadenceData(d,{...state,role}).gaps),sort=pp=>Array.from(pp,p=>[p.id,p.value,p.previousDate,p.date]).sort((a,b)=>a[0].localeCompare(b[0]));assert.deepEqual(sort(cd.gaps),sort(singles),'Combined selections must be the unchanged union of class gap sequences');
 expectations.push({companies,role,mode,points:cd.gaps.map(p=>({id:p.id,role:p.productClass,date:p.date,company:p.company})),events:cd.events.map(p=>p.id),range:c.cadenceRange(cd.events,d.cutoff),fitSeries:c.cadenceTypical(cd.events,cd.gaps,d.cutoff,mode,role).map(f=>f.series)});
}
// Export only on request; normal tests must not overwrite historical review evidence.
if(process.env.CADENCE_EXPECTATIONS)fs.writeFileSync(process.env.CADENCE_EXPECTATIONS,JSON.stringify(expectations,null,2));console.log(JSON.stringify({status:'passed',states:expectations.length,checks:['Combined gaps equal union of separate class gaps','No cross-role gaps fabricated','Exact selected event range','Saved company/role/mode retained; article access always all; legacy evidence view ignored']}));
let pooledStates=0,pooledCurves=0;
for(const role of ['all','flagship-premium'])for(let mask=0;mask<32;mask++)for(const access of ['all','open','closed','unknown'])for(const mode of ['company','overall']){
 const state={companies:d.articleCoverage.companies.filter((_,i)=>mask&(1<<i)),role,access},cd=c.cadenceData(d,state),fits=c.cadenceTypical(cd.events,cd.gaps,d.cutoff,mode,role);assert.ok(fits.length<=(mode==='company'?state.companies.length:1));assert.equal(new Set(fits.map(f=>f.company)).size,fits.length);
 for(const f of fits){const pp=cd.gaps.filter(p=>mode==='overall'||p.company===f.company),dates=pp.map(p=>p.date).sort();assert.equal(f.start,dates[0]);assert.equal(f.observedEnd,dates.at(-1));assert.equal(f.end,d.cutoff);assert.equal(f.n,pp.length);assert.equal(f.role,role);assert.equal(f.pooledRoles,true);assert.deepEqual(Array.from(f.roles).sort(),[...new Set(pp.map(p=>p.productClass))].sort());const direct=c.descriptiveFit(pp);assert.equal(f.slope,direct.slope);assert.equal(f.level,direct.level);pooledCurves++;}
 pooledStates++;
}
for(const role of ['economy','balanced','flagship','premium'])for(const mode of ['company','overall']){const cd=c.cadenceData(d,{companies:d.articleCoverage.companies,role,access:'all'}),strip=ff=>JSON.stringify(ff.map(({valueAt,...f})=>f));assert.equal(strip(c.cadenceTypical(cd.events,cd.gaps,d.cutoff,mode,role)),strip(c.cadenceTypical(cd.events,cd.gaps,d.cutoff,mode)));}
console.log(JSON.stringify({allRolePooling:'passed',pooledStates,pooledCurves,singleRoleFitsUnchanged:8}));

for(const key of ['cadence','input','output','context','pricing']){
 const fresh=c.initialState(key,d);assert.equal(fresh.role,'flagship');assert.equal(fresh.cadenceMode,key==='pricing'?'company':'overall');assert.equal(fresh.access,'all');assert.deepEqual(Array.from(fresh.companies),['OpenAI','Anthropic','Google']);
 for(const access of ['open','closed','unknown']){const legacy={scopeVersion:6,companies:['Google'],role:'all',cadenceMode:'company',access,view:'latest'},migrated=c.initialState(key,d,{[key]:legacy});assert.equal(migrated.role,'flagship');assert.equal(migrated.cadenceMode,key==='pricing'?'company':'overall');assert.equal(migrated.access,'all');assert.deepEqual(Array.from(migrated.companies),['Google']);
 const intentional={...migrated,role:'flagship-premium',cadenceMode:'company',access};const next=c.initialState(key,d,{[key]:intentional});assert.equal(next.role,'flagship-premium');assert.equal(next.cadenceMode,'company');assert.equal(next.access,'all');assert.equal(next.articleDefaultsVersion,1);}
}
console.log('All five article defaults, legacy access migration, and subsequent intentional role/mode persistence passed');
