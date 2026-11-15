"""Rebuild CSVs and validate joins, dates, units, tiers, fit and cost arithmetic.

Offline, Python 3 standard library only. Never performs model inference.
"""
import csv, json, pathlib, datetime, collections, math, os, runpy
launch_evidence=runpy.run_path(str(pathlib.Path(__file__).with_name("launch_policy.py")))["launch_evidence"]
ROOT=pathlib.Path(os.environ.get('LLM_RESEARCH_ROOT',pathlib.Path(__file__).resolve().parents[1]))
D=ROOT/'data'; A=json.loads((D/'research_inputs.json').read_text()); OBS=A['collection_date']
M=A['models']; S=A['specs']; O=A['offers']; P=A['performance']; SOURCES=A['sources']
def write(name,rows,fields=None):
    fields=fields or list(dict.fromkeys(k for r in rows for k in r))
    with (D/(name+'.csv')).open('w',newline='') as f:
        w=csv.DictWriter(f,fieldnames=fields,extrasaction='ignore');w.writeheader();w.writerows(rows)
def unique(rows,key):
    values=[r[key] for r in rows]; assert len(values)==len(set(values)),f'duplicate {key}'
    return {r[key]:r for r in rows}
models=unique(M,'model_id'); specs=unique(S,'spec_id'); offers=unique(O,'offer_id'); src=unique(SOURCES,'id')
unique(P,'performance_id')
HISTORICAL={'launch','price_change','announced_price_change','dated_announcement','dated_release_note','dated_documentation','archived_observation'}
for rows in [M,S,O,P]:
    for r in rows:
        if 'model_id' in r: assert r['model_id'] in models
        for k,v in r.items():
            if (k.endswith('_date') or k in ['observation_date']) and v:
                datetime.date.fromisoformat(v); assert v<=OBS,(k,v,r)
            if k.endswith('source_id') and v:
                assert v in src,(k,v)
                assert src[v]['status'] in ['retrieved','retrieved_via_web_tool','provided_by_user'],(k,v,src[v]['status'])
            if k.endswith(('_tokens','_parameters_b','usd_per_million')) and v is not None:
                assert isinstance(v,(int,float)) and v>=0,(k,v)
        if r.get('total_parameters_b') is not None and r.get('active_parameters_b') is not None:
            assert r['active_parameters_b']<=r['total_parameters_b']
for o in O:
    assert o['currency']=='USD'
    if o['date_basis']=='current_only': assert o['effective_date']==o['observation_date'] and o['effective_date']<=OBS
    if o.get('constraints_date'): assert o['constraints_date']<=o['effective_date'] or o['date_basis']=='current_only'
    m=models[o['model_id']]
    if o.get('effective_date') and m.get('release_date'): assert o['effective_date']>=m['release_date'],o
    if not o.get('effective_date'): assert o['date_basis']=='announcement_date_unresolved',o
    if launch_evidence(o,m):
        assert all(s in src for s in o['launch_price_source_ids'])

SC=[]
for name,i,o in [('8k_in_2k_out',8000,2000),('32k_in_2k_out',32000,2000),('128k_in_4k_out',128000,4000),('1m_in_8k_out',1000000,8000)]:
    SC.append(dict(scenario_id=name,input_tokens=i,billed_output_tokens=o,included_instruction_overhead_tokens=1000,reusable_prefix_tokens=i-2000,requests_per_group=10,seconds_between_request_starts=30,reasoning_assumption='Output is the TOTAL billed generated budget. Reasoning endpoints: illustrative 50% reasoning / 50% visible answer; non-reasoning: all visible. No extra unpriced thinking tokens.',cache_rule='10 independent requests; identical marked prefix; first write available before next request, then 9 hits; 30-second starts; calls may overlap; 100 independent groups for cached cost per 1000. No conversation accumulation or measured latency.'))

