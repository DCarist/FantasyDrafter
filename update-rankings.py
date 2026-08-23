#!/usr/bin/env python3
"""Automated Rankings Updater for Ken's Fantasy Drafter.

Fetches the latest live consensus rankings (Dynasty Superflex, Dynasty 1QB,
Redraft Consensus, ADP, Rookie rankings, and Bye weeks) from live open datasets,
merges them with existing blurbs and schedules, and writes updated players-data.js.

Usage:
    python update-rankings.py
"""

import csv
import io
import json
import re
import sys
import urllib.request
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
    if not team or team == 'NA':
        return None
    t = str(team).upper().strip()
    return TEAM_FIX.get(t, t)

def fetch_url(url):
    print(f"Fetching: {url}")
    req = urllib.request.Request(
        url,
        headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) FantasyDrafter/1.0'}
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode('utf-8')

def main():
    print("=== Fantasy Drafter Live Rankings Updater ===")

    # 1. Load existing players-data.js to retain existing schedules and blurbs
    existing_schedules = {}
    existing_blurbs = {}
    existing_byes = {}
    try:
        with open('players-data.js', 'r', encoding='utf-8') as f:
            content = f.read()
            json_str = content.split('=', 1)[1].rstrip().rstrip(';')
            old_data = json.loads(json_str)
            existing_schedules = old_data.get('schedules', {})
            existing_byes = old_data.get('byes', {})
            for p in old_data.get('players', []):
                k = norm_name(p.get('name', ''))
                if p.get('blurb'):
                    existing_blurbs[k] = p['blurb']
        print(f"Loaded {len(existing_schedules)} existing schedules and {len(existing_blurbs)} existing blurbs.")
    except Exception as e:
        print(f"Note: Could not load existing players-data.js ({e}), starting fresh.")

    # 2. Fetch live FantasyPros ECR dataset from DynastyProcess
    ecr_url = "https://raw.githubusercontent.com/dynastyprocess/data/master/files/db_fpecr_latest.csv"
    ecr_csv_text = fetch_url(ecr_url)
    ecr_reader = csv.DictReader(io.StringIO(ecr_csv_text))
    ecr_rows = list(ecr_reader)
    print(f"Received {len(ecr_rows)} raw ECR records.")

    # 3. Fetch values.csv (for age, draft year, and crowdsourced values)
    values_url = "https://raw.githubusercontent.com/dynastyprocess/data/master/files/values.csv"
    val_csv_text = fetch_url(values_url)
    val_reader = csv.DictReader(io.StringIO(val_csv_text))
    val_rows = list(val_reader)
    print(f"Received {len(val_rows)} value records.")

    values_map = {}
    for r in val_rows:
        k = norm_name(r.get('player', ''))
        if k:
            values_map[k] = r

    # 4. Group ECR records by page_type
    players = {}  # norm_name -> dict
    byes = dict(existing_byes)
    rookies = set()

    for r in ecr_rows:
        name = r.get('player', '').strip()
        k = norm_name(name)
        if not k:
            continue

        pos = r.get('pos', '').strip().upper()
        if pos in ('K', 'DST', 'DEF', 'DB', 'DL', 'LB', 'IDP'):
            continue  # Offense only (Superflex league format)

        team = norm_team(r.get('team') or r.get('tm'))
        bye_raw = r.get('bye')
        if bye_raw and bye_raw != 'NA' and team:
            try:
                byes[team] = int(bye_raw)
            except ValueError:
                pass

        rec = players.setdefault(k, {
            'name': name,
            'pos': pos,
            'teams': [],
            'positions': [],
            'dynSF': None,
            'dyn1QB': None,
            'redraft': None,
            'adp': None,
            'rookie': False,
            'age': None,
            'blurb': existing_blurbs.get(k)
        })

        if team:
            rec['teams'].append(team)
        if pos:
            rec['positions'].append(pos)

        page_type = r.get('page_type', '')
        try:
            rank_val = float(r.get('ecr', '0'))
            if rank_val > 0:
                if page_type == 'dynasty-op':
                    rec['dynSF'] = round(rank_val, 1)
                elif page_type == 'dynasty-overall':
                    rec['dyn1QB'] = round(rank_val, 1)
                elif page_type == 'redraft-overall':
                    rec['redraft'] = round(rank_val, 1)
                elif page_type == 'best-overall':
                    rec['adp'] = round(rank_val, 1)
                elif page_type == 'dynasty-rk':
                    rec['rookie'] = True
                    rookies.add(k)
        except ValueError:
            pass

    # 5. Enrich with values.csv data (ages, draft year for rookies, fallback dynasty ranks)
    for k, rec in players.items():
        v = values_map.get(k)
        if v:
            if not rec.get('age') and v.get('age') and v['age'] != 'NA':
                try:
                    rec['age'] = round(float(v['age']), 1)
                except ValueError:
                    pass

            if v.get('draft_year'):
                try:
                    yr = int(float(v['draft_year']))
                    if yr >= 2026:
                        rec['rookie'] = True
                except ValueError:
                    pass

            if rec['dynSF'] is None and v.get('ecr_2qb') and v['ecr_2qb'] != 'NA':
                try:
                    rec['dynSF'] = round(float(v['ecr_2qb']), 1)
                except ValueError:
                    pass

            if rec['dyn1QB'] is None and v.get('ecr_1qb') and v['ecr_1qb'] != 'NA':
                try:
                    rec['dyn1QB'] = round(float(v['ecr_1qb']), 1)
                except ValueError:
                    pass

    # 6. Finalize records and resolve team/position conflicts
    out = []
    current_year = date.today().year

    for k, rec in players.items():
        # Determine primary team by majority vote
        team_votes = Counter(rec['teams'])
        team = team_votes.most_common(1)[0][0] if team_votes else None

        # Determine primary position by majority vote
        pos_votes = Counter(rec['positions'])
        pos = pos_votes.most_common(1)[0][0] if pos_votes else rec.get('pos')

        if not pos or pos not in ('QB', 'RB', 'WR', 'TE'):
            continue

        # If non-QB is missing a Superflex rank, Dynasty 1QB is a fine stand-in
        dyn_sf = rec.get('dynSF')
        if dyn_sf is None and pos != 'QB' and rec.get('dyn1QB') is not None:
            dyn_sf = rec['dyn1QB']

        # Keep only players with at least one active ranking
        if dyn_sf is None and rec.get('redraft') is None and rec.get('adp') is None:
            continue

        out.append({
            'name': rec['name'],
            'pos': pos,
            'team': team,
            'bye': byes.get(team),
            'age': rec.get('age'),
            'rookie': bool(rec.get('rookie')),
            'dynSF': dyn_sf,
            'dyn1QB': rec.get('dyn1QB'),
            'redraft': rec.get('redraft'),
            'adp': rec.get('adp'),
            'blurb': rec.get('blurb')
        })

    # Sort by best available rank
    out.sort(key=lambda p: min(x for x in (p['dynSF'], p['redraft'], p['adp'], 9999) if x is not None))

    payload = {
        'generated': date.today().isoformat(),
        'players': out,
        'byes': byes,
        'schedules': existing_schedules,
        'sources': {
            'dynastySF': ['https://www.fantasypros.com/nfl/rankings/dynasty-superflex.php'],
            'dynasty1QB': ['https://www.fantasypros.com/nfl/rankings/dynasty-overall.php'],
            'redraft': ['https://www.fantasypros.com/nfl/rankings/consensus-cheatsheets.php'],
            'adp': ['https://www.fantasypros.com/nfl/adp/best-ball-overall.php'],
            'provider': ['https://github.com/dynastyprocess/data']
        }
    }

    # 7. Write updated players-data.js
    with open('players-data.js', 'w', encoding='utf-8') as f:
        f.write('// Generated by update-rankings.py — do not hand-edit.\n')
        f.write('window.DRAFT_DATA = ')
        json.dump(payload, f, indent=1)
        f.write(';\n')

    # Also save as JSON for optional direct fetch/API use
    with open('players-data.json', 'w', encoding='utf-8') as f:
        json.dump(payload, f, indent=2)

    # 8. Report Summary
    print("\n=== Update Complete ===")
    print(f"Total active players merged: {len(out)}")
    both = sum(1 for p in out if p['dynSF'] and p['redraft'])
    print(f"Players with both Dynasty SF and Redraft ranks: {both}")
    print(f"Rookies identified: {sum(1 for p in out if p['rookie'])}")
    print(f"Teams with verified bye weeks: {len(byes)}")
    print(f"Generated timestamp: {payload['generated']}")

    print("\nTop 12 Players by Dynasty Superflex:")
    top_sf = sorted([p for p in out if p['dynSF']], key=lambda p: p['dynSF'])[:12]
    for p in top_sf:
        r_tag = ' (R)' if p['rookie'] else ''
        print(f"  {p['dynSF']:>4.1f}  {p['name']:<24} {p['pos']:<3} {p['team'] or '?':<4} Bye {p['bye'] or '?'}  Age {p['age'] or '?'}{r_tag}")

if __name__ == '__main__':
    main()
