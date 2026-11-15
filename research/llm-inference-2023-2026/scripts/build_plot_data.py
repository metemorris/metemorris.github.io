"""Adapt current CSVs using the existing validated cost engine; optional frozen snapshot.

Live charts read the editable models/spec_history/provider_offers CSVs. JSON input
edits are rebuilt by the dev integration first. All derived costs run rebuild.py
in an isolated temporary directory, so editing a price never leaves stale costs.
"""
import ast,argparse,contextlib,csv,hashlib,io,json,os,pathlib,runpy,shutil,tempfile,re
ROOT=pathlib.Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser();parser.add_argument('--records',action='store_true');parser.add_argument('--freeze',action='store_true');parser.add_argument('--snapshot',action='store_true');parser.add_argument('--output');parser.add_argument('--snapshot-dir',default='plots/snapshot');args=parser.parse_args()
snapshot=ROOT/args.snapshot_dir
if args.freeze:
    snapshot.mkdir(parents=True,exist_ok=True)
    if (snapshot/'manifest.json').exists(): raise SystemExit('Snapshot already frozen; choose a new snapshot rather than overwrite.')
    for p in (ROOT/'data').rglob('*'):
        if p.suffix in ['.json','.csv'] or 'review_evidence' in p.parts and p.is_file():
            target=snapshot/p.relative_to(ROOT/'data');target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,target)
    shutil.copy2(ROOT/'validation.json',snapshot/'validation.json')
    manifest={'cutoff':json.loads((ROOT/'data/research_inputs.json').read_text())['collection_date'],'purpose':'Frozen figure export; live Astro draft reads research/data instead.','files':{str(p.relative_to(snapshot)):hashlib.sha256(p.read_bytes()).hexdigest() for p in snapshot.rglob('*') if p.is_file()}}
    (snapshot/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
D=snapshot if args.snapshot else ROOT/'data'
a=json.loads((D/'research_inputs.json').read_text())
launch_evidence=runpy.run_path(str(ROOT/'scripts/launch_policy.py'))['launch_evidence']
def rows(d,name):return list(csv.DictReader((d/(name+'.csv')).open()))
def convert(v,old,k):
    if v=='':return '' if isinstance(old,str) else None
    if isinstance(old,(list,dict)):
        try:parsed=json.loads(v)
        except json.JSONDecodeError:parsed=ast.literal_eval(v)
        assert isinstance(parsed,type(old));return parsed
    if isinstance(old,bool):return v.lower()=='true'
    if isinstance(old,(int,float)) or k.endswith(('_tokens','_parameters_b','usd_per_million','_seconds','_fraction')):
        n=float(v);return int(n) if n.is_integer() else n
    return v
for key,filename,idkey in [('models','models','model_id'),('specs','spec_history','spec_id'),('offers','provider_offers','offer_id'),('performance','published_inference_performance','performance_id')]:
    lookup={r[idkey]:r for r in a[key]}
    a[key]=[{k:convert(v,lookup.get(r[idkey],{}).get(k),k) for k,v in r.items()} for r in rows(D,filename)]
if args.records:
    print(json.dumps(a,separators=(',',':')));raise SystemExit
# Reuse the production research calculation code, never mirror its formulas here.
with tempfile.TemporaryDirectory(prefix='llm-chart-data-') as temp:
    tr=pathlib.Path(temp);td=tr/'data';td.mkdir();(td/'research_inputs.json').write_text(json.dumps(a))
    old=os.environ.get('LLM_RESEARCH_ROOT');os.environ['LLM_RESEARCH_ROOT']=str(tr)
    try:
        with contextlib.redirect_stdout(io.StringIO()):runpy.run_path(str(ROOT/'scripts/rebuild.py'))
    finally:
        if old is None:os.environ.pop('LLM_RESEARCH_ROOT',None)
        else:os.environ['LLM_RESEARCH_ROOT']=old
    master=rows(td,'master_view');work=rows(td,'derived_workload_costs');valid=json.loads((tr/'validation.json').read_text())
M={m['model_id']:m for m in a['models']};O={o['offer_id']:o for o in a['offers']};S={s['id']:s for s in a['sources']}
companies=sorted(set('SpaceX / xAI' if m['current_parent']=='SpaceX' else m['developer_at_release'] for m in M.values()))
palette=['#2563eb','#b45309','#168074','#c026d3','#65721b','#db2777','#047857','#8b5cf6','#c2410c','#4f46e5','#537c8e','#b91c1c','#7c3aed','#846638','#059669','#9d174d','#3b6b2d','#a16207','#0e7490','#be185d','#525d6d']
colors={c:palette[i%len(palette)] for i,c in enumerate(companies)};colors.update({'Anthropic':'#D97706','Google':'#0284C7'});points=[];omissions={};num=lambda v:float(v) if v not in [None,''] else None
def channel(m):
    if m.get('release_channel'):return m['release_channel']
    event=(m.get('release_event') or m.get('release_date_basis') or '').lower()
    return 'weights' if 'weight' in event else 'product' if 'product' in event else 'api' if 'api' in event else 'publisher_event'
hist={'launch','price_change','announced_price_change','dated_announcement','dated_release_note','dated_documentation','archived_observation'}
def add(metric,r,value,day,sid,kind,mode,idkey,provider='',notes='',scenario=None,status='disclosed',**extra):
    m=M[r['model_id']];n=num(value)
    if n is None or n<=0 or not day:return False
    points.append(dict(id=idkey+'__'+metric+('__'+scenario if scenario else ''),metric=metric,modelId=m['model_id'],articleEligible=m.get('article_eligible') is not False,model=m['exact_version'],company='SpaceX / xAI' if m['current_parent']=='SpaceX' else m['developer_at_release'],productClass=m.get('product_class') or 'unclassified',family=m.get('cadence_family') or m['family'],specialization=m.get('specialization'),classificationRationale=m.get('classification_rationale'),classificationConfidence=m.get('classification_confidence','editorial convention'),classificationSource=S[m['classification_source_id']]['url'] if m.get('classification_source_id') else '',weightAccess={'yes':'open','no':'closed'}.get(m.get('open_weights'),'unknown'),weightAccessAsOf=a['collection_date'],license=m.get('license'),releaseEvent=m.get('release_event') or m.get('release_date_basis'),releasePrecision=m.get('release_date_precision') or 'day',releaseChannel=channel(m),date=day,releaseDate=m.get('release_date'),value=n,kind=kind,mode=mode,status=status,provider=provider,sourceId=sid,source=S[sid]['url'] if sid else '',availability=r.get('availability'),endpoint=r.get('endpoint_model_id'),servedRelation=r.get('served_model_relation'),quantization=r.get('quantization'),documentationOnly=r.get('documentation_only'),pricingCondition=r.get('pricing_condition'),reasoningMode=r.get('reasoning_mode'),region=r.get('region'),notes=notes or '',scenario=scenario,reasoningSharesOutput=r.get('reasoning_shares_output_limit'),serviceTier=extra.pop('serviceTier',r.get('service_tier') or ''),**extra))
    return True
for metric,field in [('total','total_parameters_b'),('active','active_parameters_b')]:
    missing=undated=0
    for mid, m in M.items():
        available=[s for s in a['specs'] if s['model_id']==mid and num(s.get(field)) is not None]
        if not available:missing+=1;continue
        if not m['release_date']:undated+=1;continue
        s=max(available,key=lambda s:(s.get(field.removesuffix('_b')+'_status')!='estimated',s['effective_date']))
        add(metric,s,s[field],m['release_date'],s.get(field.removesuffix('_b')+'_source_id') or s['source_id'],s.get('architecture') or 'unknown','release',mid,status=s.get(field.removesuffix('_b')+'_status') or 'disclosed',estimateAttribution=s.get('parameter_estimate_attribution'),evidenceDate=s['effective_date'],notes='Model release cohort; evidence date '+s['effective_date']+'. Not a historical disclosure-date claim. '+(s.get('notes') or ''))
    omissions[metric]={'candidates':len(master),'missing':missing,'undated':undated}
# Capacity uses spec effective dates, never the model release date.
for s in a['specs']:
    mode='historical' if s['date_basis'] in hist else 'current'
    fields=[('native_context_tokens','native'),('extended_context_tokens','extended')]
    if not s.get('native_context_tokens') and not s.get('extended_context_tokens'):fields.append(('advertised_context_tokens','advertised'))
    fields.append(('provider_supported_context_tokens','served'))
    for f,k in fields:
        add('context',s,s.get(f),s['effective_date'],s.get('native_context_source_id') if k=='native' and s.get('native_context_source_id') else s['source_id'],k+(' beta/opt-in' if s.get('limit_access')=='beta' and (not s.get('limit_access_fields') or f in s['limit_access_fields']) else ''),mode,s['spec_id']+'_'+k,provider=s.get('provider') or '',notes=(s.get('notes') or '')+' '+(s.get('extension_method') or ''))
# Published input caps only: never derive context minus an output reservation.
for o in a['offers']:
    add('input',o,o.get('max_input_tokens'),o['effective_date'],o.get('max_input_tokens_source_id') or o.get('constraints_source_id'),'published input cap','historical' if o['date_basis'] in hist else 'current',o['offer_id'],provider=o['provider'],notes=o.get('notes'))
for s in a['specs']:
    add('input',s,s.get('max_input_tokens'),s['effective_date'],s.get('max_input_tokens_source_id') or s['source_id'],'published input cap','historical' if s['date_basis'] in hist else 'current',s['spec_id'],provider=s.get('provider') or '',notes=s.get('notes'))
# Output caps come from the exact priced provider; retain unpriced specs separately.
output_models=set()
for o in a['offers']:
    if o.get('max_output_tokens') is None:continue
    output_models.add(o['model_id'])
    add('output',o,o['max_output_tokens'],o['effective_date'],o.get('max_output_tokens_source_id') or o['constraints_source_id'],'served','historical' if o['date_basis'] in hist else 'current',o['offer_id'],provider=o['provider'],notes=(o.get('notes') or '')+' Availability: '+o['availability']+'. Tier: '+o['service_tier'])
for s in a['specs']:
    if s['model_id'] not in output_models or s['date_basis'] in hist or s.get('limit_access')=='beta':
        add('output',s,s.get('max_output_tokens'),s['effective_date'],s['source_id'],'beta/opt-in' if s.get('limit_access')=='beta' or 'beta' in (s.get('notes') or '').lower() else 'documented cap','historical' if s['date_basis'] in hist else 'current',s['spec_id'],provider=s.get('provider') or '',notes=s.get('notes'))
for metric in ['input','context','output']:
    seen={p['modelId'] for p in points if p['metric']==metric};omissions[metric]={'candidates':len(M),'modelsWithoutMetric':len(M)-len(seen),'note':'Observations may repeat models/providers; current observations are not backdated.'}
for o in a['offers']:
    if o['date_basis'] not in hist and o['date_basis']!='current_only':continue
    mode='historical' if o['date_basis'] in hist else 'current'
    for metric,f in [('input_price','input_usd_per_million'),('output_price','output_usd_per_million')]:
        threshold=o.get('long_context_threshold_tokens');band='prompt <= '+str(threshold) if threshold else 'base';condition=('Prompt <= '+str(threshold)+' tokens. ') if threshold else ''
        add(metric,o,o[f],o['effective_date'],o['pricing_source_id'],o['date_basis'],mode,o['offer_id'],provider=o['provider'],priceTier=band,pricingBand=condition.strip(),notes=condition+'Base/short-prompt rate; tier '+o['service_tier']+'. Availability: '+o['availability']+'. '+(o.get('notes') or ''))
        longfield='long_input_usd_per_million' if metric=='input_price' else 'long_output_usd_per_million'
        if threshold and o.get(longfield) is not None:
            add(metric,o,o[longfield],o['effective_date'],o.get(longfield+'_source_id') or o['pricing_source_id'],o['date_basis'],mode,o['offer_id']+'_long',provider=o['provider'],priceTier='prompt > '+str(threshold),pricingBand='Prompt > '+str(threshold)+' tokens',notes='Whole-request long-prompt rate above '+str(threshold)+' input tokens; tier '+o['service_tier']+'. Availability: '+o['availability']+'. '+(o.get('notes') or ''))
# Article price cohorts use source-backed paid API launch tariffs and exact launch-day captures.
# Later archived/current prices remain separate research observations above.
for o in a['offers']:
    if o.get('service_tier')!='standard' or M[o['model_id']].get('article_eligible') is False:continue
    launch=launch_evidence(o,M[o['model_id']])
    if not launch:continue
    assert o['effective_date']==launch['apiLaunchDate'] and o.get('launch_price_source_ids')
    for metric,f in [('input_price','input_usd_per_million'),('output_price','output_usd_per_million')]:
        threshold=o.get('long_context_threshold_tokens');band='prompt <= '+str(threshold) if threshold else 'base'
        add(metric,o,o[f],launch['apiLaunchDate'],o['launch_price_source_ids'][0],'verified launch tariff','launch',o['offer_id']+'_launch',provider=o['provider'],priceTier=band,pricingBand='Prompt <= '+str(threshold)+' tokens' if threshold else '',launchEligible=True,launchVerified=launch['evidenceClass']=='explicit_launch',launchEvidenceClass=launch['evidenceClass'],apiLaunchDate=launch['apiLaunchDate'],captureTimestamp=launch['captureTimestamp'],launchSources=[S[sid]['url'] for sid in o['launch_price_source_ids']],notes=o['launch_price_reason']+' '+(o.get('notes') or ''))
for metric in ['input_price','output_price']:omissions[metric]={'candidates':len(O),'undated':sum(o['date_basis']=='announcement_date_unresolved' for o in O.values())}
for w in work:
    if w['uncached_cost_usd']=='':continue
    o=O[w['offer_id']]
    if o['date_basis'] not in hist and o['date_basis']!='current_only':continue
    add('cost',dict(o,**w),w['uncached_cost_usd'],w['evidence_date'],o['pricing_source_id'],o['date_basis'],'historical' if o['date_basis'] in hist else 'current',w['offer_id'],provider=o['provider'],scenario=w['scenario_id'],priceTier=w['applied_price_tier'],serviceTier=o['service_tier'],notes='Fixed billed-token budget; eligible under recorded caps. Tier: '+w['applied_price_tier']+' / '+o['service_tier']+'. '+(o.get('notes') or ''))
# Cost cohorts require both the same launch tariff and contemporaneous caps.
for w in work:
    o=O[w['offer_id']];release=M[o['model_id']].get('release_date')
    if w['uncached_cost_usd']=='' or o.get('launch_price_verified') is not True or o.get('service_tier')!='standard':continue
    if not o.get('constraints_date') or o['constraints_date']>release:continue
    if w['applied_price_tier']!='standard' and not o.get('launch_long_rates_verified'):continue
    add('cost',dict(o,**w),w['uncached_cost_usd'],release,o['launch_price_source_ids'][0],'verified launch tariff','launch',w['offer_id']+'_launch',provider=o['provider'],scenario=w['scenario_id'],priceTier=w['applied_price_tier'],serviceTier=o['service_tier'],launchVerified=True,notes='Launch cohort: fixed billed-token budget fits constraints documented by the release date. '+o['launch_price_reason'])
omissions['cost']={'candidates':len(O),'byScenario':{sid:{'ineligible':sum(w['scenario_id']==sid and w['uncached_cost_usd']=='' for w in work),'unknownFit':sum(w['scenario_id']==sid and w['fits_in_one_request']=='unknown' for w in work)} for sid in sorted(set(w['scenario_id'] for w in work))}}
# Collapse simultaneous sibling versions into one company/family/class/day event.
# Keep unclassified events in the timeline, but never treat "unclassified" as a
# comparable capability/product-positioning cohort for inter-release gaps.
canonical={};unknown=serving_only=duplicate=0
for m in a['models']:
    if m['model_id']=='minimax_m25_lightning' or m.get('cadence_excluded_reason') or m.get('article_eligible') is False:serving_only+=1;continue
    if not m.get('release_date'):unknown+=1;continue
    identity=m['developer_at_release']+':'+re.sub('[^a-z0-9]','',m['exact_version'].split('/')[-1].lower())
    if identity in canonical:duplicate+=1;continue
    canonical[identity]=m
from collections import defaultdict
from datetime import date as date_type
events=defaultdict(list)
for m in canonical.values():
    company='SpaceX / xAI' if m['current_parent']=='SpaceX' else m['developer_at_release']
    events[(company,m.get('cadence_family') or m['family'],m.get('product_class') or 'unclassified',m['release_date'],m.get('open_weights'),channel(m))].append(m)
cohorts=defaultdict(list);event_points=[]
for (company,family,cl,dt,access,event_channel),members in sorted(events.items()):
    m=members[0];eid='event_'+hashlib.sha256((company+family+cl+dt+str(access)+event_channel).encode()).hexdigest()[:12]
    add('releases',m,1,dt,m['release_source_id'],cl,'release',eid,notes='Recorded release event: same company, family, product class and date. Simultaneous sibling variants collapsed. '+str(len(members))+' named versions: '+', '.join(x['exact_version'] for x in members)+'.')
    p=points[-1];p['releaseEvidence']=[{'model':x['exact_version'],'modelId':x['model_id'],'weightAccess':{'yes':'open','no':'closed'}.get(x.get('open_weights'),'unknown'),'event':x.get('release_event') or x.get('release_date_basis'),'note':x.get('release_evidence_note') or x.get('notes',''),'source':S[x['release_source_id']]['url']} for x in members];p['memberIds']=[x['model_id'] for x in members];p['family']=family;p['members']=[x['exact_version'] for x in members];p['memberSources']=list(dict.fromkeys(S[x['release_source_id']]['url'] for x in members));event_points.append(p)
    if cl!='unclassified':cohorts[(company,family,cl,event_channel)].append((m,p))
cohort_summary=[];gap_count=0
for (company,family,cl,event_channel),members in sorted(cohorts.items()):
    members.sort(key=lambda pair:pair[1]['date']);gaps=[]
    for (prev,pp),(m,p) in zip(members,members[1:]):
        gap=(date_type.fromisoformat(p['date'])-date_type.fromisoformat(pp['date'])).days
        if gap<=0:continue
        add('release_gap',m,gap,p['date'],m['release_source_id'],cl,'release',p['id']+'_gap',status='derived',notes='Days since preceding recorded release in '+company+' / '+family+' / '+cl+'. Previous event: '+pp['date']+'. Missing releases can lengthen this observed gap; this is not a complete cadence census.')
        points[-1].update(previousDate=pp['date'],previousSource=pp['source'],cohort=company+' / '+family+' / '+cl);gaps.append(gap);gap_count+=1
    cohort_summary.append(dict(company=company,family=family,productClass=cl,events=len(members),first=members[0][1]['date'],last=members[-1][1]['date'],firstGap=gaps[0] if gaps else None,lastGap=gaps[-1] if gaps else None,comparison='insufficient history' if len(gaps)<2 else 'shorter observed gap' if gaps[-1]<gaps[0] else 'longer observed gap' if gaps[-1]>gaps[0] else 'same observed gap',fullWindowCoverage=members[0][1]['date']<=a.get('window_start','2022-11-30') and members[-1][1]['date']>='2026-10-01'))
omissions['releases']={'candidates':len(M),'undated':unknown,'servingOnly':serving_only,'duplicates':duplicate,'canonicalDatedVersions':len(canonical),'siblingVersionsCollapsed':len(canonical)-len(events),'events':len(events),'unclassified':sum(p['productClass']=='unclassified' for p in event_points),'unit':'One company/family/product-class/date event. Simultaneous sibling sizes and base/instruct variants collapse. Aliases, quantizations, price changes, serving-only speed SKUs excluded.'}
omissions['release_gap']={'events':len(events),'gapObservations':gap_count,'unclassifiedExcluded':sum(p['productClass']=='unclassified' for p in event_points),'cohorts':cohort_summary,'note':'Successive recorded events within company/family/assigned class; no unclassified cohort. At least three events (two gaps) needed to compare gaps. Incomplete inventory can overstate intervals.'}
sourcehash=hashlib.sha256(b''.join((D/n).read_bytes() for n in ['models.csv','spec_history.csv','provider_offers.csv','company_regions.json'])).hexdigest()
payload={'windowStart':a.get('window_start','2022-11-30'),'cutoff':a.get('analysis_cutoff',a['collection_date']),'collectionDate':a['collection_date'],'frozen':args.snapshot,'revision':sourcehash[:12],'rowCounts':valid['counts'],'evidenceCounts':{'historicalOffers':valid['historical_offers'],'currentOffers':sum(o['date_basis']=='current_only' for o in a['offers'])},'productClasses':valid['product_classes'],'accessCoverage':{k:sum({'yes':'open','no':'closed'}.get(m.get('open_weights'),'unknown')==k for m in M.values()) for k in ['open','closed','unknown']},'companies':companies,'colors':colors,'points':points,'omissions':omissions,'scenarios':[{'id':'8k_in_2k_out','label':'8K input + 2K output'},{'id':'32k_in_2k_out','label':'32K input + 2K output'},{'id':'128k_in_4k_out','label':'128K input + 4K output'},{'id':'1m_in_8k_out','label':'1M input + 8K output'}]}
payload['classificationCatalog']=[dict(model=m['exact_version'],company=m['developer_at_release'],productClass=m.get('product_class'),date=m.get('release_date'),rationale=m.get('classification_rationale'),confidence=m.get('classification_confidence') or 'user editorial convention',basis=S.get(m.get('classification_source_id'),{}).get('source_type','publisher evidence / provisional lineage'),source=S.get(m.get('classification_source_id'),{}).get('url',''),identitySource=S.get(m.get('identity_source_id'),{}).get('url','')) for m in M.values() if m.get('product_class')]
payload['records']=list(M.values())
payload['articleCoverage']=runpy.run_path(str(ROOT/'scripts/build_article_audit.py'))['build'](a,D)
payload['articleLaunchPrices']=runpy.run_path(str(ROOT/'scripts/build_launch_price_audit.py'))['build'](a,payload['articleCoverage'],D)
payload['milestones']=a.get('release_milestones',[])
payload['geography']=json.loads((D/'company_regions.json').read_text())
out=json.dumps(payload,separators=(',',':'))
if args.output:pathlib.Path(args.output).write_text(out+'\n')
else:print(out)
