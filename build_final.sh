#!/bin/bash
# --- SYSTEM: UNRAID IMAGE BUILDER (AUTO-CONTEXT) ---

# 1. FORCE CORRECT DIRECTORY
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
cd "$SCRIPT_DIR"

IMAGE_NAME="achievement-engine:latest"
CONTAINER_NAME="achievement-engine"
APPDATA_PATH="/mnt/user/appdata/achievement-engine"

echo "--- 1. DESTROYING PREVIOUS INSTALLATION ---"
docker stop $CONTAINER_NAME 2>/dev/null || true
docker rm $CONTAINER_NAME 2>/dev/null || true

if [ -d "$APPDATA_PATH" ]; then
    echo "[CLEANUP] Removing $APPDATA_PATH..."
    rm -rf "$APPDATA_PATH"
fi

docker rmi $IMAGE_NAME 2>/dev/null || true

echo "--- 2. SANITIZING ENVIRONMENT ---"
# Ensure required folders exist so Docker COPY doesn't fail
mkdir -p covers
sed -i 's/\r$//' setup.sh
chmod +x setup.sh

echo "--- 3. THE HEAVY LIFT: DOCKER BUILD ---"
docker build --no-cache -t $IMAGE_NAME .

echo ""
echo "--- FINAL CHECK ---"
if docker images | grep -q "achievement-engine"; then
    echo "✅ SUCCESS: Image '$IMAGE_NAME' is ready."
    echo "You can now click APPLY on your Unraid Template."
else
    echo "❌ ERROR: The build failed."
fi
