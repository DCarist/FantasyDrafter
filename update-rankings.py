#!/usr/bin/env python3
"""Root shim for update_rankings.py located in scripts/ directory."""
import os
import sys

# Ensure scripts directory is in sys.path
SCRIPTS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "scripts")
if SCRIPTS_DIR not in sys.path:
    sys.path.insert(0, SCRIPTS_DIR)

from update_rankings import main

if __name__ == "__main__":
    main()
