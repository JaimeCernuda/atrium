#!/bin/bash
# Deliver "received" GRC submissions to babbage2 via the isolated VPN VM.
#   /data/papers/<key>/* --(scp, ProxyJump through scs-relay VM on the IIT VPN)--> babbage2
# Updates the atrium DB: status received -> delivering -> delivered|failed, sets public URLs.
# Run from cron (every ~2 min) or by hand. Talks to the atrium Postgres via `docker exec`.
set -uo pipefail

SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SELF_DIR/babbage.env"   # SCS_PASS=...
# shellcheck disable=SC1091
source "$SELF_DIR/vpn.env"       # VPN_USERNAME / VPN_PASSWORD / VPN_SECURITY_ANSWER

PAPERS_DIR=/data/papers
VM_NAME=scs-relay
VM_MAC=52:54:00:a5:91:cd
VM_USER=relay
VM_KEY="$HOME/.ssh/scs_vm_key"
BABBAGE_HOST=babbage2.cs.iit.edu
BABBAGE_DIR=/home/scs/public_html/assets/files
PUBLIC_BASE=http://cs.iit.edu/~scs/assets/files
SSH_CFG=/tmp/scs-deliver-ssh.cfg

PG=(docker exec -i atrium-postgres psql -U atrium -d atrium)
q()  { "${PG[@]}" -t -A -F $'\t' -c "$1"; }
x()  { "${PG[@]}" -q -c "$1"; }
sqlq() { printf '%s' "$1" | sed "s/'/''/g"; }

log() { echo "[deliver $(date '+%H:%M:%S')] $*"; }

find_vm_ip() { ip neigh | awk -v m="$VM_MAC" 'tolower($0) ~ tolower(m){print $1; exit}'; }

ensure_vm_ip() {
  local st ip
  st=$(sudo -n virsh domstate "$VM_NAME" 2>/dev/null || true)
  if [ "$st" != "running" ]; then
    log "starting VM"
    sudo -n virsh start "$VM_NAME" >/dev/null 2>&1 || true
    sleep 40
  fi
  ip=$(find_vm_ip)
  if [ -z "$ip" ]; then
    for i in $(seq 1 254); do ping -c1 -W1 "10.0.0.$i" >/dev/null 2>&1 & done; wait 2>/dev/null
    sleep 1; ip=$(find_vm_ip)
  fi
  printf '%s' "$ip"
}

vm_ssh() { ssh -o BatchMode=yes -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -i "$VM_KEY" "$VM_USER@$1" "$2"; }

ensure_vpn() {
  local ip="$1" state
  state=$(vm_ssh "$ip" "/opt/cisco/secureclient/bin/vpn state 2>/dev/null | grep -i state | tail -1" || true)
  if echo "$state" | grep -q Connected; then return 0; fi
  log "connecting VPN in VM"
  vm_ssh "$ip" "VPN_USERNAME='$VPN_USERNAME' VPN_PASSWORD='$VPN_PASSWORD' VPN_SECURITY_ANSWER='$VPN_SECURITY_ANSWER' bash -s" <<'RVPN'
VPN=/opt/cisco/secureclient/bin/vpn
"$VPN" disconnect >/dev/null 2>&1; sleep 1
printf "%s\n" "connect vpn.iit.edu" "0" "$VPN_USERNAME" "$VPN_PASSWORD" "$VPN_SECURITY_ANSWER" | "$VPN" -s >/dev/null 2>&1
RVPN
  sleep 3
  state=$(vm_ssh "$ip" "/opt/cisco/secureclient/bin/vpn state 2>/dev/null | grep -i state | tail -1" || true)
  echo "$state" | grep -q Connected
}

write_ssh_cfg() {
  local ip="$1"
  cat > "$SSH_CFG" <<EOF
Host scs-vm
  HostName $ip
  User $VM_USER
  IdentityFile $VM_KEY
  StrictHostKeyChecking no
  UserKnownHostsFile /dev/null

Host babbage-relay
  HostName $BABBAGE_HOST
  User scs
  ProxyJump scs-vm
  HostKeyAlgorithms +ssh-rsa
  PreferredAuthentications password
  StrictHostKeyChecking accept-new
  UserKnownHostsFile /dev/null
EOF
}

