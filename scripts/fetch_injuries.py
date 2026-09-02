#!/usr/bin/env python3
"""Fetch official NFL injury reports from ESPN and integrate into players-data.js / players-data.json.

Usage:
    python scripts/fetch_injuries.py [--out-js players-data.js] [--out-json players-data.json]
"""

import argparse
import json
import os
import re
import sys
import urllib.request
from datetime import date

ESPN_INJURIES_URL = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/injuries"

STATUS_CODE_MAP = {
    "questionable": "Q",
    "q": "Q",
    "out": "O",
    "o": "O",
    "injured reserve": "IR",
    "ir": "IR",
    "suspension": "SUSP",
    "susp": "SUSP",
    "doubtful": "D",
    "d": "D",
    "probable": "P",
    "p": "P",
}


def norm_name(name):
    s = str(name).lower()
    s = re.sub(r"[.'’,-]", "", s)
    s = re.sub(r"\b(jr|sr|ii|iii|iv|v)\b", "", s)
    return re.sub(r"\s+", " ", s).strip()


def build_player_lookup(players):
    lookup_exact = {}
    lookup_name = {}
    for i, p in enumerate(players):
        nn = norm_name(p.get("name", ""))
        team = p.get("team", "").upper()
        if team:
            lookup_exact[(nn, team)] = i
        if nn not in lookup_name:
            lookup_name[nn] = i
    return lookup_exact, lookup_name


def fetch_espn_injuries():
    req = urllib.request.Request(
        ESPN_INJURIES_URL, headers={"User-Agent": "Mozilla/5.0"}
    )
    with urllib.request.urlopen(req, timeout=15) as res:
        raw = res.read().decode("utf-8")
        return json.loads(raw)


def extract_injury_record(inj_item):
    """Extract a clean, structured injury object from an ESPN injury entry."""
    status_raw = inj_item.get("status") or ""
    if status_raw.lower() in ("active", "normal", "healthy"):
        return None

    type_obj = inj_item.get("type") or {}
    abbr = type_obj.get("abbreviation") or ""
    if abbr.lower() == "a":
        return None

    code = STATUS_CODE_MAP.get(abbr.lower()) or STATUS_CODE_MAP.get(
        status_raw.lower(), abbr.upper() or "Q"
    )

    details = inj_item.get("details") or {}
    body_part = details.get("type") or ""
    detail = details.get("detail") or ""
    return_date = details.get("returnDate") or ""

    date_raw = inj_item.get("date") or ""

    return {
        "status": status_raw,
        "code": code,
        "type": body_part,
        "detail": detail,
        "returnDate": return_date,
        "shortComment": (inj_item.get("shortComment") or "").strip(),
        "longComment": (inj_item.get("longComment") or "").strip(),
        "date": date_raw,
    }


def sync_injuries_into_data(data, verbose=True):
    """Fetch live ESPN injuries and attach them to players and depth chart athletes."""
    if verbose:
        print("Fetching official NFL injury report from ESPN...")
    raw_data = fetch_espn_injuries()

    players = data.get("players", [])
    lookup_exact, lookup_name = build_player_lookup(players)

    # Reset all players' injury property to None
    for p in players:
        p["injury"] = None

    injuries_by_id = {}
    total_found = 0
    total_matched = 0

    for team_item in raw_data.get("injuries", []):
        for inj in team_item.get("injuries", []):
            total_found += 1
            ath = inj.get("athlete", {})
            name = ath.get("displayName") or ath.get("shortName") or ""
            nn = norm_name(name)

            pid = lookup_name.get(nn)
            if pid is not None:
                record = extract_injury_record(inj)
                if record is not None:
                    players[pid]["injury"] = record
                    injuries_by_id[pid] = record
                    total_matched += 1

    data["injuriesUpdated"] = date.today().isoformat()

    # Link injuries to depth charts
    depth_charts = data.get("depthCharts", {})
    for team_abbr, tdata in depth_charts.items():
        for group_key in ["qb", "rb", "te", "pk"]:
            for ath in tdata.get(group_key, []):
                pid = ath.get("playerId")
                if pid is not None and pid in injuries_by_id:
                    ath["injury"] = injuries_by_id[pid]
                else:
                    ath["injury"] = None
        for role_key, wr_list in tdata.get("wr", {}).items():
            for ath in wr_list:
                pid = ath.get("playerId")
                if pid is not None and pid in injuries_by_id:
                    ath["injury"] = injuries_by_id[pid]
                else:
                    ath["injury"] = None

    if verbose:
        print(
            f"Processed {total_found} injuries from ESPN. Successfully mapped {total_matched} to active players."
        )

    return total_matched


def main():
    parser = argparse.ArgumentParser(description="Fetch NFL Injury Reports from ESPN")
    parser.add_argument("--out-js", default="players-data.js", help="Path to players-data.js")
    parser.add_argument("--out-json", default="players-data.json", help="Path to players-data.json")
    args = parser.parse_args()

    # Locate source file
    source_file = args.out_json if os.path.exists(args.out_json) else args.out_js
    if not os.path.exists(source_file):
        print(f"Error: {source_file} not found.")
        sys.exit(1)

    if source_file.endswith(".js"):
        with open(source_file, "r", encoding="utf-8") as f:
            content = f.read()
            json_str = content.split("=", 1)[1].rstrip().rstrip(";")
            data = json.loads(json_str)
    else:
        with open(source_file, "r", encoding="utf-8") as f:
            data = json.load(f)

    sync_injuries_into_data(data, verbose=True)

    # Write out JSON
    if args.out_json:
        with open(args.out_json, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
        print(f"Saved updated injuries to {args.out_json}")

    # Write out JS
    if args.out_js:
        with open(args.out_js, "w", encoding="utf-8") as f:
            f.write("// Master players and rankings dataset for Ken's Fantasy Drafter\n")
            f.write("window.DRAFT_DATA = ")
            json.dump(data, f, indent=1)
            f.write(";\n")
        print(f"Saved updated injuries to {args.out_js}")


if __name__ == "__main__":
    main()
