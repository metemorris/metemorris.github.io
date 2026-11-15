"""Per-model metric coverage for the five-company article; broad catalog retained."""
import csv,json,pathlib,collections
R=pathlib.Path(__file__).resolve().parents[1];D=R/'data';HIST={'launch','price_change','announced_price_change','dated_announcement','dated_release_note','dated_documentation','archived_observation'}
FIELDS={'release_date':('release','Release date'),'max_input_tokens':('input','Published input limit'),'max_output_tokens':('output','Published output limit'),'context_tokens':('context','API / provider context'),'input_usd_per_million':('input_price','Input price'),'output_usd_per_million':('output_price','Output price')}
COMPANIES=['OpenAI','Anthropic','Google','Meta','SpaceX / xAI']
def company(m):return 'SpaceX / xAI' if m['current_parent']=='SpaceX' else m['developer_at_release']
def build(a,review_dir=D):
 src={s['id']:s for s in a['sources']};overrides={}
 for path in sorted(review_dir.glob('article_*_metric_audit.json')):
  x=json.loads(path.read_text());rows=x if isinstance(x,list) else x.get('entries',x.get('rows',[]))
  for e in rows:overrides[(e['model_id'],e['metric'])]=e
 rows=[]
 for m in a['models']:
  if company(m) not in COMPANIES or not m.get('product_class') or m.get('article_eligible') is False:continue
  if m.get('release_date') and m['release_date']>a.get('analysis_cutoff',a['collection_date']):continue
  specs=[s for s in a['specs'] if s['model_id']==m['model_id']];offers=[o for o in a['offers'] if o['model_id']==m['model_id']];metrics={}
  for field,(key,label) in FIELDS.items():
   evidence=[];extra=overrides.get((m['model_id'],field),{})
   def add(r,value,sid,provider='',definition='',availability=None):
    if value is None:return
    evidence.append(dict(value=value,date=m.get('release_date') if key=='release' else (r.get(field+'_effective_date') or (r.get('constraints_date') if key in ['input','output','context'] and r.get('offer_id') else None) or r.get('effective_date')),observed=r.get('observation_date') or src.get(sid,{}).get('retrieved_on'),basis=r.get('date_basis') or 'release',sourceIds=[sid] if sid else [],sourceUrls=[src[sid]['url']] if sid in src else [],provider=provider,definition=definition,availability=availability or r.get('availability'),notes=r.get('notes',''),recordId=r.get('offer_id') or r.get('spec_id') or m['model_id'],beta=r.get('limit_access')=='beta' and (not r.get('limit_access_fields') or ('provider_supported_context_tokens' if key=='context' else field) in r['limit_access_fields']),serviceTier=(r.get('service_tier') or 'standard'),endpoint=r.get('endpoint_model_id'),servedRelation=r.get('served_model_relation'),quantization=r.get('quantization'),documentationOnly=r.get('documentation_only'),region=r.get('region') or r.get('pricing_region'),servingEligible=r.get('serving_eligible',True),contextKind=r.get('context_kind')))
   if key=='release':add(m,m.get('release_date'),m.get('release_source_id'),definition=m.get('release_event') or m.get('release_date_basis'))
   elif key in ['input_price','output_price']:
    for o in offers:add(o,o.get(field),o.get(field+'_source_id') or o['pricing_source_id'],o['provider'],o.get('service_tier','standard'))
   else:
    for o in offers:
     f='provider_context_tokens' if key=='context' else field
     add(o,o.get(f),o.get(f+'_source_id') or o.get('constraints_source_id'),o['provider'],'API / provider limit')
    for s in specs:
     f='provider_supported_context_tokens' if key=='context' else field
     add(s,s.get(f),s.get(f+'_source_id') or s.get('source_id'),s.get('provider') or m['developer_at_release'],'API / provider limit')
     if key=='context' and s.get('advertised_context_tokens') is not None:
      add(dict(s,serving_eligible=False,context_kind='checkpoint'),s['advertised_context_tokens'],s.get('advertised_context_tokens_source_id') or s.get('source_id'),m['developer_at_release'],'Advertised checkpoint context')
   # Reviewed publisher evidence can establish a number without a dated
   # tariff (e.g. an undated retrospective PDF). It stays outside cost/history.
   review_evidence=list(extra.get('historical_evidence',[]))
   if extra.get('value') is not None:review_evidence.append(extra)
   for e in review_evidence:
    if e.get('value') is None:continue
    date=e.get('effective_date');ids=e.get('source_ids') or extra.get('source_ids',[])
    if not ids:continue
    if any(v['value']==e['value'] and v['date']==date and set(v['sourceIds'])==set(ids) and v.get('servingEligible',True)==e.get('serving_eligible',extra.get('serving_eligible',True)) for v in evidence):continue
    basis=e.get('date_basis') or ('archived_observation' if any(src.get(s,{}).get('archive_timestamp') for s in ids) else 'observed_only' if date==e.get('observation_date') else 'dated_announcement' if date else 'undated_retrospective')
    evidence.append(dict(value=e['value'],date=date,observed=e.get('observation_date') or extra.get('observation_date'),basis=basis,sourceIds=ids,sourceUrls=[src[s]['url'] for s in ids if s in src],provider=e.get('provider') or extra.get('provider') or m['developer_at_release'],definition='Published context statement' if key=='context' else 'Reviewed publisher evidence',availability=e.get('availability'),notes=e.get('reason') or extra.get('reason',''),recordId=e.get('spec_id') or e.get('offer_id'),beta=e.get('limit_access')=='beta',serviceTier=(e.get('service_tier') or 'standard'),servingEligible=e.get('serving_eligible',extra.get('serving_eligible',True)),contextKind=e.get('context_kind') or extra.get('context_kind')))
   # Standard limits are not replaced by an opt-in beta maximum. Exact numeric
   # historical evidence stays dated; it is not relabeled current availability.
   usable=[e for e in evidence if not e['beta'] and e.get('servingEligible',True)]
   usable.sort(key=lambda e:(e['date'] or '',e['serviceTier']=='standard',all(src.get(s,{}).get('source_type','').startswith('primary') for s in e['sourceIds'])),reverse=True)
   chosen=usable[0] if usable else None
   if key=='input' and not chosen and any(s.get('context_budget_rule')=='shared_input_output' for s in specs+offers):
    extra=dict(extra,status='shared_context_budget',reason=extra.get('reason') or 'Input and generated output share the documented context window; no independent input cap is published.')
   if not chosen and not extra.get('status'):
    declared=[s for s in specs if s.get(field+'_status')]
    if declared:
     s=sorted(declared,key=lambda s:s.get('effective_date') or '')[-1]
     extra=dict(extra,status=s[field+'_status'],reason=s.get('notes'),source_ids=[s['source_id']])
    elif m.get('open_weights')=='yes' and key!='release':
     extra=dict(extra,status='weights_only_no_verified_host',reason='Open checkpoint identity: no verified named hosted endpoint supports this field. Checkpoint/native context is retained separately and is not an API limit or a universal token tariff.',source_ids=list(dict.fromkeys([m['release_source_id']]+[s['source_id'] for s in specs])))
    elif any(s.get('provider_supported_context_tokens') is not None for s in specs) and key in ['input','output']:
     extra=dict(extra,status='undisclosed',reason='The reviewed exact-model documentation does not disclose a separate numeric cap for this field.',source_ids=list(dict.fromkeys(s['source_id'] for s in specs)))
   if extra.get('status')=='shared_context_budget' and not extra.get('source_ids'):
    extra=dict(extra,source_ids=list(dict.fromkeys(s.get('context_budget_rule_source_id') or s.get('source_id') or s.get('constraints_source_id') for s in specs+offers if s.get('context_budget_rule')=='shared_input_output')))
   status='published_date' if chosen and key=='release' else 'published_numeric' if chosen else extra.get('status','collection_gap')
   if not chosen and status=='published_numeric':status='checkpoint_only_no_hosted_limit' if any(e.get('servingEligible') is False for e in evidence) else 'collection_gap'
   if key=='release' and not chosen:
    status='release_date_unresolved';extra=dict(extra,reason=m.get('release_evidence_note') or m.get('notes') or 'Exact first public release date is not established; upload timestamps are not automatically release dates.',source_ids=[m.get('identity_source_id') or m.get('release_source_id')])
   if extra.get('status') in ['alias_unresolved','product_only_no_api'] and not any(e['basis'] in HIST for e in usable):
    # An explicit identity review can invalidate assigning an endpoint's number
    # to the canonical identity without deleting the retained broad evidence.
    status=extra['status'];chosen=None
   reason=((chosen or {}).get('notes') if chosen and extra.get('status')=='alias_unresolved' else None) or extra.get('reason') or ('Latest documented value for this exact identity/provider; inspect date and availability.' if chosen else 'No verified evidence recovered for this field after the scoped review.')
   ids=list(dict.fromkeys((chosen or {}).get('sourceIds',[])+extra.get('source_ids',[])))
   metrics[key]=dict(metric=key,label=label,status=status,value=(chosen or {}).get('value'),date=(chosen or {}).get('date') or extra.get('effective_date'),observed=(chosen or {}).get('observed') or extra.get('observation_date'),basis=(chosen or {}).get('basis') or extra.get('date_basis'),provider=(chosen or {}).get('provider') or extra.get('provider'),availability=(chosen or {}).get('availability'),definition=(chosen or {}).get('definition'),serviceTier=(chosen or {}).get('serviceTier'),endpoint=(chosen or {}).get('endpoint'),servedRelation=(chosen or {}).get('servedRelation'),quantization=(chosen or {}).get('quantization'),documentationOnly=(chosen or {}).get('documentationOnly'),region=(chosen or {}).get('region'),notes=(chosen or {}).get('notes'),reason=reason,sourceIds=ids,sourceUrls=[src[x]['url'] for x in ids if x in src],historicalNumeric=(key=='release' and bool(chosen)) or any(e['basis'] in HIST for e in usable),currentNumeric=any(e['basis'] in ['current_only','observed_only'] for e in usable),evidence=evidence,review=extra)
  rows.append(dict(modelId=m['model_id'],model=m['exact_version'],company=company(m),role=m['product_class'],releaseDate=m.get('release_date'),weightAccess={'yes':'open','no':'closed'}.get(m.get('open_weights'),'unknown'),metrics=metrics))
 summary={key:dict(models=len(rows),numeric=sum(r['metrics'][key]['value'] is not None for r in rows),historicalNumeric=sum(r['metrics'][key]['historicalNumeric'] for r in rows),currentNumeric=sum(r['metrics'][key]['currentNumeric'] for r in rows),statuses=dict(collections.Counter(r['metrics'][key]['status'] for r in rows))) for key,_ in FIELDS.values()}
 return dict(cutoff=a.get('analysis_cutoff',a['collection_date']),companies=COMPANIES,modelCount=len(rows),summary=summary,models=rows)
