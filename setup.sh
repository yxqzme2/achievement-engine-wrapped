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
    echo "[BOOTSTRAP] Existing data found in /data. Proceeding with live files."
fi

# 2. LINK STATIC FILES
# main.py expects /app/static, but data lives in /data/static
ln -sf /data/static /app/static
echo "[SYSTEM] Symlinked /app/static -> /data/static"

# 3. RUN THE APP
echo "[SYSTEM] Launching Achievement Engine on Port 8000..."
cd /app
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
