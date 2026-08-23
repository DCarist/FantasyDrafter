#!/usr/bin/env python3
"""Automated Rankings Updater for Ken's Fantasy Drafter.

Fetches and merges rankings across multiple league formats:
- Dynasty Superflex & Dynasty 1QB
- Redraft 1QB (PPR, Half-PPR, Standard)
- Redraft Superflex/2QB (PPR, Half-PPR, Standard)
- Rookie draft rankings & prospect evaluations
- Platform-specific consensus (Yahoo, ESPN, Boris Chen, FantasyPros, DynastyProcess)
- NFL bye weeks, ages, schedules, and blurbs.

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

NFL_TEAMS = {
    'ARI': {'name': 'Arizona Cardinals', 'city': 'Arizona', 'mascot': 'Cardinals'},
    'ATL': {'name': 'Atlanta Falcons', 'city': 'Atlanta', 'mascot': 'Falcons'},
    'BAL': {'name': 'Baltimore Ravens', 'city': 'Baltimore', 'mascot': 'Ravens'},
    'BUF': {'name': 'Buffalo Bills', 'city': 'Buffalo', 'mascot': 'Bills'},
    'CAR': {'name': 'Carolina Panthers', 'city': 'Carolina', 'mascot': 'Panthers'},
    'CHI': {'name': 'Chicago Bears', 'city': 'Chicago', 'mascot': 'Bears'},
    'CIN': {'name': 'Cincinnati Bengals', 'city': 'Cincinnati', 'mascot': 'Bengals'},
    'CLE': {'name': 'Cleveland Browns', 'city': 'Cleveland', 'mascot': 'Browns'},
    'DAL': {'name': 'Dallas Cowboys', 'city': 'Dallas', 'mascot': 'Cowboys'},
    'DEN': {'name': 'Denver Broncos', 'city': 'Denver', 'mascot': 'Broncos'},
    'DET': {'name': 'Detroit Lions', 'city': 'Detroit', 'mascot': 'Lions'},
    'GB':  {'name': 'Green Bay Packers', 'city': 'Green Bay', 'mascot': 'Packers'},
    'HOU': {'name': 'Houston Texans', 'city': 'Houston', 'mascot': 'Texans'},
    'IND': {'name': 'Indianapolis Colts', 'city': 'Indianapolis', 'mascot': 'Colts'},
    'JAX': {'name': 'Jacksonville Jaguars', 'city': 'Jacksonville', 'mascot': 'Jaguars'},
    'KC':  {'name': 'Kansas City Chiefs', 'city': 'Kansas City', 'mascot': 'Chiefs'},
    'LV':  {'name': 'Las Vegas Raiders', 'city': 'Las Vegas', 'mascot': 'Raiders'},
    'LAC': {'name': 'Los Angeles Chargers', 'city': 'Los Angeles', 'mascot': 'Chargers'},
    'LAR': {'name': 'Los Angeles Rams', 'city': 'Los Angeles', 'mascot': 'Rams'},
    'MIA': {'name': 'Miami Dolphins', 'city': 'Miami', 'mascot': 'Dolphins'},
    'MIN': {'name': 'Minnesota Vikings', 'city': 'Minnesota', 'mascot': 'Vikings'},
    'NE':  {'name': 'New England Patriots', 'city': 'New England', 'mascot': 'Patriots'},
    'NO':  {'name': 'New Orleans Saints', 'city': 'New Orleans', 'mascot': 'Saints'},
    'NYG': {'name': 'New York Giants', 'city': 'New York Giants', 'mascot': 'Giants'},
    'NYJ': {'name': 'New York Jets', 'city': 'New York Jets', 'mascot': 'Jets'},
    'PHI': {'name': 'Philadelphia Eagles', 'city': 'Philadelphia', 'mascot': 'Eagles'},
    'PIT': {'name': 'Pittsburgh Steelers', 'city': 'Pittsburgh', 'mascot': 'Steelers'},
    'SF':  {'name': 'San Francisco 49ers', 'city': 'San Francisco', 'mascot': '49ers'},
    'SEA': {'name': 'Seattle Seahawks', 'city': 'Seattle', 'mascot': 'Seahawks'},
    'TB':  {'name': 'Tampa Bay Buccaneers', 'city': 'Tampa Bay', 'mascot': 'Buccaneers'},
    'TEN': {'name': 'Tennessee Titans', 'city': 'Tennessee', 'mascot': 'Titans'},
    'WAS': {'name': 'Washington Commanders', 'city': 'Washington', 'mascot': 'Commanders'},
}

def build_dst_map():
    lookup = {}
    for abbr, info in NFL_TEAMS.items():
        m = info['mascot'].lower()
        c = info['city'].lower()
        n = info['name'].lower()
        variants = [
            n, f"{n} dst", f"{n} defense", f"{n} def",
            m, f"{m} dst", f"{m} defense", f"{m} def",
            f"{c} dst", f"{c} defense", f"{c} def",
            f"{abbr.lower()} dst", f"{abbr.lower()} defense", f"{abbr.lower()} def",
        ]
        if abbr == 'NYG':
            variants.extend(['ny giants', 'ny giants dst', 'ny giants def', 'new york giants dst', 'new york giants def'])
        elif abbr == 'NYJ':
            variants.extend(['ny jets', 'ny jets dst', 'ny jets def', 'new york jets dst', 'new york jets def'])
        elif abbr == 'SF':
            variants.extend(['sf 49ers', 'sf 49ers dst', 'san francisco dst', '49ers dst', '49ers def'])
        elif abbr == 'GB':
            variants.extend(['gb packers', 'gb packers dst'])
        elif abbr == 'TB':
            variants.extend(['tb buccaneers', 'tb buccaneers dst', 'tampa bay dst', 'bucs dst', 'bucs defense'])
        elif abbr == 'KC':
            variants.extend(['kc chiefs', 'kc chiefs dst', 'kansas city dst'])
        elif abbr == 'NE':
            variants.extend(['ne patriots', 'ne patriots dst', 'new england dst', 'pats dst', 'pats defense'])
        elif abbr == 'NO':
            variants.extend(['no saints', 'no saints dst', 'new orleans dst'])
        elif abbr == 'LV':
            variants.extend(['lv raiders', 'lv raiders dst', 'las vegas dst'])
        elif abbr == 'LAC':
            variants.extend(['la chargers', 'la chargers dst', 'los angeles chargers dst'])
        elif abbr == 'LAR':
            variants.extend(['la rams', 'la rams dst', 'los angeles rams dst'])

        for variant in variants:
            cleaned = re.sub(r"[.'’,\"-/]", '', variant)
            cleaned = re.sub(r'\s+', ' ', cleaned).strip()
            lookup[cleaned] = abbr
    return lookup

DST_LOOKUP = build_dst_map()

def resolve_dst(name, pos=None, team=None):
    """Returns (canonical_name, team_abbr) if this name/pos represents an NFL team defense, else None."""
    if not name:
        return None
    s = re.sub(r"[.'’,\"-/]", '', str(name).lower())
    s = re.sub(r'\s+', ' ', s).strip()
    
    abbr = DST_LOOKUP.get(s)
    if abbr:
        return (NFL_TEAMS[abbr]['name'], abbr)
    
    if pos in ('DST', 'DEF', 'D/ST') and team:
        t = norm_team(team)
        if t in NFL_TEAMS:
            return (NFL_TEAMS[t]['name'], t)
            
    return None

def norm_name(name, pos=None, team=None):
    dst = resolve_dst(name, pos, team)
    if dst:
        return f"dst_{dst[1].lower()}"
    s = str(name).lower()
    s = re.sub(r"[.'’,\"-]", '', s)
    s = re.sub(r'\b(jr|sr|ii|iii|iv|v)\b', '', s)
    return re.sub(r'\s+', ' ', s).strip()

def norm_team(team):
    if not team or team == 'NA':
        return None
    t = str(team).upper().strip()
    return TEAM_FIX.get(t, t)

def float_or_none(val):
    if val is None or val == '' or val == 'NA':
        return None
    try:
        v = float(str(val).strip().replace(',', ''))
        return round(v, 1) if v > 0 else None
    except ValueError:
        return None

def int_or_none(val):
    if val is None or val == '' or val == 'NA':
        return None
    try:
        v = int(float(str(val).strip().replace(',', '')))
        return v if v > 0 else None
    except ValueError:
        return None

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

    # 4. Fetch Google Sheet CSV (MainPaste)
    sheet_url = "http://docs.google.com/spreadsheets/d/1dLvZB3w4KewKPF_Gx5vTDY47Ua-oYVicmOdYwf_RKnQ/gviz/tq?tqx=out:csv&sheet=MainPaste"
    sheet_csv_text = fetch_url(sheet_url)
    sheet_reader = csv.reader(io.StringIO(sheet_csv_text))
    sheet_rows = list(sheet_reader)
    print(f"Received {len(sheet_rows)} Google Sheet rows.")

    sheet_map = {}
    if len(sheet_rows) > 2:
        for r in sheet_rows[2:]:
            name = (r[0] if len(r) > 0 else '') or (r[1] if len(r) > 1 else '') or (r[3] if len(r) > 3 else '')
            name = name.strip()
            if not name:
                continue
            k = norm_name(name)
            pos = r[4].strip().upper() if len(r) > 4 else ''
            if pos == 'DEF':
                pos = 'DST'
            team = norm_team(r[5] if len(r) > 5 else '')
            k = norm_name(name, pos, team)
            dst_info = resolve_dst(name, pos, team)
            canon_name = dst_info[0] if dst_info else name
            canon_pos = 'DST' if dst_info else pos
            canon_team = dst_info[1] if dst_info else team
            
            rookie_raw = r[13].strip() if len(r) > 13 else ''
            is_rookie = False
            rookie_rank = None
            if rookie_raw and rookie_raw.lower() != 'vet':
                is_rookie = True
                try:
                    rookie_rank = int(float(rookie_raw))
                except ValueError:
                    pass

            sheet_map[k] = {
                'name': canon_name,
                'pos': canon_pos,
                'team': canon_team,
                'is_rookie': is_rookie,
                'rookie_rank': rookie_rank,
                'yahoo': float_or_none(r[7] if len(r) > 7 else ''),
                'espn_ppr': float_or_none(r[8] if len(r) > 8 else ''),
                'fp_std': float_or_none(r[9] if len(r) > 9 else ''),
                'fp_ppr': float_or_none(r[10] if len(r) > 10 else ''),
                'fp_half': float_or_none(r[11] if len(r) > 11 else ''),
                'dyn_1qb': float_or_none(r[12] if len(r) > 12 else ''),
                'espn_std': float_or_none(r[14] if len(r) > 14 else ''),
                'dyn_2qb': float_or_none(r[15] if len(r) > 15 else ''),
                'fp_2qb_std': float_or_none(r[16] if len(r) > 16 else ''),
                'fp_2qb_ppr': float_or_none(r[17] if len(r) > 17 else ''),
                'fp_2qb_half': float_or_none(r[18] if len(r) > 18 else ''),
                'boris_name': r[28].strip() if len(r) > 28 else '',
                'boris_ppr': float_or_none(r[29] if len(r) > 29 else ''),
                'boris_half': float_or_none(r[30] if len(r) > 30 else ''),
                'boris_std': float_or_none(r[31] if len(r) > 31 else ''),
            }
        print(f"Parsed {len(sheet_map)} player records from Google Sheet.")

    # 5. Build player records from ECR, Sheet, and Values
    players = {}  # norm_name -> dict
    byes = dict(existing_byes)
    rookies = set()

    for r in ecr_rows:
        name = r.get('player', '').strip()
        pos = r.get('pos', '').strip().upper()
        if pos == 'DEF':
            pos = 'DST'
        if pos in ('DB', 'DL', 'LB', 'IDP'):
            continue

        team = norm_team(r.get('team') or r.get('tm'))
        k = norm_name(name, pos, team)
        if not k:
            continue

        dst_info = resolve_dst(name, pos, team)
        canon_name = dst_info[0] if dst_info else name
        canon_pos = 'DST' if dst_info else pos
        canon_team = dst_info[1] if dst_info else team

        bye_raw = r.get('bye')
        if bye_raw and bye_raw != 'NA' and (canon_team or team):
            try:
                byes[canon_team or team] = int(bye_raw)
            except ValueError:
                pass

        rec = players.setdefault(k, {
            'name': canon_name,
            'pos': canon_pos,
            'teams': [],
            'positions': [],
            'dynSF': None,
            'dyn1QB': None,
            'redraft': None,
            'adp': None,
            'rookie': False,
            'rookieRank': None,
            'age': None,
            'blurb': existing_blurbs.get(k),
            'red_1qb_ppr': None,
            'red_1qb_half': None,
            'red_1qb_std': None,
            'red_sf_ppr': None,
            'red_sf_half': None,
            'red_sf_std': None,
            'yahoo': None,
            'espn_ppr': None,
            'espn_std': None,
            'boris_ppr': None,
            'boris_half': None,
            'boris_std': None,
        })

        if dst_info:
            rec['name'] = dst_info[0]
            rec['pos'] = 'DST'
            rec['teams'].append(dst_info[1])
            rec['positions'].append('DST')
        else:
            if team:
                rec['teams'].append(team)
            if pos:
                rec['positions'].append(pos)

        page_type = r.get('page_type', '')
        try:
            rank_val = float(r.get('ecr', '0'))
            if rank_val > 0:
                rank_rounded = round(rank_val, 1)
                if page_type == 'dynasty-op':
                    rec['dynSF'] = rank_rounded
                elif page_type == 'dynasty-overall':
                    rec['dyn1QB'] = rank_rounded
                elif page_type == 'redraft-overall':
                    rec['redraft'] = rank_rounded
                    if rec['red_1qb_half'] is None:
                        rec['red_1qb_half'] = rank_rounded
                elif page_type == 'redraft-op':
                    if rec['red_sf_ppr'] is None:
                        rec['red_sf_ppr'] = rank_rounded
                elif page_type == 'best-overall':
                    rec['adp'] = rank_rounded
                elif page_type == 'dynasty-rk':
                    rec['rookie'] = True
                    rookies.add(k)
        except ValueError:
            pass

    # 6. Merge Google Sheet data
    for k, sdata in sheet_map.items():
        dst_info = resolve_dst(sdata['name'], sdata['pos'], sdata['team'])
        canon_name = dst_info[0] if dst_info else sdata['name']
        canon_pos = 'DST' if dst_info else sdata['pos']
        canon_team = dst_info[1] if dst_info else sdata['team']

        rec = players.setdefault(k, {
            'name': canon_name,
            'pos': canon_pos,
            'teams': [],
            'positions': [],
            'dynSF': None,
            'dyn1QB': None,
            'redraft': None,
            'adp': None,
            'rookie': False,
            'rookieRank': None,
            'age': None,
            'blurb': existing_blurbs.get(k),
            'red_1qb_ppr': None,
            'red_1qb_half': None,
            'red_1qb_std': None,
            'red_sf_ppr': None,
            'red_sf_half': None,
            'red_sf_std': None,
            'yahoo': None,
            'espn_ppr': None,
            'espn_std': None,
            'boris_ppr': None,
            'boris_half': None,
            'boris_std': None,
        })

        if dst_info:
            rec['name'] = dst_info[0]
            rec['pos'] = 'DST'
            rec['teams'].append(dst_info[1])
            rec['positions'].append('DST')
        else:
            if sdata['team']:
                rec['teams'].append(sdata['team'])
            if sdata['pos']:
                rec['positions'].append(sdata['pos'])

        if sdata['is_rookie']:
            rec['rookie'] = True
            rookies.add(k)
        if sdata['rookie_rank'] is not None:
            rec['rookieRank'] = sdata['rookie_rank']

        # Dynasty ranks
        if sdata['dyn_2qb'] is not None:
            rec['dynSF'] = sdata['dyn_2qb']
        if sdata['dyn_1qb'] is not None:
            rec['dyn1QB'] = sdata['dyn_1qb']

        # Redraft 1QB ranks
        if sdata['fp_ppr'] is not None:
            rec['red_1qb_ppr'] = sdata['fp_ppr']
        if sdata['fp_half'] is not None:
            rec['red_1qb_half'] = sdata['fp_half']
        if sdata['fp_std'] is not None:
            rec['red_1qb_std'] = sdata['fp_std']

        # Redraft Superflex ranks
        if sdata['fp_2qb_ppr'] is not None:
            rec['red_sf_ppr'] = sdata['fp_2qb_ppr']
        if sdata['fp_2qb_half'] is not None:
            rec['red_sf_half'] = sdata['fp_2qb_half']
        if sdata['fp_2qb_std'] is not None:
            rec['red_sf_std'] = sdata['fp_2qb_std']

        # Platform ranks
        if sdata['yahoo'] is not None:
            rec['yahoo'] = sdata['yahoo']
        if sdata['espn_ppr'] is not None:
            rec['espn_ppr'] = sdata['espn_ppr']
        if sdata['espn_std'] is not None:
            rec['espn_std'] = sdata['espn_std']
        if sdata['boris_ppr'] is not None:
            rec['boris_ppr'] = sdata['boris_ppr']
        if sdata['boris_half'] is not None:
            rec['boris_half'] = sdata['boris_half']
        if sdata['boris_std'] is not None:
            rec['boris_std'] = sdata['boris_std']

        # Default consensus redraft fallback
        if rec['redraft'] is None:
            rec['redraft'] = rec['red_1qb_half'] or rec['red_1qb_ppr'] or rec['red_1qb_std']

    # 7. Enrich with values.csv data (ages, draft year for rookies, fallback dynasty ranks)
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
                        rookies.add(k)
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

    # 8. Finalize records, resolve team/position conflicts, and apply fallbacks
    out = []

    for k, rec in players.items():
        # Determine primary team by majority vote
        team_votes = Counter(rec['teams'])
        team = team_votes.most_common(1)[0][0] if team_votes else None

        # Determine primary position by majority vote
        pos_votes = Counter(rec['positions'])
        pos = pos_votes.most_common(1)[0][0] if pos_votes else rec.get('pos')

        if k.startswith('dst_'):
            team_abbr = k[4:].upper()
            team = team_abbr
            pos = 'DST'
            if team_abbr in NFL_TEAMS:
                rec['name'] = NFL_TEAMS[team_abbr]['name']

        if not pos or pos not in ('QB', 'RB', 'WR', 'TE', 'K', 'DST'):
            continue

        # If non-QB is missing a Superflex rank, Dynasty 1QB is a fine stand-in
        dyn_sf = rec.get('dynSF')
        if dyn_sf is None and pos != 'QB' and rec.get('dyn1QB') is not None:
            dyn_sf = rec['dyn1QB']

        # If 1QB dynasty is missing for non-QB, dyn_sf is a fine stand-in
        dyn_1qb = rec.get('dyn1QB')
        if dyn_1qb is None and pos != 'QB' and dyn_sf is not None:
            dyn_1qb = dyn_sf

        # If QB is missing Superflex rank but has 1QB rank, fallback to 1QB rank
        if dyn_sf is None and rec.get('dyn1QB') is not None:
            dyn_sf = rec['dyn1QB']
        if dyn_1qb is None and rec.get('dynSF') is not None:
            dyn_1qb = rec['dynSF']

        # Fill redraft format fallbacks
        red_1qb_half = rec.get('red_1qb_half') or rec.get('redraft') or rec.get('red_1qb_ppr') or rec.get('red_1qb_std') or rec.get('espn_ppr') or rec.get('yahoo')
        red_1qb_ppr = rec.get('red_1qb_ppr') or rec.get('espn_ppr') or red_1qb_half
        red_1qb_std = rec.get('red_1qb_std') or rec.get('espn_std') or red_1qb_half

        red_sf_ppr = rec.get('red_sf_ppr') or (red_1qb_ppr if pos != 'QB' else None)
        red_sf_half = rec.get('red_sf_half') or (red_1qb_half if pos != 'QB' else None)
        red_sf_std = rec.get('red_sf_std') or (red_1qb_std if pos != 'QB' else None)

        redraft_consensus = rec.get('redraft') or red_1qb_half or red_1qb_ppr or red_1qb_std or red_sf_half or red_sf_ppr

        # Keep only players with at least one active ranking metric
        if dyn_sf is None and dyn_1qb is None and redraft_consensus is None and rec.get('adp') is None:
            continue

        out.append({
            'name': rec['name'],
            'pos': pos,
            'team': team,
            'bye': byes.get(team),
            'age': rec.get('age'),
            'rookie': bool(rec.get('rookie')),
            'rookieRank': rec.get('rookieRank'),
            'dynSF': dyn_sf,
            'dyn1QB': dyn_1qb,
            'redraft': redraft_consensus,
            'adp': rec.get('adp'),
            'red_1qb_ppr': red_1qb_ppr,
            'red_1qb_half': red_1qb_half,
            'red_1qb_std': red_1qb_std,
            'red_sf_ppr': red_sf_ppr,
            'red_sf_half': red_sf_half,
            'red_sf_std': red_sf_std,
            'yahoo': rec.get('yahoo'),
            'espn_ppr': rec.get('espn_ppr'),
            'espn_std': rec.get('espn_std'),
            'boris_ppr': rec.get('boris_ppr'),
            'boris_half': rec.get('boris_half'),
            'boris_std': rec.get('boris_std'),
            'blurb': rec.get('blurb')
        })

    # Sort by best available rank
    out.sort(key=lambda p: min(x for x in (p['dynSF'], p['dyn1QB'], p['redraft'], p['adp'], 9999) if x is not None))

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
            'googleSheet': [sheet_url],
            'provider': ['https://github.com/dynastyprocess/data']
        }
    }

    # 9. Write updated players-data.js
    with open('players-data.js', 'w', encoding='utf-8') as f:
        f.write('// Generated by update-rankings.py — do not hand-edit.\n')
        f.write('window.DRAFT_DATA = ')
        json.dump(payload, f, indent=1)
        f.write(';\n')

    # Also save as JSON for optional direct fetch/API use
    with open('players-data.json', 'w', encoding='utf-8') as f:
        json.dump(payload, f, indent=2)

    # 10. Report Summary
    print("\n=== Update Complete ===")
    print(f"Total active players merged: {len(out)}")
    both = sum(1 for p in out if p['dynSF'] and p['redraft'])
    print(f"Players with both Dynasty SF and Redraft ranks: {both}")
    rookies_count = sum(1 for p in out if p['rookie'])
    print(f"Rookies identified: {rookies_count}")
    print(f"Teams with verified bye weeks: {len(byes)}")
    print(f"Generated timestamp: {payload['generated']}")

    print("\nTop 12 Players by Dynasty Superflex:")
    top_sf = sorted([p for p in out if p['dynSF']], key=lambda p: p['dynSF'])[:12]
    for p in top_sf:
        r_tag = f" (Rk #{p['rookieRank']})" if p['rookie'] and p['rookieRank'] else (' (R)' if p['rookie'] else '')
        print(f"  {p['dynSF']:>4.1f}  {p['name']:<24} {p['pos']:<3} {p['team'] or '?':<4} Bye {p['bye'] or '?'}  Age {p['age'] or '?'}{r_tag}")

    print("\nTop 8 Rookies by Superflex Value:")
    top_rk = sorted([p for p in out if p['rookie'] and p['dynSF']], key=lambda p: p['dynSF'])[:8]
    for p in top_rk:
        print(f"  DynSF: {p['dynSF']:>4.1f} | Dyn1QB: {p['dyn1QB'] or '—':>4} | Draft Rk: #{p['rookieRank'] or '—':<2} | {p['name']:<22} {p['pos']:<3} {p['team'] or '?'}")

if __name__ == '__main__':
    main()