if __name__=='__main__':
 a=json.loads((D/'research_inputs.json').read_text());out=build(a);(D/'article_metric_coverage.json').write_text(json.dumps(out,indent=2,ensure_ascii=False)+'\n')
 flat=[dict(model_id=r['modelId'],model=r['model'],company=r['company'],role=r['role'],weight_access=r['weightAccess'],**{k:v for k,v in cell.items() if k not in ['evidence','review']}) for r in out['models'] for cell in r['metrics'].values()]
 with (D/'article_metric_coverage.csv').open('w',newline='') as f:
  w=csv.DictWriter(f,fieldnames=list(flat[0]));w.writeheader();w.writerows({k:json.dumps(v,ensure_ascii=False) if isinstance(v,(list,dict)) else v for k,v in r.items()} for r in flat)
 gaps=[r for r in flat if r['value'] is None];(D/'article_metric_gaps.json').write_text(json.dumps(gaps,indent=2,ensure_ascii=False)+'\n')
 lines=['# Five-company metric audit','',f"Evidence reviewed through {out['cutoff']}. All {out['modelCount']} existing classified identities of OpenAI, Anthropic, Google, Meta and SpaceX/xAI were reviewed across six fields ({out['modelCount']*6} cells). The broader {len(a['models'])}-record catalog retains all identities and explicit exclusions.",'','| Metric | Numeric / dated | Shared budget | Other nonnumeric | Historical numeric |','|---|---:|---:|---:|---:|']
 for key,label in FIELDS.values():
  t=out['summary'][key];shared=t['statuses'].get('shared_context_budget',0);lines.append(f"| {label} | {t['numeric']} | {shared} | {t['models']-t['numeric']-shared} | {t['historicalNumeric']} |")
 lines+=['','Numeric coverage includes later documentation and qualified provider quotes; it is not historical availability or workload eligibility. Shared budgets are known constraints, not independent numeric caps. No input maximum is inferred by subtracting output from context. No current document is backdated to launch. Missing values are never zero.','', 'Batches 14–18 recover archived OpenAI and Google documentation, retired Claude/Meta/xAI caps, undated retrospective Claude prices, an explicitly mapped Gemini Flash-002 alias quote and qualified Meta host quotes. Batches 19–26 add further price-history recovery and strict exact-release launch qualification; LAUNCH_PRICE_AUDIT.md separates launch tariffs from all other prices. The Together Maverick price is for Instruct-FP8, not tensor-identical original weights. The AWS 405B endpoint is retired. Both documentation-only quotes are excluded from workload cost.','', f"The complete {out['modelCount']*6}-cell source-linked matrix is [JSON](data/article_metric_coverage.json) or [CSV](data/article_metric_coverage.csv). The exact nonnumeric list is [JSON](data/article_metric_gaps.json). Historical evidence and all candidate observations are retained separately in each cell.",'', '## Exact nonnumeric fields','', 'Shared-budget entries are included below for completeness; they are not unresolved research gaps. Fields not yet supported by a completed evidence search remain explicit collection gaps. Unavailable historical evidence is a result of this review, not proof that no document ever existed.']
 for r in out['models']:
  missing=[c for c in r['metrics'].values() if c['value'] is None]
  if not missing:continue
  lines+=['',f"### {r['company']} — {r['model']} (`{r['modelId']}`)",'']
  for c in missing:
   refs=' · '.join(f'[Source {i+1}]({url})' for i,url in enumerate(c['sourceUrls']))
   lines.append(f"- **{c['label']} — {c['status']}**: {c['reason']} {refs}")
 (R/'ARTICLE_METRIC_AUDIT.md').write_text('\n'.join(lines)+'\n')
 print(json.dumps(dict(models=out['modelCount'],summary=out['summary'],remaining_non_numeric_cells=len(gaps))))
