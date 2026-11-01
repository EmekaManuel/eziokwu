#!/usr/bin/env bash
# Local development Postgres (no Docker). Data lives in ~/.eziokwu-pgdata, port 5433, trust auth on localhost only.
#   scripts/dev-db.sh start   -> starts it (creating + migrating on first run) and prints the DATABASE_URL
#   scripts/dev-db.sh stop
set -euo pipefail
PG_BIN="${PG_BIN:-/opt/homebrew/opt/postgresql@16/bin}"
DIR="$HOME/.eziokwu-pgdata"
PORT=5433
URL="postgresql://postgres@127.0.0.1:$PORT/eziokwu"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

case "${1:-start}" in
  start)
    [ -d "$DIR" ] || "$PG_BIN/initdb" -D "$DIR" -U postgres --auth=trust -E UTF8 >/dev/null
    "$PG_BIN/pg_ctl" -D "$DIR" status >/dev/null 2>&1 || "$PG_BIN/pg_ctl" -D "$DIR" -o "-p $PORT -c listen_addresses=127.0.0.1 -c unix_socket_directories=''" -l "$DIR/log" -w start >/dev/null
    "$PG_BIN/psql" -h 127.0.0.1 -p $PORT -U postgres -tc "select 1 from pg_database where datname='eziokwu'" | grep -q 1 || "$PG_BIN/psql" -h 127.0.0.1 -p $PORT -U postgres -c "create database eziokwu" >/dev/null
    (cd "$ROOT/db" && DATABASE_URL="$URL" pnpm exec prisma migrate deploy >/dev/null)
    echo "DATABASE_URL=$URL"
    ;;
  stop) "$PG_BIN/pg_ctl" -D "$DIR" stop ;;
  *) sed -n '2,4p' "$0"; exit 1 ;;
esac
