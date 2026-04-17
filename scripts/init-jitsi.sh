#!/usr/bin/env bash
# Generate fresh Jitsi shared secrets and create the config tree.
# Run this once before starting Atrium with the "jitsi" profile.
set -euo pipefail

cd "$(dirname "$0")/.."

ROOT="./jitsi-cfg"
if [[ -d "$ROOT" ]]; then
  echo "jitsi-cfg already exists; skipping. Delete it to regenerate."
  exit 0
fi

mkdir -p \
  "$ROOT/web" \
  "$ROOT/transcripts" \
  "$ROOT/prosody/config" \
  "$ROOT/prosody/prosody-plugins-custom" \
  "$ROOT/jicofo" \
  "$ROOT/jvb" \
  "$ROOT/jigasi" \
  "$ROOT/jibri"

gen() { openssl rand -hex 16; }

ENV_FILE=".env"
if ! grep -q '^JICOFO_COMPONENT_SECRET=' "$ENV_FILE" 2>/dev/null; then
  cat >> "$ENV_FILE" <<EOF

# ───── Jitsi shared secrets (auto-generated $(date +%Y-%m-%d)) ─────
JICOFO_COMPONENT_SECRET=$(gen)
JICOFO_AUTH_PASSWORD=$(gen)
JVB_AUTH_PASSWORD=$(gen)
JIGASI_XMPP_PASSWORD=$(gen)
JIBRI_RECORDER_PASSWORD=$(gen)
JIBRI_XMPP_PASSWORD=$(gen)
EOF
  echo "Wrote Jitsi secrets to $ENV_FILE"
else
  echo "Jitsi secrets already present in $ENV_FILE; leaving as-is."
fi

echo ""
echo "Next steps:"
echo "  1. Set JITSI_PUBLIC_URL and JVB_ADVERTISE_IPS in .env"
echo "  2. Port-forward UDP ${JVB_PORT:-10000} on your router to this host"
echo "  3. docker compose --profile jitsi up -d"
