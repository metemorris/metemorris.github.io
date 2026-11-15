import * as core from '../../../src/components/llm-evolution/chart-core.js';
import fs from 'node:fs';

import assert from 'node:assert/strict';


const base={metric:'releases',company:'A',family:'main',productClass:'economy',weightAccess:'open',source:'https://example.test',kind:'MoE',provider:''};
const point=(id,date,extra={})=>({...base,id,date,model:id,members:[id],...extra});
const data={cutoff:'2024-12-31'};
const live=JSON.parse(fs.readFileSync(new URL('../../../dist/__llm-research-data.json',import.meta.url),'utf8'));
// Measured quantities: actual dates, comparable series and no snapshot backdating.
const measured=(company,dates,value,extra={})=>dates.map((date,i)=>point(company+i,date,{company,metric:'context',mode:'historical',kind:'served',productClass:'flagship',value,...extra}));
const mA=measured('A',['2023-01-01','2023-04-01','2023-07-01'],100);
const mB=measured('B',['2023-04-01','2023-07-01','2023-10-01'],1000);
const mf=core.metricFits([...mA,...mB])[0];assert.equal(mf.start,'2023-01-01');assert.equal(mf.end,'2023-10-01');assert.equal(mf.slope,0); // Overlapping flat histories retain a flat median slope.
const disjoint=core.metricFits([...mA,...measured('B',['2024-01-01','2024-04-01','2024-07-01'],1000)])[0];assert.equal(disjoint.start,'2023-01-01');assert.equal(disjoint.end,'2024-07-01');assert.ok(disjoint.slope>0);
assert.equal(core.metricFits([...mA,...mB.slice(0,1)]).length,1);assert.equal(core.metricFits([...mA,...mB.slice(0,1)],'company').length,1);
assert.equal(core.metricFits(mA.map(p=>({...p,mode:'current'}))).length,0);
assert.equal(core.metricFits(mA.map((p,i)=>({...p,provider:'provider'+i}))).length,0);
assert.equal(core.metricFits(mA.map((p,i)=>({...p,kind:'kind'+i}))).length,0);
assert.equal(core.metricFits(mA.map((p,i)=>({...p,scenario:'scenario'+i}))).length,0);
assert.equal(core.metricFits(mA.slice(0,2)).length,0);
const growth=mA.map(p=>({...p,value:100*Math.exp(.003*(Date.parse(p.date)-Date.parse(mA[0].date))/86400000)}));assert.ok(Math.abs(core.metricFits(growth)[0].slope-.003)<1e-12);
const mOutlier=Array.from({length:9},(_,i)=>({...mA[0],id:'m'+i,date:new Date(Date.UTC(2023,i,1)).toISOString().slice(0,10),value:i===5?1000000:100}));assert.equal(core.metricFits(mOutlier)[0].n,9);assert.ok(Math.abs(core.metricFits(mOutlier)[0].valueAt('2023-06-01')-100)<1e-9);assert.equal(mOutlier[5].value,1000000);
const observed=core.observations({cutoff:'2024-12-31',points:[...mA,...mB.map(p=>({...p,productClass:'premium',weightAccess:'closed'})),...mA.map(p=>({...p,productClass:'unclassified'}))]},{companies:['A','B'],role:'flagship-premium',access:'closed'},'context','historical');assert.equal(observed.length,3);assert.ok(observed.every(p=>p.company==='B'));
for(const metric of ['total','active','context','output','input_price','output_price','cost']){
  const mode=['total','active'].includes(metric)?'release':'historical';
  const pp=core.observations(live,{companies:['OpenAI','Anthropic','Google'],role:'flagship',access:'all',scenario:'8k_in_2k_out'},metric,mode);
  assert.ok(pp.every(p=>p.productClass==='flagship'&&p.mode===mode&&p.date<=live.cutoff));
  if(pp.length)assert.equal(core.cadenceRange(pp,live.cutoff).start,pp.map(p=>p.date).sort()[0]);
  for(const fit of core.metricFits(pp))assert.ok(fit.samples.every(p=>p.date>=fit.start&&p.date<=fit.end&&p.value>0&&Number.isFinite(p.value)));
}
console.log('Passed: measured-quantity selected-point slopes; full observed-support pooling; no unsupported sparse curves or snapshot/provider/definition/scenario mixing; outliers retained; role/access filters and exact observation domains.');
// Reported parameters never influence disclosure fits; tariff event labels are
// provenance, while differing service/long-context tiers remain boundaries.
assert.equal(core.metricFits(mA.map(p=>({...p,status:'estimated'}))).length,0);
assert.equal(core.metricFits([...mA,...mA.map(p=>({...p,status:'estimated',value:1e9}))])[0].valueAt(mA[0].date),100.00000000000004);
const tariff=mA.map((p,i)=>({...p,metric:'input_price',kind:i===1?'price_change':'launch',serviceTier:'standard'}));
assert.equal(core.metricFits(tariff).length,1);
assert.equal(core.metricFits(tariff.map((p,i)=>({...p,serviceTier:'tier'+i}))).length,0);
assert.equal(core.metricFits(tariff.map((p,i)=>({...p,metric:'cost',priceTier:'tier'+i}))).length,0);
for(const metric of ['context','output','input_price','output_price','cost']){
 const pp=core.observations(live,{companies:['OpenAI','Anthropic','Google'],role:'flagship',access:'all',scenario:'8k_in_2k_out'},metric,['input_price','output_price','cost'].includes(metric)?'launch':'historical');
 for(const f of core.metricFits(pp,'company')){assert.ok(['Anthropic','Google','OpenAI'].includes(f.company));assert.ok(f.start<f.end);assert.ok(f.cohorts.every(h=>h.start<=f.start&&h.end>=f.end));assert.ok(f.samples.every(p=>Number.isFinite(p.value)&&p.value>0));}
}
const sizeState={companies:['OpenAI','Anthropic','Google'],role:'flagship',access:'all',estimates:true};
assert.equal(core.observations(live,sizeState,'total','release').length,1);
assert.equal(core.observations(live,{...sizeState,estimates:false},'total','release').length,0);
console.log('Passed: reported estimates excluded from fits; compatible dated tariff events retained; service/long tiers isolated; supported company spans retained without forcing sparse or disjoint histories.');
// Running maxima never fall, hold through a plateau, and need two dates.
const rm=core.runningMax([point('a','2023-01-01',{metric:'output',value:10}),point('b','2023-06-01',{metric:'output',value:5}),point('c','2024-01-01',{metric:'output',value:40}),point('d','2024-06-01',{metric:'output',value:40})])[0];
assert.deepEqual(rm.steps.map(s=>[s.date,s.value]),[['2023-01-01',10],['2024-01-01',40]]);assert.equal(rm.valueAt('2023-09-01'),10);assert.equal(rm.valueAt('2024-06-01'),40);assert.equal(rm.end,'2024-06-01');
assert.equal(core.runningMax([point('a','2023-01-01',{metric:'output',value:10})]).length,0);
assert.deepEqual(core.runningMax([point('a','2023-01-01',{metric:'output',value:10}),point('b','2023-02-01',{metric:'output',value:20,company:'B'}),point('c','2023-03-01',{metric:'output',value:5,company:'B'})],'company').map(f=>f.company),['B']);
// Yearly medians: same-company/date values count once, a year needs two rows,
// and every series is 1× in its first counted year.
const ym=core.yearlyMedians([point('a','2023-02-01',{value:10}),point('b','2023-02-01',{value:30}),point('c','2023-08-01',{value:40}),point('d','2024-03-01',{value:90}),point('e','2025-01-01',{value:60}),point('f','2025-05-01',{value:120,company:'B'})],'2025-06-30');
assert.deepEqual(ym.years.map(y=>[y.year,y.median,y.n]),[['2023',30,2],['2025',90,2]]);assert.equal(ym.baseYear,'2023');assert.equal(ym.valueAt('2023-07-01'),1);assert.equal(ym.valueAt('2024-07-01'),1);assert.equal(ym.valueAt('2025-03-01'),3);assert.equal(ym.end,'2025-06-30');
assert.equal(core.yearlyMedians([point('a','2023-02-01',{value:10}),point('b','2023-08-01',{value:30})],'2023-12-31'),null);
const overview=core.initialState('overview',live);assert.equal(overview.role,'flagship');
for(const role of core.roleOptions)for(const f of core.overviewFits(live,{...overview,role})){assert.equal(f.valueAt(f.start),1);assert.ok(f.years.every(y=>y.n>=2&&y.median>0));assert.ok(f.end===live.cutoff);}
// Capacity points say whether their limit was documented near launch.
const caps=core.capacityObservations(live,{companies:['OpenAI','Anthropic','Google'],role:'flagship',access:'all'},'output');
assert.ok(caps.length&&caps.every(p=>p.documentedLater===((Date.parse(p.evidenceDate)-Date.parse(p.releaseDate))/86400000>core.LAUNCH_WINDOW_DAYS)));
console.log('Passed: running maxima hold plateaus; yearly medians index to the first counted year; overview defaults to Flagship; launch-window flag matches evidence dates.');
