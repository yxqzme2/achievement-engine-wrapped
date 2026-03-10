import sqlite3
import os
import json
import time
import urllib.request
from datetime import datetime, timezone

# Configuration
DB_PATH = os.getenv("STATE_DB_PATH", "/data/state.db")
ABS_URL = os.getenv("ABSSTATS_BASE_URL", "http://abs-stats:3000").rstrip("/")

if not os.path.exists(DB_PATH):
    DB_PATH = "/mnt/user/appdata/achievement-engine/state.db"
if not os.path.exists(DB_PATH):
    DB_PATH = "data/state.db"

def get_user_map():
    """Fetch uuid -> username map from ABSStats."""
    try:
        url = f"{ABS_URL}/api/usernames"
        with urllib.request.urlopen(url, timeout=5) as resp:
            data = json.loads(resp.read().decode())
            if "map" in data: return data["map"]
            if "users" in data: return {u["id"]: u["username"] for u in data["users"]}
    except:
        pass
    return {}

def format_ts(ts):
    return datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%d %H:%M")

def run_chronicle():
    if not os.path.exists(DB_PATH):
        print(f"Error: Database not found at {DB_PATH}")
        return

    user_map = get_user_map()
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    print("SYSTEM CHRONICLE: RECENT EVENTS")
    print("=" * 60)

    # 1. Recent Achievements
    print("\n[ RECENT ACHIEVEMENTS ]")
    print(f"{'DATE':<18} | {'USERNAME':<15} | {'ACHIEVEMENT'}")
    print("-" * 60)
    
    try:
        rows = cursor.execute("""
            SELECT awarded_at, user_id, achievement_id 
            FROM awards 
            ORDER BY awarded_at DESC 
            LIMIT 15
        """).fetchall()
        
        for r in rows:
            uid = r['user_id']
            uname = user_map.get(uid, uid) # Fallback to ID if not found
            print(f"{format_ts(r['awarded_at']):<18} | {uname:<15} | {r['achievement_id']}")
    except Exception as e:
        print(f"Error fetching awards: {e}")

    # 2. Recent Loot Acquired
    print("\n[ RECENT LOOT ACQUIRED ]")
    print(f"{'DATE':<18} | {'USERNAME':<15} | {'ITEM ID':<15} | {'SOURCE'}")
    print("-" * 60)
    
    try:
        rows = cursor.execute("""
            SELECT acquired_at, user_id, item_id, source 
            FROM user_inventory 
            ORDER BY acquired_at DESC 
            LIMIT 15
        """).fetchall()
        
        for r in rows:
            uid = r['user_id']
            uname = user_map.get(uid, uid)
            print(f"{format_ts(r['acquired_at']):<18} | {uname:<15} | {r['item_id']:<15} | {r['source']}")
    except Exception as e:
        print(f"Error fetching inventory: {e}")

    # 3. Summary Totals
    print("\n[ SYSTEM TOTALS ]")
    try:
        ach_count = cursor.execute("SELECT COUNT(*) FROM awards").fetchone()[0]
        loot_count = cursor.execute("SELECT COUNT(*) FROM user_inventory").fetchone()[0]
        user_count = cursor.execute("SELECT COUNT(DISTINCT user_id) FROM user_base_stats").fetchone()[0]
        
        print(f"Total Users:         {user_count}")
        print(f"Total Awards Issued: {ach_count}")
        print(f"Total Loot Claims:   {loot_count}")
    except:
        pass

    conn.close()

if __name__ == "__main__":
    run_chronicle()
