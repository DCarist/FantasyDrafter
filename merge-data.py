#!/usr/bin/env python3
"""Merge the researched ranking datasets into players-data.js for the draft board.

Usage: python3 merge-data.py <workflow-output.json>
The input is the workflow output wrapper; datasets live under its "result" key.
"""
import json
import re
import sys
from collections import Counter
from datetime import date

TEAM_FIX = {
    'JAC': 'JAX', 'WSH': 'WAS', 'LA': 'LAR', 'OAK': 'LV', 'SD': 'LAC',
    'ARZ': 'ARI', 'BLT': 'BAL', 'CLV': 'CLE', 'HST': 'HOU', 'GNB': 'GB',
    'KAN': 'KC', 'NWE': 'NE', 'NOR': 'NO', 'SFO': 'SF', 'TAM': 'TB', 'LVR': 'LV',
}

def norm_name(name):
    s = str(name).lower()
    s = re.sub(r"[.'’,-]", '', s)
    s = re.sub(r'\b(jr|sr|ii|iii|iv|v)\b', '', s)
    return re.sub(r'\s+', ' ', s).strip()

def norm_team(team):
    if not team:
        return None
    t = str(team).upper().strip()
    return TEAM_FIX.get(t, t)

def norm_pos(pos):
    p = re.sub(r'\d+$', '', str(pos).upper().strip())
    return p if p in ('QB', 'RB', 'WR', 'TE', 'K', 'DST', 'DEF') else p

def main():
    with open(sys.argv[1]) as f:
        data = json.load(f)['result']

    players = {}  # norm name -> merged record

    def get(dataset_key):
        ds = data.get(dataset_key) or {}
        return ds.get('players') or [], ds.get('sourceUrls') or []

    sources = {}

    def merge(dataset_key, field, value_from=None):
        """Fold one ranking source into the player map."""
        rows, urls = get(dataset_key)
        sources[dataset_key] = urls
        for row in rows:
            key = norm_name(row.get('name', ''))
            if not key:
                continue
            rec = players.setdefault(key, {'name': row['name'], 'teams': [], 'positions': []})
            val = row.get(value_from) if value_from else row.get('rank')
            if val is None:
                val = row.get('rank')
            if field not in rec and val is not None:
                rec[field] = val
            if norm_team(row.get('team')):
                rec['teams'].append(norm_team(row['team']))
            if row.get('pos'):
                rec['positions'].append((dataset_key, norm_pos(row['pos'])))
            if row.get('age') and not rec.get('age'):
                rec['age'] = row['age']
        return len(rows)

    counts = {
        'dynastySF': merge('dynastySF', 'dynSF'),
        'dynasty1QB': merge('dynasty1QB', 'dyn1QB'),
        'redraft': merge('redraft', 'redraft'),
        'adp': merge('adp', 'adp', value_from='adp'),
    }

    # Rookie flags
    rookie_rows, rookie_urls = get('rookies')
    sources['rookies'] = rookie_urls
    rookie_hits = 0
    for row in rookie_rows:
        key = norm_name(row.get('name', ''))
        if key in players:
            players[key]['rookie'] = True
            if row.get('age') and not players[key].get('age'):
                players[key]['age'] = row['age']
            rookie_hits += 1
    counts['rookies'] = len(rookie_rows)

    # Bye weeks
    byes = {}
    for t in (data.get('byes') or {}).get('teams') or []:
        byes[norm_team(t['abbr'])] = t['week']
    sources['byes'] = (data.get('byes') or {}).get('sourceUrls') or []

    # Finalize records
    out, team_conflicts, pos_conflicts = [], 0, 0
    # position priority: redraft consensus first, then dynasty lists
    POS_PRIORITY = ['redraft', 'dynastySF', 'dynasty1QB', 'adp']
    for key, rec in players.items():
        team_votes = Counter(rec['teams'])
        team = team_votes.most_common(1)[0][0] if team_votes else None
        if len(team_votes) > 1:
            team_conflicts += 1
        # Majority vote across sources; ties broken by source priority
        pos = None
        pos_votes = Counter(p for _, p in rec['positions'])
        if pos_votes:
            best = max(pos_votes.values())
            tied = {p for p, c in pos_votes.items() if c == best}
            if len(tied) == 1:
                pos = tied.pop()
            else:
                for src in POS_PRIORITY:
                    for s, p in rec['positions']:
                        if s == src and p in tied:
                            pos = p
                            break
                    if pos:
                        break
        if len(set(p for _, p in rec['positions'])) > 1:
            pos_conflicts += 1
        if pos in ('K', 'DST', 'DEF'):
            continue  # league lineup has no K or DST slots
        # Non-QBs missing a superflex rank: 1QB dynasty order is a fine stand-in
        # (superflex only reshuffles QBs). Never do this for QBs.
        dyn_sf = rec.get('dynSF')
        if dyn_sf is None and pos != 'QB' and rec.get('dyn1QB') is not None:
            dyn_sf = rec['dyn1QB']
        out.append({
            'name': rec['name'],
            'pos': pos,
            'team': team,
            'bye': byes.get(team),
            'age': rec.get('age'),
            'rookie': rec.get('rookie', False),
            'dynSF': dyn_sf,
            'dyn1QB': rec.get('dyn1QB'),
            'redraft': rec.get('redraft'),
            'adp': rec.get('adp'),
        })

    # Keep only players ranked by at least one source, sorted by best available rank
    out = [p for p in out if p['dynSF'] or p['redraft'] or p['adp']]
    out.sort(key=lambda p: min(x for x in (p['dynSF'], p['redraft'], p['adp'], 9999) if x))

    payload = {
        'generated': date.today().isoformat(),
        'players': out,
        'byes': byes,
        'sources': sources,
    }
    with open('players-data.js', 'w') as f:
        f.write('// Generated by merge-data.py — do not hand-edit.\n')
        f.write('window.DRAFT_DATA = ')
        json.dump(payload, f, indent=1)
        f.write(';\n')

    # ---- Sanity report ----
    print(f'source rows: {counts}')
    print(f'merged players: {len(out)}  (K/DST dropped)')
    both = sum(1 for p in out if p['dynSF'] and p['redraft'])
    print(f'players with BOTH dynasty-SF and redraft rank: {both}')
    print(f'players missing bye (unknown team): {sum(1 for p in out if not p["bye"])}')
    print(f'bye map teams: {len(byes)}; team-name conflicts (majority vote used): {team_conflicts}; pos conflicts: {pos_conflicts}')
    print(f'rookies matched into pool: {rookie_hits}/{counts["rookies"]}')
    top = sorted((p for p in out if p['dynSF']), key=lambda p: p['dynSF'])[:12]
    print('top 12 by dynasty SF:')
    for p in top:
        print(f"  {p['dynSF']:>3} {p['name']:<24} {p['pos']:<3} {p['team'] or '?':<4} bye {p['bye'] or '?'} age {p['age'] or '?'}")

if __name__ == '__main__':
    main()
