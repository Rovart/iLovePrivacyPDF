#!/usr/bin/env bash

# iLovePrivacyPDF - Stop Script
# Stops all running services gracefully
# Usage: ./stop.sh

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo -e "${BLUE}Stopping OCR project services...${NC}"

cd "$ROOT_DIR"

# 1) Stop the Nexa server using pid file or port
if [ -f ./nexa.pid ]; then
  PID=$(cat ./nexa.pid || true)
  if [ -n "$PID" ] && ps -p "$PID" > /dev/null 2>&1; then
    echo -e "${GREEN}Stopping Nexa server PID: $PID${NC}"
    kill "$PID" || true
    sleep 1
    # Wait for the process to exit
    if ps -p "$PID" > /dev/null 2>&1; then
      echo -e "${YELLOW}PID $PID still running, force killing...${NC}"
      kill -9 "$PID" || true
    fi
  else
    echo -e "${YELLOW}No active process with PID $PID (or pid file stale).${NC}"
  fi
  rm -f ./nexa.pid || true
else
  # Try kill by listening port if pid file is missing
  NEXA_PIDS=$(lsof -tiTCP:18181 -sTCP:LISTEN || true)
  if [ -n "$NEXA_PIDS" ]; then
    echo -e "${GREEN}Killing processes listening on port 18181: $NEXA_PIDS${NC}"
    kill $NEXA_PIDS || true
  else
    echo -e "${YELLOW}No Nexa server PID file or port listener found.${NC}"
  fi
fi

# 2) Stop the Ollama server using pid file or port
if [ -f ./ollama.pid ]; then
  PID=$(cat ./ollama.pid || true)
  if [ -n "$PID" ] && ps -p "$PID" > /dev/null 2>&1; then
    echo -e "${GREEN}Stopping Ollama server PID: $PID${NC}"
    kill "$PID" || true
    sleep 1
    if ps -p "$PID" > /dev/null 2>&1; then
      echo -e "${YELLOW}PID $PID still running, force killing...${NC}"
      kill -9 "$PID" || true
    fi
  else
    echo -e "${YELLOW}No active process with PID $PID (or pid file stale).${NC}"
  fi
  rm -f ./ollama.pid || true
else
  # Try kill by listening port if pid file is missing
  OLLAMA_PIDS=$(lsof -tiTCP:11434 -sTCP:LISTEN || true)
  if [ -n "$OLLAMA_PIDS" ]; then
    echo -e "${GREEN}Killing processes listening on port 11434: $OLLAMA_PIDS${NC}"
    kill $OLLAMA_PIDS || true
  else
    echo -e "${YELLOW}No Ollama server PID file or port listener found.${NC}"
  fi
fi

# Also kill any stray 'nexa infer' processes (warmup) and 'nexa serve' leftovers
if command -v pgrep &> /dev/null; then
  # Kill specific nexa commands first
  for PAT in "nexa infer" "nexa serve" "nexa run" "nexa-cli" "NexaCLI" "nexa"; do
    if pgrep -f "$PAT" > /dev/null 2>&1; then
      echo -e "${GREEN}Killing processes matching: '$PAT'${NC}"
      PIDS=$(pgrep -f "$PAT" | tr '\n' ' ')
      for PID in $PIDS; do
        if [ -n "$PID" ]; then
          kill "$PID" || true
          sleep 1
          if ps -p "$PID" > /dev/null 2>&1; then
            echo -e "${YELLOW}Process $PID still running, forcing kill...${NC}"
            kill -9 "$PID" || true
          fi
        fi
      done
    fi
  done
fi

# 2) Stop Next.js dev server (check port 3000 & 3001 and 'next dev' process)
echo -e "${BLUE}Stopping Next.js dev server if present...${NC}"
PORTS=(3000 3001 3002)
KILLED_NEXT=false
for PORT in "${PORTS[@]}"; do
  PIDS=$(lsof -tiTCP:$PORT -sTCP:LISTEN || true)
  if [ -n "$PIDS" ]; then
    echo -e "${GREEN}Killing processes listening on port $PORT: $PIDS${NC}"
    kill $PIDS || true
    KILLED_NEXT=true
  fi
done

if command -v pgrep &> /dev/null; then
  if pgrep -f "next dev" > /dev/null 2>&1; then
    echo -e "${GREEN}Killing 'next dev' processes...${NC}"
    PIDS=$(pgrep -f "next dev" | tr '\n' ' ')
    for PID in $PIDS; do
      kill "$PID" || true
      sleep 1
      if ps -p "$PID" > /dev/null 2>&1; then
        kill -9 "$PID" || true
      fi
    done
    KILLED_NEXT=true
  fi
  # Also kill any Node processes that look like 'next' (fallback)
  if pgrep -f "node .*next" > /dev/null 2>&1; then
    echo -e "${GREEN}Killing any 'node ... next' processes...${NC}"
    PIDS=$(pgrep -f "node .*next" | tr '\n' ' ')
    for PID in $PIDS; do
      kill "$PID" || true
      sleep 1
      if ps -p "$PID" > /dev/null 2>&1; then
        kill -9 "$PID" || true
      fi
    done
    KILLED_NEXT=true
  fi
fi

if [ "$KILLED_NEXT" = "false" ]; then
  echo -e "${YELLOW}No Next.js dev server found.${NC}"
fi

# 3) Kill other commonly used utilities in this project
if command -v pgrep &> /dev/null; then
  # Kill any stray 'nexa' processes that could be lingering
  if pgrep -f "nexa" > /dev/null 2>&1; then
    echo -e "${GREEN}Killing remaining 'nexa' processes...${NC}"
    pkill -f "nexa" || true
  fi
fi

# 4) Cleanup logs (optional implement a flag --no-clean to skip)
if [ "$1" != "--no-clean" ]; then
  echo -e "${BLUE}Cleaning logs: ./nexa.log ./ollama.log ./nexa_infer_warmup.log${NC}"
  rm -f ./nexa.log ./ollama.log ./nexa_infer_warmup.log || true
fi

echo -e "${GREEN}Stop procedure completed. Double-check logs and processes if necessary.${NC}"

exit 0