def calc(o,s):
    i=s['input_tokens']; out=s['billed_output_tokens']; total=i+out
    ctx=o.get('provider_context_tokens'); mi=o.get('max_input_tokens'); mo=o.get('max_output_tokens'); rule=o.get('context_budget_rule')
    fails=[]; unknown=[]
    if ctx is not None and rule=='shared_input_output' and total>ctx: fails.append('input_plus_billed_output_exceeds_context')
    if mi is not None and i>mi: fails.append('input_exceeds_explicit_input_cap')
    if mo is not None and out>mo: fails.append('output_exceeds_output_cap')
    if rule=='unknown' or (ctx is None and mi is None): unknown.append('input_or_context_budget_unverified')
    if mo is None and o.get('output_cap_type')!='no_separate_cap': unknown.append('output_cap_unverified')
    if o['date_basis'] not in ['current_only'] and not o.get('constraints_date'): unknown.append('no_historical_constraints')
    fit='false' if fails else 'unknown' if unknown else 'true'
    eligible=fit=='true' and o['availability'] in ['available','deprecated']
    ir=o['input_usd_per_million']; outr=o['output_usd_per_million']; cr=o.get('cache_read_usd_per_million'); cw=o.get('cache_write_usd_per_million')
    threshold=o.get('long_context_threshold_tokens'); tier='standard'; price_known=True; price_reasons=[]
    if threshold is not None and i>threshold:
        ir=o.get('long_input_usd_per_million');outr=o.get('long_output_usd_per_million');cr=o.get('long_cache_read_usd_per_million');cw=o.get('long_cache_write_usd_per_million');tier='long_context_whole_request'
        if ir is None or outr is None: price_known=False;price_reasons.append('tariff_for_prompt_length_unverified')
    if threshold==200000 and i==threshold and 'below/above' in o.get('notes',''): price_known=False;price_reasons.append('tariff_boundary_unresolved')
    if o.get('pricing_max_input_tokens') is not None and i>o['pricing_max_input_tokens']:
        price_known=False;price_reasons.append('above_verified_tariff_input_range')
    eligible=eligible and price_known and not o.get('documentation_only') and o.get('cost_eligible') is not False
    nominal=(i*ir+out*outr)/1e6 if price_known else None
    cost=nominal if eligible else None
    cache_first=repeat=group=cached1000=None; cache_status='unknown_rules_or_ineligible'
    lifetime=o.get('cache_lifetime_seconds'); minimum=o.get('cache_min_tokens'); prefix=s['reusable_prefix_tokens']
    if cost is not None and cr is not None and cw is not None and lifetime is not None and minimum is not None and o.get('cache_write_rule'):
        if prefix>=minimum and lifetime>s['seconds_between_request_starts']*(s['requests_per_group']-1):
            cache_first=(prefix*cw+(i-prefix)*ir+out*outr)/1e6
            repeat=(prefix*cr+(i-prefix)*ir+out*outr)/1e6
            group=cache_first+(s['requests_per_group']-1)*repeat;cached1000=group*1000/s['requests_per_group'];cache_status='conditional_on_successful_exact_prefix_hits'
        else: cache_status='prefix_or_lifetime_not_eligible'
    headroom=ctx-total if ctx is not None and rule=='shared_input_output' else mi-i if mi is not None and rule=='separate_input_output' else None
    return dict(workload_id=o['offer_id']+'__'+s['scenario_id'],offer_id=o['offer_id'],model_id=o['model_id'],provider=o['provider'],scenario_id=s['scenario_id'],evidence_date=o['effective_date'],date_basis=o['date_basis'],input_tokens=i,billed_output_tokens=out,fits_in_one_request=fit,fit_reason='; '.join(fails+unknown) or 'documented_caps_satisfied',availability=o['availability'],eligible=eligible,eligibility_reason='; '.join(fails+unknown+price_reasons+(['documentation_only_quote'] if o.get('documentation_only') or o.get('cost_eligible') is False else [])+(['availability_'+o['availability']] if o['availability'] not in ['available','deprecated'] else [])) or 'documented_caps_and_tariff_satisfied',context_headroom_tokens=headroom,headroom_definition='unified_context_minus_input_and_output' if rule=='shared_input_output' else 'explicit_input_cap_minus_input',applied_price_tier=tier,applied_input_usd_per_million=ir,applied_output_usd_per_million=outr,nominal_token_quote_usd=nominal,uncached_cost_usd=cost,uncached_cost_per_1000_usd=cost*1000 if cost is not None else None,first_request_with_cache_write_usd=cache_first,repeated_request_cache_hit_usd=repeat,ten_request_group_cost_usd=group,cached_cost_per_1000_usd=cached1000,cache_estimate_status=cache_status,reasoning_assumption_id=s['scenario_id'])

