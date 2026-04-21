#!/usr/bin/env bash
set -e

# Achievement Engine - Interactive Setup
# Run this after cloning the repo: bash install.sh

echo ""
echo "=== Achievement Engine Setup ==="
echo ""

# --- Check prerequisites ---
missing=""
if ! command -v docker &>/dev/null; then
  missing="docker"
fi
if ! docker compose version &>/dev/null 2>&1; then
  if [ -n "$missing" ]; then
    missing="$missing, docker compose"
  else
    missing="docker compose"
  fi
fi

if [ -n "$missing" ]; then
  echo "ERROR: Missing required tools: $missing"
  echo "Install Docker: https://docs.docker.com/get-docker/"
  exit 1
fi

echo "Docker found: $(docker --version)"
echo ""

# --- Create .env if it doesn't exist ---
if [ -f .env ]; then
  echo ".env already exists, skipping creation."
  echo "  (Delete .env and re-run this script to start fresh)"
  echo ""
else
  cp .env.example .env
  echo "Created .env from .env.example"
  echo ""
fi

# --- Audiobookshelf connection ---
echo "--- Audiobookshelf Connection ---"
echo ""
read -rp "Audiobookshelf server URL (e.g. http://192.168.1.50:13378): " abs_url
abs_url="${abs_url:-http://audiobookshelf:13378}"

echo ""
echo "You need an API token for each user you want to track."
echo "Get tokens from: Audiobookshelf > Settings > Users > [user] > API Token"
echo ""
echo "For a SINGLE user, just paste one token."
echo "For MULTIPLE users, enter them as: username1:token1,username2:token2"
echo ""
read -rp "API token(s): " abs_tokens

if [[ "$abs_tokens" == *":"* ]]; then
  abs_token=""
  abs_tokens_val="$abs_tokens"
  echo "  -> Multi-user mode detected"
else
  abs_token="$abs_tokens"
  abs_tokens_val=""
  echo "  -> Single-user mode detected"
fi

# --- Timezone ---
echo ""
echo "--- Timezone ---"
echo "Used for date display on the dashboard and timeline."
echo "Examples: America/New_York  America/Chicago  America/Los_Angeles  Europe/London"
read -rp "Your timezone [America/New_York]: " user_tz
user_tz="${user_tz:-America/New_York}"
echo ""

# --- Allowed users ---
echo "--- Optional: Restrict Users ---"
echo "By default all ABS users are tracked. To limit to specific users,"
echo "enter a comma-separated list of ABS usernames."
echo "(Press Enter to track all users)"
read -rp "Allowed usernames: " allowed_users
echo ""

# --- Display name aliases ---
echo "--- Optional: User Display Names ---"
echo "Map ABS usernames to friendly names shown on the dashboard."
echo "Format: absuser1:Display Name,absuser2:Display Name"
echo "(Press Enter to skip)"
read -rp "User aliases: " user_aliases
echo ""

# --- Discord notifications ---
echo "--- Optional: Discord Notifications ---"
echo "Post achievement unlocks to a Discord channel via webhook."
echo "(Press Enter to skip)"
read -rp "Discord webhook URL: " discord_webhook
echo ""

# --- SMTP / email notifications ---
echo "--- Optional: Email Notifications ---"
echo "Send email alerts when achievements are earned."
echo "(Press Enter to skip all email settings)"
read -rp "SMTP server hostname (e.g. smtp.gmail.com): " smtp_host

if [ -n "$smtp_host" ]; then
  read -rp "SMTP port [587]: " smtp_port
  smtp_port="${smtp_port:-587}"
  read -rp "SMTP username: " smtp_username
  read -rp "SMTP password: " smtp_password
  read -rp "From address (e.g. noreply@yourdomain.com): " smtp_from
  echo ""
  echo "For testing, you can send ALL notification emails to a single address."
  echo "(Press Enter to skip — each user receives their own notification)"
  read -rp "Override all emails to this address: " smtp_to_override
  echo ""
  if [ -n "$smtp_to_override" ]; then
    echo "  -> Email notifications enabled (all emails -> ${smtp_to_override})"
  else
    echo "  -> Email notifications enabled"
  fi
else
  echo "  -> Email notifications skipped"
fi
echo ""

# --- Write docker-compose.override.yml ---
cat > docker-compose.override.yml <<EOF
services:
  abs-stats:
    environment:
      - ABS_URL=${abs_url}
EOF

if [ -n "$abs_token" ]; then
  cat >> docker-compose.override.yml <<EOF
      - ABS_TOKEN=${abs_token}
EOF
fi

if [ -n "$abs_tokens_val" ]; then
  cat >> docker-compose.override.yml <<EOF
      - ABS_TOKENS=${abs_tokens_val}
EOF
fi

cat >> docker-compose.override.yml <<EOF
      - ENGINE_URL=http://achievement-engine:8000
EOF

if [ -n "$discord_webhook" ]; then
  cat >> docker-compose.override.yml <<EOF
      - DISCORD_WEBHOOK_URL=${discord_webhook}
EOF
fi

echo "Created docker-compose.override.yml"

# --- Update .env ---
sed -i "s|^TZ=.*|TZ=${user_tz}|" .env
sed -i "s|^ABSSTATS_BASE_URL=.*|ABSSTATS_BASE_URL=http://abs-stats:3000|" .env

if [ -n "$allowed_users" ]; then
  sed -i "s|^ALLOWED_USERS=.*|ALLOWED_USERS=${allowed_users}|" .env
fi

if [ -n "$user_aliases" ]; then
  sed -i "s|^USER_ALIASES=.*|USER_ALIASES=${user_aliases}|" .env
fi

if [ -n "$discord_webhook" ]; then
  sed -i "s|^DISCORD_PROXY_URL=.*|DISCORD_PROXY_URL=http://abs-stats:3000/api/discord-notify|" .env 2>/dev/null || true
fi

if [ -n "$smtp_host" ]; then
  sed -i "s|^SMTP_HOST=.*|SMTP_HOST=${smtp_host}|" .env
  sed -i "s|^SMTP_PORT=.*|SMTP_PORT=${smtp_port}|" .env
  sed -i "s|^SMTP_USERNAME=.*|SMTP_USERNAME=${smtp_username}|" .env
  sed -i "s|^SMTP_PASSWORD=.*|SMTP_PASSWORD=${smtp_password}|" .env
  sed -i "s|^SMTP_FROM=.*|SMTP_FROM=${smtp_from}|" .env
  if [ -n "$smtp_to_override" ]; then
    sed -i "s|^SMTP_TO_OVERRIDE=.*|SMTP_TO_OVERRIDE=${smtp_to_override}|" .env
  fi
fi

echo "Updated .env with your settings."
echo ""

# --- Create required directories ---
mkdir -p data data/covers icons
echo "Created data/ and icons/ directories."
echo ""

# --- Done ---
echo "=== Setup Complete ==="
echo ""
echo "Review your settings:"
echo "  - docker-compose.override.yml  (ABS connection + Discord)"
echo "  - .env                          (engine config, timezone, SMTP)"
echo ""
echo "Build and start:"
echo "  docker compose up --build -d"
echo ""
echo "  (First build takes a few minutes — Node + Python images are built locally)"
echo ""
echo "Then open: http://localhost:8000"
echo ""
