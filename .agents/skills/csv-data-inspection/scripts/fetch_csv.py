#!/usr/bin/env python3
"""Helper utility to fetch and cache remote CSV data files locally for inspection."""

import os
import sys
import urllib.request
from datetime import date


def fetch_and_save_csv(url: str, description_or_path: str = None, output_dir: str = "data") -> str:
    """Fetches a remote CSV from a URL and saves it to a local file for inspection.
    
    Args:
        url: The remote URL of the CSV.
        description_or_path: A descriptive name for the file (e.g. 'sheet_rankings')
                             OR an explicit filepath (e.g. 'data/my_file.csv').
        output_dir: Target directory if a description is provided (default: 'data').
        
    Returns:
        The path of the saved local CSV file.
    """
    os.makedirs(output_dir, exist_ok=True)
    
    if description_or_path and (description_or_path.endswith('.csv') or os.path.sep in description_or_path or '/' in description_or_path):
        target_path = description_or_path
        parent_dir = os.path.dirname(target_path)
        if parent_dir:
            os.makedirs(parent_dir, exist_ok=True)
    else:
        desc = (description_or_path or "dataset").strip().replace(" ", "_").lower()
        today_str = date.today().isoformat()
        target_path = os.path.join(output_dir, f"{desc}_{today_str}.csv")
        
    print(f"Fetching CSV from: {url}")
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) FantasyDrafter/1.0"}
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        content = resp.read()
        
    with open(target_path, "wb") as f:
        f.write(content)
        
    print(f"Successfully saved ({len(content):,} bytes) to: {target_path}")
    return target_path


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python fetch_csv.py <URL> [description_or_path]")
        sys.exit(1)
        
    csv_url = sys.argv[1]
    desc_arg = sys.argv[2] if len(sys.argv) > 2 else "dataset"
    fetch_and_save_csv(csv_url, desc_arg)