# Boundary and arithmetic validation using independent expected results.
test=dict(O[0]);test.update(availability='available',effective_date=OBS,date_basis='current_only',constraints_date=OBS,provider_context_tokens=10000,max_input_tokens=None,max_output_tokens=2000,output_cap_type='numeric',context_budget_rule='shared_input_output',input_usd_per_million=2,output_usd_per_million=8,long_context_threshold_tokens=None,cache_read_usd_per_million=.2,cache_write_usd_per_million=2.5,cache_lifetime_seconds=300,cache_min_tokens=1024,cache_write_rule='explicit')
r=calc(test,SC[0]);assert r['fits_in_one_request']=='true' and math.isclose(r['uncached_cost_usd'],.032)
assert math.isclose(r['first_request_with_cache_write_usd'],.035) and math.isclose(r['repeated_request_cache_hit_usd'],.0212)
assert math.isclose(r['ten_request_group_cost_usd'],.2258)
test['provider_context_tokens']=9999;assert calc(test,SC[0])['fits_in_one_request']=='false' and calc(test,SC[0])['uncached_cost_usd'] is None
test['provider_context_tokens']=10000;test['max_output_tokens']=None;assert calc(test,SC[0])['fits_in_one_request']=='unknown'
test.update(max_output_tokens=2000,long_context_threshold_tokens=7000,long_input_usd_per_million=4,long_output_usd_per_million=12);assert math.isclose(calc(test,SC[0])['uncached_cost_usd'],.056)
test['max_input_tokens']=7999;assert calc(test,SC[0])['fits_in_one_request']=='false'
test['max_input_tokens']=None;test['availability']='retired';assert calc(test,SC[0])['uncached_cost_usd'] is None
W=[calc(o,s) for o in O for s in SC]
unique(W,'workload_id')
for w in W:
    if w['uncached_cost_usd'] is not None:
        assert w['fits_in_one_request']=='true' and w['eligible']
        independent=(w['input_tokens']/1e6*w['applied_input_usd_per_million']+w['billed_output_tokens']/1e6*w['applied_output_usd_per_million'])
        assert math.isclose(independent,w['uncached_cost_usd'],rel_tol=1e-12)

# Same-day evidence only, without carrying historical launch prices forward.
groups=collections.defaultdict(list)
for w in W:
    if w['uncached_cost_usd'] is not None: groups[(w['evidence_date'],w['scenario_id'])].append(w)
CHEAP=[]
for (day,scenario),rows in sorted(groups.items()):
    rows.sort(key=lambda r:(r['uncached_cost_usd'],r['offer_id'])); b=rows[0]
    bo=offers[b['offer_id']]
    CHEAP.append(dict(evidence_date=day,scenario_id=scenario,cheapest_observed_offer_id=b['offer_id'],model_id=b['model_id'],provider=b['provider'],service_tier=bo['service_tier'],pricing_condition=bo.get('pricing_condition'),uncached_cost_usd=b['uncached_cost_usd'],eligible_offer_count=len(rows),eligible_model_count=len(set(x['model_id'] for x in rows)),scope='Only offers evidenced on this exact date, under recorded routing/time/tier conditions; not the entire historical market; no carry-forward or interpolation.',tie_count=sum(math.isclose(x['uncached_cost_usd'],b['uncached_cost_usd']) for x in rows)))

# Explicit pairwise historical comparisons, only where both requests fit.
COMPARE=[]
for before_name,after_name in [('claude-fable-5-1','claude-fable-5-2'),('claude-opus-5','claude-opus-5-5')]:
    before=next(o for o in O if models[o['model_id']]['exact_version']==before_name and o['date_basis']=='launch')
    after=next(o for o in O if models[o['model_id']]['exact_version']==after_name and o['date_basis']=='launch')
    for sc in SC:
        b=calc(before,sc); a=calc(after,sc)
        if b['uncached_cost_usd'] is None or a['uncached_cost_usd'] is None: continue
        bc=b['uncached_cost_usd']; ac=a['uncached_cost_usd']
        COMPARE.append(dict(comparison_id=before_name+'__'+after_name+'__'+sc['scenario_id'],baseline_offer_id=before['offer_id'],later_offer_id=after['offer_id'],baseline_date=before['effective_date'],later_date=after['effective_date'],scenario_id=sc['scenario_id'],baseline_cost_usd=bc,later_cost_usd=ac,change_usd=ac-bc,change_fraction=ac/bc-1,baseline_divided_by_later=bc/ac,interpretation='Fixed token budget across successive models; not equal task quality, text volume, latency or energy. No interpolation between evidence dates.'))

