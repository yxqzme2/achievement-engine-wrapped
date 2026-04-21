FROM python:3.12-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# --- PREPARE DEFAULTS (The Distribution Template) ---
RUN mkdir -p /defaults

# Copy entire folders recursively to preserve subfolders
COPY csv/ /defaults/csv/
COPY json/ /defaults/json/
COPY scripts/ /defaults/scripts/
COPY static/ /defaults/static/
COPY icons/ /defaults/icons/
COPY avatars/ /defaults/avatars/
COPY covers/ /defaults/covers/

# --- PREPARE CORE APP ---
COPY app/ /app/app/

# --- STARTUP SCRIPT ---
COPY setup.sh /app/setup.sh
RUN chmod +x /app/setup.sh

EXPOSE 8000

ENTRYPOINT ["/app/setup.sh"]