deliver_one() {
  local id="$1" key="$2" files_json="$3"
  local dir="$PAPERS_DIR/$key" out rc
  if [ ! -d "$dir" ]; then
    x "UPDATE \"Submission\" SET status='failed', \"deliveryLog\"='archive dir missing' WHERE id='$id';"
    log "FAIL $key: no archive dir"; return 1
  fi
  out=$(sshpass -p "$SCS_PASS" scp -F "$SSH_CFG" "$dir"/* "babbage-relay:$BABBAGE_DIR/" 2>&1); rc=$?
  if [ $rc -ne 0 ]; then
    x "UPDATE \"Submission\" SET status='failed', \"deliveryLog\"='$(sqlq "$(printf '%s' "$out" | tail -c 400)")' WHERE id='$id';"
    log "FAIL $key (rc=$rc): $out"; return 1
  fi
  local newfiles
  newfiles=$(printf '%s' "$files_json" | jq -c --arg b "$PUBLIC_BASE" 'map(.publicUrl = ($b + "/" + .filename))')
  x "UPDATE \"Submission\" SET status='delivered', \"deliveredAt\"=now(), \"deliveryLog\"=NULL, files='$(sqlq "$newfiles")'::jsonb WHERE id='$id';"
  log "OK $key -> $BABBAGE_DIR"
}

# Withdraw a cancelled submission: rm its files on babbage, then either delete
# the DB row (purgeRequested) or mark it 'cancelled'. Local files were already
# removed and the website PR reverted by the server; this is the remote half.
cancel_one() {
  local id="$1" key="$2" files_json="$3" purge="$4"
  local names rmcmd="" fn esc
  names=$(printf '%s' "$files_json" | jq -r '.[].filename' 2>/dev/null)
  while IFS= read -r fn; do
    [ -z "$fn" ] && continue
    esc=$(printf '%s' "$fn" | sed "s/'/'\\\\''/g")
    rmcmd+="rm -f '$BABBAGE_DIR/$esc'; "
  done <<< "$names"
  if [ -n "$rmcmd" ]; then
    sshpass -p "$SCS_PASS" ssh -F "$SSH_CFG" babbage-relay "$rmcmd" 2>&1 | while read -r l; do log "rm: $l"; done || true
  fi
  if [ "$purge" = "t" ]; then
    x "DELETE FROM \"Submission\" WHERE id='$id';"
    log "PURGED $key (remote files removed)"
  else
    x "UPDATE \"Submission\" SET status='cancelled' WHERE id='$id';"
    log "CANCELLED $key (remote files removed)"
  fi
}

main() {
  local rows cancels ip
  rows=$(q "SELECT id, \"citationKey\", files::text FROM \"Submission\" WHERE status='received' ORDER BY \"createdAt\";")
  cancels=$(q "SELECT id, \"citationKey\", files::text, \"purgeRequested\" FROM \"Submission\" WHERE status='cancelling' ORDER BY \"createdAt\";")
  if [ -z "$rows" ] && [ -z "$cancels" ]; then log "nothing to deliver"; exit 0; fi
  ip=$(ensure_vm_ip)
  if [ -z "$ip" ]; then log "VM IP not found"; exit 1; fi
  log "VM at $ip"
  if ! ensure_vpn "$ip"; then log "VPN not connected; aborting"; exit 1; fi
  write_ssh_cfg "$ip"
  if [ -n "$rows" ]; then
    while IFS=$'\t' read -r id key files; do
      [ -z "$id" ] && continue
      x "UPDATE \"Submission\" SET status='delivering' WHERE id='$id';"
      deliver_one "$id" "$key" "$files"
    done <<< "$rows"
  fi
  if [ -n "$cancels" ]; then
    while IFS=$'\t' read -r id key files purge; do
      [ -z "$id" ] && continue
      cancel_one "$id" "$key" "$files" "$purge"
    done <<< "$cancels"
  fi
  rm -f "$SSH_CFG"
}
main "$@"
