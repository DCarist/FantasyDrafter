#!/usr/bin/env python3
"""Root shim for fetch_injuries.py located in scripts/ directory."""
import os
import sys

SCRIPTS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "scripts")
if SCRIPTS_DIR not in sys.path:
    sys.path.insert(0, SCRIPTS_DIR)

from fetch_injuries import main

if __name__ == "__main__":
    main()