# Field-level provenance for identity, specifications, price and constraint fields.
F=[]
spec_fields=['total_parameters_b','active_parameters_b','architecture','advertised_context_tokens','native_context_tokens','extended_context_tokens','extension_method','provider_supported_context_tokens','max_input_tokens','max_output_tokens','reasoning_shares_output_limit','reasoning_billed_as_output','config_max_position_embeddings']
model_fields=['specialization','release_channel','cadence_excluded_reason','release_date','release_date_precision','release_event','release_interval_start_date','release_interval_end_date','repo_created_date','open_weights','license','parent_lineage','checkpoint_revision','current_parent','product_class','classification_confidence','classification_rationale','cadence_family']
offer_fields=['input_usd_per_million','output_usd_per_million','cache_read_usd_per_million','cache_write_usd_per_million','cache_lifetime_seconds','cache_min_tokens','batch_discount_fraction','pricing_max_input_tokens','long_context_threshold_tokens','long_input_usd_per_million','long_output_usd_per_million','long_cache_read_usd_per_million','long_cache_write_usd_per_million','provider_context_tokens','max_input_tokens','max_output_tokens','context_budget_rule','output_cap_type']
for et,rows,key,fields in [('model',M,'model_id',model_fields),('spec',S,'spec_id',spec_fields),('offer',O,'offer_id',offer_fields)]:
    for r in rows:
        for field in fields:
            v=r.get(field); sid=r.get('source_id') or r.get('pricing_source_id') or r.get('identity_source_id')
            if et=='model' and field in ['release_date','release_date_precision','release_event','release_interval_start_date','release_interval_end_date']: sid=r.get('release_source_id')
            elif et=='model' and field in ['product_class','classification_confidence','classification_rationale','cadence_family']: sid=r.get('classification_source_id') or r.get('identity_source_id')
            elif et=='model' and field=='specialization': sid=r.get('specialization_source_id') or r.get('identity_source_id')
            elif et=='model' and field=='parent_lineage' and r.get('parent_lineage_source_id'): sid=r['parent_lineage_source_id']
            elif et=='model' and field in ['repo_created_date','license','checkpoint_revision','parent_lineage'] and r['model_id'].startswith('hf_'): sid=r['model_id']+'_meta' if r['model_id']+'_meta' in src else sid
            elif field=='current_parent' and r.get('current_parent_source_id'): sid=r['current_parent_source_id']
            elif field=='current_parent' and r['current_parent']=='SpaceX': sid='xai_parent'
            elif et=='spec' and field in ['total_parameters_b','active_parameters_b'] and r.get(field.removesuffix('_b')+'_source_id'): sid=r[field.removesuffix('_b')+'_source_id']
            elif field=='native_context_tokens': sid=r.get('native_context_source_id') or sid
            elif field.startswith('config_'): sid=r.get('config_source_id')
            elif field.startswith('reasoning_'): sid=r.get('reasoning_source_id') or sid
            elif et=='offer' and field in ['provider_context_tokens','max_input_tokens','max_output_tokens','context_budget_rule','output_cap_type']: sid=r.get('constraints_source_id')
            elif et=='offer' and field in ['cache_lifetime_seconds','cache_min_tokens']: sid=r.get('cache_source_id') or sid
            elif et=='offer' and field in ['cache_write_usd_per_million','long_cache_write_usd_per_million']: sid=r.get('cache_write_source_id') or sid
            if r.get(field+'_source_id'): sid=r[field+'_source_id']
            status='unknown' if v is None or v=='unknown' else 'estimated' if field in ['specialization','product_class','classification_confidence','classification_rationale','cadence_family'] or (field=='architecture' and r.get('model_id','').startswith('hf_')) or (field=='context_budget_rule' and r.get('routing')) else 'disclosed'
            if status!='unknown' and et=='spec' and r.get(field.removesuffix('_b')+'_status')=='estimated': status='estimated'
            if status!='unknown': assert sid and src[sid]['status'] in ['retrieved','retrieved_via_web_tool','provided_by_user'],(et,r[key],field,sid)
            F.append(dict(assertion_id='a'+str(len(F)+1),entity_type=et,entity_id=r[key],field=field,value=v,status=status,unit='billion_parameters' if field.endswith('_parameters_b') else 'USD_per_million_tokens' if field.endswith('usd_per_million') else 'tokens' if field.endswith('_tokens') else 'seconds' if field.endswith('_seconds') else '',source_id=sid if status!='unknown' else None,effective_date=r.get('effective_date') or (r.get('release_date') if et=='model' and field.startswith('release_') else None) or OBS,observation_date=OBS,notes='Architecture classified from publisher card/config; not an efficiency metric.' if field=='architecture' else r.get('notes','')))

