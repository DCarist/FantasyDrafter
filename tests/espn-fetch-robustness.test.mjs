// Exercise the Python ESPN transport and its consumers without contacting ESPN.
import { spawnSync } from 'node:child_process';
import { assert, eq, finishSuite, printSuiteHeader, resetFailures } from './test-helper.mjs';

resetFailures();
printSuiteHeader('ESPN API Client Robustness & Anti-403 Protections');

const python = `
import gzip
import io
import json
import zlib
from types import SimpleNamespace
from unittest.mock import patch

from scripts import espn_client as client
from scripts import fetch_depth_charts as depth
from scripts import fetch_injuries as injuries
from scripts import update_rankings as rankings
import server

url = 'https://example.invalid/fixture'
payload = {'injuries': [{'team': 'MIN'}]}
body = json.dumps(payload).encode('utf-8')

class Response(io.BytesIO):
    def __init__(self, content, encoding):
        super().__init__(content)
        self.encoding = encoding
    def info(self):
        return {'Content-Encoding': self.encoding}

requests = []
def response_for(content, encoding):
    def open_url(req, **kwargs):
        requests.append(dict(req.header_items()))
        return Response(content, encoding)
    return open_url

with patch.object(client, 'find_curl', return_value=None), patch.object(client.urllib.request, 'urlopen', side_effect=response_for(gzip.compress(body), 'gzip')):
    gzip_result = client.fetch_espn_json(url, retries=0, cookie='session=fixture', extra_headers={'X-Test': 'offline'})
    curl_unavailable = client.fetch_with_curl(url)

with patch.object(client, 'find_curl', return_value=None), patch.object(client.urllib.request, 'urlopen', side_effect=response_for(zlib.compress(body), 'deflate')):
    deflate_result = client.fetch_espn_json(url, retries=0)

with patch.object(client, 'find_curl', return_value=None), patch.object(client.urllib.request, 'urlopen', side_effect=response_for(zlib.compress(body)[2:-4], 'deflate')):
    raw_deflate_result = client.fetch_espn_json(url, retries=0)

with patch.object(client.urllib.request, 'urlopen', side_effect=client.urllib.error.HTTPError(url, 403, 'Forbidden', None, None)):
    forbidden_text, forbidden_error = client.fetch_with_urllib(url)

with patch.object(client, 'fetch_with_curl', return_value=(None, 'HTTP 403')), patch.object(client, 'fetch_with_urllib', side_effect=[(None, 'HTTP 403'), (json.dumps(payload), None)]) as fallback:
    fallback_result = client.fetch_espn_json(url, retries=0)
    fallback_calls = fallback.call_count

with patch.object(client, 'fetch_with_curl', return_value=(None, 'HTTP 403')), patch.object(client, 'fetch_with_urllib', return_value=(None, 'HTTP 403')), patch.object(client.time, 'sleep') as sleep:
    try:
        client.fetch_espn_json(url, retries=1, backoff=0)
    except RuntimeError as exc:
        exhausted_error = str(exc)
    else:
        exhausted_error = None
    retry_sleeps = sleep.call_count

with patch.object(client, 'fetch_with_curl', return_value=('{bad json', None)):
    try:
        client.fetch_espn_json(url)
    except ValueError as exc:
        invalid_json_error = str(exc)
    else:
        invalid_json_error = None

players = [{'name': 'Justin Jefferson', 'team': 'MIN', 'injury': {'code': 'O'}}, {'name': 'Josh Allen', 'team': 'BUF', 'injury': None}]
existing = {'MIN': {'qb': [{'name': 'Existing'}]}}
with patch.dict(depth.ESPN_TEAM_MAP, {'MIN': 'min', 'BUF': 'buf'}, clear=True), patch.object(depth, 'fetch_team_depth_chart', side_effect=[RuntimeError('offline'), {'qb': [{'name': 'New'}]}]), patch('builtins.print'):
    charts = depth.fetch_all_depth_charts(players, verbose=False, existing_depth_charts=existing)

with patch.object(depth, 'fetch_espn_json', return_value={'depthchart': [{'positions': {'qb': {'athletes': [{'displayName': 'Justin Jefferson', 'id': '42'}]}}}]}):
    lookup_exact, lookup_name = depth.build_player_lookup(players)
    parsed_chart = depth.fetch_team_depth_chart('MIN', 'min', lookup_exact, lookup_name)

injury_data = {'players': players, 'injuriesUpdated': 'previous', 'depthCharts': {'MIN': {'qb': [{'playerId': 0, 'injury': {'code': 'O'}}], 'wr': {'wr1': [{'playerId': 0, 'injury': {'code': 'O'}}]}}}}
with patch.object(injuries, 'fetch_espn_injuries', side_effect=RuntimeError('offline')):
    failed_injuries_count = injuries.sync_injuries_into_data(injury_data, verbose=False)
    preserved_after_error = players[0]['injury']['code']
with patch.object(injuries, 'fetch_espn_injuries', return_value={}):
    missing_injuries_count = injuries.sync_injuries_into_data(injury_data, verbose=False)
    preserved_after_empty = players[0]['injury']['code']
with patch.object(injuries, 'fetch_espn_injuries', return_value={'injuries': [{'injuries': [{'athlete': {'displayName': 'Justin Jefferson'}, 'status': 'Questionable', 'type': {'abbreviation': 'Q'}}]}]}):
    matched_injuries = injuries.sync_injuries_into_data(injury_data, verbose=False)

# Invoke the actual HTTP dispatch with a fake request/response, and forbid running the updater.
def refresh_response(result):
    handler = server.SyncRelayHandler.__new__(server.SyncRelayHandler)
    handler.path = '/api/data/refresh'
    handler.wfile = io.BytesIO()
    statuses = []
    handler.send_response = lambda code: statuses.append(code)
    handler.send_header = lambda *args: None
    handler.end_headers = lambda: None
    with patch.object(server.subprocess, 'run', return_value=result) as updater, patch.object(server, 'safe_print'), patch.object(server, 'log_event'):
        handler.do_POST()
        command = updater.call_args.args[0]
    return statuses[0], json.loads(handler.wfile.getvalue()), command

refresh_ok, refresh_success_body, update_command = refresh_response(SimpleNamespace(returncode=0, stdout='', stderr=''))
refresh_failed, refresh_failure_body, _ = refresh_response(SimpleNamespace(returncode=1, stdout='', stderr='fixture error'))

print(json.dumps({
    'gzip': gzip_result, 'deflate': deflate_result, 'raw_deflate': raw_deflate_result,
    'curl_unavailable': curl_unavailable, 'forbidden_text': forbidden_text,
    'forbidden_error': forbidden_error, 'request_headers': requests[0],
    'fallback': fallback_result, 'fallback_calls': fallback_calls,
    'exhausted_error': exhausted_error, 'retry_sleeps': retry_sleeps,
    'invalid_json_error': invalid_json_error,
    'depth_charts': charts, 'parsed_qb': parsed_chart['qb'],
    'failed_injuries_count': failed_injuries_count, 'preserved_after_error': preserved_after_error,
    'missing_injuries_count': missing_injuries_count, 'preserved_after_empty': preserved_after_empty,
    'matched_injuries': matched_injuries, 'new_injury': players[0]['injury'],
    'chart_qb_injury': injury_data['depthCharts']['MIN']['qb'][0]['injury'],
    'chart_wr_injury': injury_data['depthCharts']['MIN']['wr']['wr1'][0]['injury'],
    'other_player_injury': players[1]['injury'], 'injuries_updated': injury_data['injuriesUpdated'],
    'byes': rankings.DEFAULT_NFL_BYES,
    'refresh_ok': refresh_ok, 'refresh_success_body': refresh_success_body,
    'refresh_failed': refresh_failed, 'refresh_failure_body': refresh_failure_body,
    'update_command': update_command,
}))
`;

