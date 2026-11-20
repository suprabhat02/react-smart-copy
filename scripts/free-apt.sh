#!/usr/bin/env bash
# Frees apt and dpkg for a browser install on a GitHub-hosted Ubuntu runner.
#
# Ubuntu's unattended upgrades start soon after boot and hold dpkg's lock for minutes, so
# `playwright install --with-deps` failed three tries in a row with "dpkg frontend lock was
# locked by another process" (the holder was not apt-get or dpkg, so killing those did nothing).
# This stops the upgrades, waits for the locks to be released, and only then, if they are
# still held, kills whatever holds them.
set -u

LOCKS=(/var/lib/dpkg/lock-frontend /var/lib/dpkg/lock /var/lib/apt/lists/lock /var/cache/apt/archives/lock)

sudo systemctl stop unattended-upgrades.service apt-daily.service apt-daily-upgrade.service apt-daily.timer apt-daily-upgrade.timer 2>/dev/null || true
sudo pkill -f unattended-upgrade 2>/dev/null || true

locked() {
  # Without fuser, nothing can be learned: carry on as if free, and let the install's retry decide.
  command -v fuser > /dev/null || return 1
  sudo fuser "${LOCKS[@]}" > /dev/null 2>&1
}

for _ in $(seq 1 90); do
  if ! locked; then
    sudo dpkg --configure -a > /dev/null 2>&1 || true
    exit 0
  fi
  sleep 2
done

echo "::warning::apt or dpkg was still locked after 3 minutes; stopping what holds the locks."
sudo fuser -k -9 "${LOCKS[@]}" > /dev/null 2>&1 || true
sudo dpkg --configure -a || true