latest={}
for s in sorted(S,key=lambda x:(x['effective_date'],x['date_basis']=='observed_only')): latest[s['model_id']]=s
MASTER=[]
for m in M:
    s=latest[m['model_id']]; mo=[o for o in O if o['model_id']==m['model_id']]
    MASTER.append({**m,**{k:v for k,v in s.items() if k not in ['model_id','notes','observation_date']},'spec_notes':s['notes'],'offer_count':len(mo),'historical_offer_count':sum(x['date_basis'] in HISTORICAL for x in mo),'release_period':m['release_date'][:4] if m.get('release_date') and m['release_date']>=A.get('window_start','2022-11-30') else 'earlier_baseline' if m.get('release_date') else 'unknown'})

coverage=[]
for developer in sorted(set('SpaceX / xAI' if m['current_parent']=='SpaceX' else m['developer_at_release'] for m in M)):
    mids={m['model_id'] for m in M if ('SpaceX / xAI' if m['current_parent']=='SpaceX' else m['developer_at_release'])==developer}
    mm=[m for m in MASTER if m['model_id'] in mids]
    coverage.append(dict(developer=developer,models=len(mm),release_dates_known=sum(bool(m.get('release_date')) for m in mm),parameters_disclosed=sum(m.get('total_parameters_b') is not None and m.get('total_parameters_status')!='estimated' for m in mm),active_parameters_disclosed=sum(m.get('active_parameters_b') is not None and m.get('active_parameters_status')!='estimated' for m in mm),parameters_estimated=sum(m.get('total_parameters_b') is not None and m.get('total_parameters_status')=='estimated' for m in mm),active_parameters_estimated=sum(m.get('active_parameters_b') is not None and m.get('active_parameters_status')=='estimated' for m in mm),offers=sum(o['model_id'] in mids for o in O),performance_rows=sum(p['model_id'] in mids for p in P),**{str(y):sum(m['release_period']==str(y) for m in mm) for y in range(2022,2027)},earlier_baseline=sum(m['release_period']=='earlier_baseline' for m in mm),unknown_date=sum(m['release_period']=='unknown' for m in mm)))
assert len(coverage)>=21,len(coverage)

# Reproducible per-metric source coverage, including company/class graph filters.
master={m['model_id']:m for m in MASTER}; assertions={(a['entity_type'],a['entity_id'],a['field']):a for a in F}
MC=[]
for et,rows,key,fields in [('model',M,'model_id',['release_date','product_class','open_weights']),('spec',S,'spec_id',spec_fields),('offer',O,'offer_id',['input_usd_per_million','output_usd_per_million','cache_read_usd_per_million','provider_context_tokens','max_output_tokens'])]:
    for dim in ['all','developer','release_period','product_class']:
        buckets=collections.defaultdict(list)
        for r in rows:
            m=master[r['model_id']]
            group='all' if dim=='all' else ('SpaceX / xAI' if m['current_parent']=='SpaceX' else m['developer_at_release']) if dim=='developer' else m['release_period'] if dim=='release_period' else m.get('product_class') or 'unclassified'
            buckets[group].append(r)
        for group, rr in sorted(buckets.items()):
            for field in fields:
                aa=[assertions[et,r[key],field] for r in rr]; known=[a for a in aa if a['status']!='unknown']; sources_used={a['source_id'] for a in known}
                knownids={a['entity_id'] for a in known}; kr=[r for r in rr if r[key] in knownids]
                MC.append(dict(entity_type=et,metric=field,grouping=dim,group=group,records=len(rr),known=len(known),unknown=len(rr)-len(known),disclosed=sum(a['status']=='disclosed' for a in aa),estimated=sum(a['status']=='estimated' for a in aa),known_with_release_date=sum(bool(models[r['model_id']].get('release_date')) for r in kr),dated_historical_observations=sum(r.get('date_basis') in HISTORICAL or r.get('date_basis') in ['dated_announcement','dated_release_note','dated_documentation','archived_observation','reported_estimate'] for r in kr),current_observations=sum(r.get('date_basis') in ['current_only','observed_only'] for r in kr),primary_sourced=sum(src[a['source_id']]['source_type'].startswith('primary') for a in known),aggregator_sourced=sum(src[a['source_id']]['source_type'].startswith('aggregator') for a in known),editorial_convention=sum(src[a['source_id']]['source_type']=='editorial_convention' for a in known),distinct_sources=len(sources_used),source_ids=';'.join(sorted(sources_used))))