const run = spawnSync('python', ['-c', python], { encoding: 'utf-8' });
eq(
  run.status,
  0,
  `Offline ESPN scenarios execute (${run.stderr || run.error || 'no Python errors'})`,
);
if (run.status === 0) {
  const result = JSON.parse(run.stdout);
  const fixture = { injuries: [{ team: 'MIN' }] };
  eq(result.gzip, fixture, 'gzip-compressed ESPN JSON is decoded');
  eq(result.deflate, fixture, 'deflate-compressed ESPN JSON is decoded');
  eq(result.raw_deflate, fixture, 'raw deflate-compressed ESPN JSON is decoded');
  eq(
    result.curl_unavailable,
    [null, 'curl not available'],
    'Missing curl reports a transport failure',
  );
  eq(result.forbidden_text, null, 'Forbidden urllib response does not produce data');
  assert(
    result.forbidden_error.includes('403'),
    'Forbidden urllib response reports the HTTP status',
  );
  assert(
    result.request_headers['User-agent'] && result.request_headers['User-agent'] !== 'Mozilla/5.0',
    'Fallback supplies a nontrivial client identity',
  );
  eq(result.request_headers.Cookie, 'session=fixture', 'Fallback forwards session cookie');
  eq(result.request_headers['X-test'], 'offline', 'Fallback forwards custom headers');
  eq(result.fallback, fixture, 'A rejected request falls back to the next client profile');
  eq(result.fallback_calls, 2, 'Fallback stops after the successful profile');
  assert(
    result.exhausted_error?.includes('HTTP 403') &&
      result.exhausted_error.includes('example.invalid'),
    'Exhausted transports report the URL and failure',
  );
  eq(result.retry_sleeps, 1, 'Retries pause only between rounds');
  assert(
    result.invalid_json_error?.includes('Invalid JSON') &&
      result.invalid_json_error.includes('{bad json'),
    'Invalid payload identifies the response',
  );
  eq(
    result.depth_charts.MIN,
    { qb: [{ name: 'Existing' }] },
    'Failed depth chart fetch preserves saved team data',
  );
  eq(
    result.depth_charts.BUF,
    { qb: [{ name: 'New' }] },
    'Other teams still receive refreshed depth charts',
  );
  eq(
    result.parsed_qb[0],
    { name: 'Justin Jefferson', rank: 1, espnId: '42', playerId: 0 },
    'Depth chart links ESPN athletes to local player IDs',
  );
  eq(result.failed_injuries_count, 0, 'Injury transport error does not claim updates');
  eq(result.preserved_after_error, 'O', 'Injury transport error preserves saved injuries');
  eq(result.missing_injuries_count, 0, 'Missing injury payload does not claim updates');
  eq(result.preserved_after_empty, 'O', 'Missing injury payload preserves saved injuries');
  eq(result.matched_injuries, 1, 'Fresh injury report matches a player');
  eq(result.new_injury.code, 'Q', 'Fresh injury replaces the stale status');
  eq(result.chart_qb_injury, result.new_injury, 'Depth chart QB carries the refreshed injury');
  eq(
    result.chart_wr_injury,
    result.new_injury,
    'Depth chart receiver carries the refreshed injury',
  );
  eq(
    result.other_player_injury,
    null,
    'Unlisted players have stale injuries cleared after a valid refresh',
  );
  assert(
    /^\d{4}-\d{2}-\d{2}$/.test(result.injuries_updated),
    'Successful refresh records an ISO date',
  );
  const nfl32 = [
    'ARI',
    'ATL',
    'BAL',
    'BUF',
    'CAR',
    'CHI',
    'CIN',
    'CLE',
    'DAL',
    'DEN',
    'DET',
    'GB',
    'HOU',
    'IND',
    'JAX',
    'KC',
    'LAC',
    'LAR',
    'LV',
    'MIA',
    'MIN',
    'NE',
    'NO',
    'NYG',
    'NYJ',
    'PHI',
    'PIT',
    'SEA',
    'SF',
    'TB',
    'TEN',
    'WAS',
  ];
  eq(
    Object.keys(result.byes).sort(),
    nfl32.sort(),
    'Default bye coverage includes exactly the 32 NFL teams',
  );
  assert(
    Object.values(result.byes).every((bye) => Number.isInteger(bye) && bye >= 4 && bye <= 18),
    'Default byes are plausible NFL weeks',
  );
  eq(result.refresh_ok, 200, 'Refresh HTTP endpoint succeeds when updater succeeds');
  eq(result.refresh_success_body.ok, true, 'Refresh HTTP endpoint reports successful update');
  eq(result.refresh_failed, 500, 'Refresh HTTP endpoint fails when updater fails');
  assert(
    result.refresh_failure_body.message.includes('fixture error'),
    'Refresh failure explains the updater error',
  );
  assert(
    result.update_command.at(-1).endsWith('update_rankings.py'),
    'Refresh endpoint invokes the rankings updater',
  );
}

const success = finishSuite('ESPN API Client Robustness & Anti-403 Protections');
if (!success) process.exit(1);
