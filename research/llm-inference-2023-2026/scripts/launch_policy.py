"""One evidence policy for paid API launch tariffs and their plotted dates."""
def launch_evidence(offer, model):
    evidence_class = offer.get('launch_price_evidence_class')
    if not evidence_class and offer.get('launch_price_verified') is True:
        evidence_class = 'explicit_launch'
    if evidence_class not in ('explicit_launch', 'launch_day_observed'):
        return None
    date = offer.get('api_launch_date') or model.get('api_launch_date') or model.get('release_date')
    assert date and offer.get('effective_date') == date, offer['offer_id']
    assert offer.get('launch_price_source_ids') and offer.get('launch_price_reason'), offer['offer_id']
    if evidence_class == 'launch_day_observed':
        capture = offer.get('launch_capture_timestamp')
        assert capture and capture[:10] == date, offer['offer_id']
    assert all(isinstance(offer.get(k), (int, float)) and offer[k] >= 0 for k in ('input_usd_per_million', 'output_usd_per_million')), offer['offer_id']
    return {'evidenceClass': evidence_class, 'apiLaunchDate': date,
            'modelReleaseDate': model.get('release_date'),
            'captureTimestamp': offer.get('launch_capture_timestamp')}
