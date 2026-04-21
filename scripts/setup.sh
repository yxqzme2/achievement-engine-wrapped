#!/bin/bash
set -e

echo "[BOOTSTRAP] Checking system health and directory structure..."

# 1. THE DATA SYNC (The "Clean Install" Engine)
# Using the presence of the core JSON as the flag for a blank install
if [ ! -f "/data/json/achievements.points.json" ]; then
    echo "[BOOTSTRAP] Blank /data volume detected. Seeding from distribution template..."

    # Ensure the parent directory is clean and ready
    mkdir -p /data

    # Use -a (archive) to preserve all subfolders, permissions, and recursive structure
    cp -rv /defaults/. /data/

    # Set default permissions (Unraid Friendly)
    chmod -R 777 /data
    echo "[BOOTSTRAP] Seeding complete. All subfolders (static/admin, etc.) are live in /data."
else
    echo "[BOOTSTRAP] Existing data found in /data. Syncing static files from image..."

    # Always overwrite static assets from the baked-in defaults so upgrades
    # pick up new CSS/JS/HTML files without requiring a manual file copy.
    # State files (state.db, json/, covers/) are untouched.
    mkdir -p /data/static
    cp -rf /defaults/static/. /data/static/
    chmod -R 777 /data/static
    echo "[BOOTSTRAP] Static files synced."
fi

# 2. RUN THE APP
echo "[SYSTEM] Launching Achievement Engine on Port 8000..."
cd /app
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
