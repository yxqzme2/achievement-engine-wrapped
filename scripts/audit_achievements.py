import sqlite3
import os
import json
import urllib.request

# Configuration (Matches your Unraid setup)
DB_PATH = os.getenv("STATE_DB_PATH", "/data/state.db")
ABS_URL = os.getenv("ABSSTATS_BASE_URL", "http://abs-stats:3000").rstrip("/")

def get_user_map():
    """Fetch uuid -> username map from ABSStats."""
    try:
        url = f"{ABS_URL}/api/usernames"
        with urllib.request.urlopen(url, timeout=5) as resp:
            data = json.loads(resp.read().decode())
            # Handle different possible API shapes
            if "map" in data: return data["map"]
            if "users" in data: return {u["id"]: u["username"] for u in data["users"]}
    except Exception as e:
        # Fallback to internal container name if host check fails
        try:
            url_alt = "http://abs-stats:3000/api/usernames"
            with urllib.request.urlopen(url_alt, timeout=2) as resp:
                data = json.loads(resp.read().decode())
                if "map" in data: return data["map"]
                if "users" in data: return {u["id"]: u["username"] for u in data["users"]}
        except:
            pass
    return {}

def run_audit():
    # Resolve DB path for host if running outside container
    db_file = DB_PATH
    if not os.path.exists(db_file):
        # Try common Unraid host path
        db_file = "/mnt/user/appdata/achievement-engine/state.db"
    
    if not os.path.exists(db_file):
        print(f"Error: Database not found at {DB_PATH} or {db_file}")
        return

    user_map = get_user_map()
    
    conn = sqlite3.connect(db_file)
    cursor = conn.cursor()

    # Use simple strings instead of complex f-strings to avoid syntax issues on some versions
    header = "{:<20} | {:<12} | {:<8}".format("USERNAME", "ACHIEVEMENTS", "GEAR")
    print("\n" + header)
    print("-" * 46)

    try:
        # Query counts
        # We UNION all unique users from both tables to ensure no one is missed
        query = """
        SELECT 
            u.user_id,
            (SELECT COUNT(*) FROM awards a WHERE a.user_id = u.user_id) as ach_count,
            (SELECT COUNT(*) FROM user_inventory i WHERE i.user_id = u.user_id) as gear_count
        FROM (
            SELECT DISTINCT user_id FROM awards 
            UNION 
            SELECT DISTINCT user_id FROM user_inventory
        ) u
        WHERE u.user_id != 'SYSTEM'
        ORDER BY ach_count DESC, gear_count DESC;
        """
        rows = cursor.execute(query).fetchall()

        for uid, ach, gear in rows:
            name = user_map.get(str(uid), str(uid)[:12] + "...")
            line = "{:<20} | {:<12} | {:<8}".format(name, ach, gear)
            print(line)

    except Exception as e:
        print(f"Error running query: {e}")
    finally:
        conn.close()
        print("\n")

if __name__ == "__main__":
    run_audit()
