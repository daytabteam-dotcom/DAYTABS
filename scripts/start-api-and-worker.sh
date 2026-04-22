#!/bin/sh
set -eu

API_PID=""
WORKER_PID=""

cleanup() {
  if [ -n "${API_PID}" ] && kill -0 "${API_PID}" 2>/dev/null; then
    kill "${API_PID}" 2>/dev/null || true
  fi
  if [ -n "${WORKER_PID}" ] && kill -0 "${WORKER_PID}" 2>/dev/null; then
    kill "${WORKER_PID}" 2>/dev/null || true
  fi
}

trap cleanup INT TERM EXIT

node --max-old-space-size=384 --enable-source-maps artifacts/api-server/dist/index.mjs &
API_PID=$!

node --max-old-space-size=384 --enable-source-maps artifacts/api-server/dist/worker.mjs &
WORKER_PID=$!

EXIT_CODE=0
while :; do
  if ! kill -0 "${API_PID}" 2>/dev/null; then
    wait "${API_PID}" || EXIT_CODE=$?
    break
  fi
  if ! kill -0 "${WORKER_PID}" 2>/dev/null; then
    wait "${WORKER_PID}" || EXIT_CODE=$?
    break
  fi
  sleep 1
done

cleanup
wait "${API_PID}" 2>/dev/null || true
wait "${WORKER_PID}" 2>/dev/null || true

exit "${EXIT_CODE}"