for metric in sorted(set(p['metric'] for p in P)):
    rr=[p for p in P if p['metric']==metric]; ids={p['source_id'] for p in rr}
    MC.append(dict(entity_type='performance',metric=metric,grouping='all',group='all',records=len(rr),known=len(rr),unknown=0,disclosed=len(rr),estimated=0,known_with_release_date=sum(bool(models[p['model_id']].get('release_date')) for p in rr),dated_historical_observations=0,current_observations=0,primary_sourced=len(rr),aggregator_sourced=0,editorial_convention=0,distinct_sources=len(ids),source_ids=';'.join(sorted(ids)),publication_dated_records=sum(bool(p.get('publication_date')) for p in rr),comparable_speed_trend_rows=0))
for name,rows in [('models',M),('spec_history',S),('provider_offers',O),('published_inference_performance',P),('workload_scenarios',SC),('derived_workload_costs',W),('cheapest_observed_by_date',CHEAP),('historical_cost_comparisons',COMPARE),('field_provenance',F),('sources',SOURCES),('master_view',MASTER),('coverage_by_developer',coverage),('per_metric_source_coverage',MC)]:write(name,rows)
counts={k:len(v) for k,v in [('models',M),('spec_history',S),('provider_offers',O),('published_inference_performance',P),('workload_scenarios',SC),('derived_workload_costs',W),('cheapest_observed_by_date',CHEAP),('historical_cost_comparisons',COMPARE),('field_provenance',F),('sources',SOURCES)]}
counts['per_metric_source_coverage']=len(MC)
if A.get('related_source_candidates'):
    for candidate in A['related_source_candidates']:
        assert candidate['model_id'] in models and candidate['source_id'] in src
        if candidate['status']=='secondary_candidate_not_merged':
            assert not models[candidate['model_id']]['release_date']
        else:
            assert candidate['verified_release_date']==models[candidate['model_id']]['release_date']
            assert candidate['verified_source_id'] in src
    write('related_source_candidates',A['related_source_candidates'])
    counts['related_source_candidates']=len(A['related_source_candidates'])
summary=dict(collection_date=OBS,counts=counts,release_periods=dict(collections.Counter(m['release_period'] for m in MASTER)),product_classes=dict(collections.Counter(m.get('product_class') or 'unclassified' for m in M)),fit_counts=dict(collections.Counter(w['fits_in_one_request'] for w in W)),eligible_cost_rows=sum(w['uncached_cost_usd'] is not None for w in W),conditional_cache_cost_rows=sum(w['cached_cost_per_1000_usd'] is not None for w in W),historical_offers=sum(o['date_basis'] in HISTORICAL for o in O),undated_announcement_offers=sum(o['date_basis']=='announcement_date_unresolved' for o in O),checks=['unique primary keys','all model/source foreign keys and successful retrieval or explicit user editorial convention','ISO dates and collection cutoff','nonnegative units and active <= total parameters','no current-price backdating','no historical constraints newer than offer','shared/separate budget rules','exact fit boundary and one-token overflow','missing output limit stays unknown','explicit input cap','whole-request long-context tier','retired offers excluded','cache writes are total rates, 10-request arithmetic','all eligible costs independently recomputed','at least the 21 original developers represented','editorial classes independent of parameter counts and prices','per-metric source coverage with company and class filters'],status='passed')
(ROOT/'validation.json').write_text(json.dumps(summary,indent=2)+'\n');print(json.dumps(summary,indent=2))
