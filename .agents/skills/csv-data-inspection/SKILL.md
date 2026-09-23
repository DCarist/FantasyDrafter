---
name: csv-data-inspection
description: >-
  Standard procedure for inspecting and analyzing remote CSV/tabular data sources:
  fetches the remote CSV once into the local data/ directory with a description and date
  using fetch_and_save_csv, analyzes the local snapshot to avoid redundant network requests,
  and ensures production code fetches from the live URL while keeping local CSVs gitignored.
---

# Remote CSV Data Inspection & Analysis Skill

This skill defines the standard procedure for exploring, profiling, and inspecting remote CSV data sources in **FantasyDrafter**.

---

## 1. Core Principles

1. **Single-Fetch Local Caching for Analysis:**
   - Whenever an agent is tasked with analyzing or inspecting a remote CSV URL (e.g., Google Sheets CSV exports, GitHub raw datasets, sports APIs), **do NOT make repetitive network requests** across exploration steps.
   - On the very first step, fetch the remote CSV **once** and save it locally to the project's `data/` directory using the provided `fetch_and_save_csv` utility.

2. **Standardized Filename Format:**
   - Save local exploration files with a clear descriptive slug and the current date:
     ```
     data/<source_or_dataset>_<short_description>_YYYY-MM-DD.csv
     ```
     *Example:* `data/google_sheet_main_paste_rankings_2026-08-23.csv`

3. **Local Analysis & Prototyping:**
   - All subsequent row counts, column profiling, header inspection, and schema validation scripts must read from the local file in `data/`.

4. **Production Remote Ingestion:**
   - Final application and update scripts (e.g., `update-rankings.py`) must configure and fetch from the live remote URL so data refreshes pull the latest live dataset.

5. **Git Hygiene:**
   - All downloaded inspection files inside `data/` must be ignored in `.gitignore` (`data/` or `data/*.csv`).

---

## 2. Helper Utility: `fetch_and_save_csv`

The skill provides a helper utility located at [`.agents/skills/csv-data-inspection/scripts/fetch_csv.py`](file:///d:/Programming/FantasyDrafter/.agents/skills/csv-data-inspection/scripts/fetch_csv.py).

### Method Signature:
```python
def fetch_and_save_csv(url: str, description_or_path: str = None, output_dir: str = "data") -> str:
    """Fetches a remote CSV and saves it locally with automatic date tagging.
    
    Args:
        url: The remote URL of the CSV.
        description_or_path: A descriptive name (e.g. 'main_paste_rankings')
                             OR an explicit target filepath (e.g. 'data/my_file.csv').
        output_dir: Target directory (default: 'data').
        
    Returns:
        The path of the saved local CSV file.
    """
```

---

## 3. Standard Workflow Runbook

### Step 1: Fetch and Save Using the Helper Function

#### Option A: Python Import
```python
import sys

sys.path.append(".agents/skills/csv-data-inspection/scripts")
from fetch_csv import fetch_and_save_csv

local_file = fetch_and_save_csv(
    url="http://docs.google.com/spreadsheets/d/.../gviz/tq?tqx=out:csv&sheet=MainPaste",
    description_or_path="google_sheet_rankings",
)
# Returns: 'data/google_sheet_rankings_2026-08-23.csv'
```

#### Option B: CLI Invocation
```powershell
python .agents/skills/csv-data-inspection/scripts/fetch_csv.py "http://docs.google.com/spreadsheets/d/.../gviz/tq?tqx=out:csv&sheet=MainPaste" "google_sheet_rankings"
```

### Step 2: Perform All Content & Schema Analysis on the Local File
Execute inspection scripts against the local cached file:
```python
import csv

with open("data/google_sheet_rankings_2026-08-23.csv", "r", encoding="utf-8") as f:
    reader = csv.reader(f)
    rows = list(reader)

print(f"Total rows: {len(rows)}")
print(f"Headers: {rows[0]}")
```

### Step 3: Implement Final Remote Fetch in Production Code
When integrating into production scripts (like `update-rankings.py`), use the remote URL directly with proper error handling and timeouts so live updates continue working seamlessly.

