#!/usr/bin/env bash
set -euo pipefail

APP_NAME="pilangfuse"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$ROOT_DIR/logs"
RUN_DIR="$ROOT_DIR/.run"
PID_FILE="$RUN_DIR/server.pid"
LOCAL_LOG_FILE="$LOG_DIR/server.log"
DEFAULT_URL="http://localhost:3000"

mkdir -p "$LOG_DIR" "$RUN_DIR"
cd "$ROOT_DIR"

bold() { printf "\033[1m%s\033[0m\n" "$1"; }
info() { printf "ℹ️  %s\n" "$1"; }
success() { printf "✅ %s\n" "$1"; }
warn() { printf "⚠️  %s\n" "$1"; }
error() { printf "❌ %s\n" "$1"; }
step() { printf "🚀 %s\n" "$1"; }

compose_cmd() {
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    echo "docker compose"
  elif command -v docker-compose >/dev/null 2>&1; then
    echo "docker-compose"
  else
    return 1
  fi
}

ensure_env() {
  if [[ ! -f .env ]]; then
    warn ".env not found. Copying default template from .env.example"
    cp .env.example .env
    success ".env created. Please update credentials before running production tasks."
  fi
}

load_env_file() {
  if [[ -f .env ]]; then
    set -a
    # shellcheck disable=SC1091
    source .env
    set +a
  fi
}

install_app() {
  step "Installing Node.js dependencies"
  npm install
  success "Dependencies installed"
}

copy_env_tavily() {
  cp env/.env.tavily-youtube.example .env
  success "Copied env/.env.tavily-youtube.example to .env"
}

copy_env_serpapi() {
  cp env/.env.serpapi.example .env
  success "Copied env/.env.serpapi.example to .env"
}

syntax_check() {
  step "Running syntax validation"
  npm run check
}

is_local_running() {
  [[ -f "$PID_FILE" ]] || return 1
  local pid
  pid="$(cat "$PID_FILE")"
  kill -0 "$pid" >/dev/null 2>&1
}

start_local() {
  ensure_env
  if is_local_running; then
    warn "Local server already running with PID $(cat "$PID_FILE")"
    return 0
  fi

  step "Starting local server in background"
  nohup npm start > "$LOCAL_LOG_FILE" 2>&1 &
  echo $! > "$PID_FILE"
  sleep 2

  if is_local_running; then
    success "Local server started on $DEFAULT_URL"
    info "Logs: $LOCAL_LOG_FILE"
  else
    error "Local server failed to start. Check logs: $LOCAL_LOG_FILE"
    exit 1
  fi
}

stop_local() {
  if ! is_local_running; then
    warn "Local server is not running"
    rm -f "$PID_FILE"
    return 0
  fi

  local pid
  pid="$(cat "$PID_FILE")"
  step "Stopping local server PID $pid"
  kill "$pid" || true
  rm -f "$PID_FILE"
  success "Local server stopped"
}

restart_local() {
  stop_local
  start_local
}

status_local() {
  if is_local_running; then
    success "Local server running with PID $(cat "$PID_FILE")"
  else
    warn "Local server is not running"
  fi
}

logs_local() {
  touch "$LOCAL_LOG_FILE"
  tail -n 100 -f "$LOCAL_LOG_FILE"
}

build_docker() {
  ensure_env
  local dc
  dc="$(compose_cmd)"
  step "Building Docker image"
  $dc build
  success "Docker build completed"
}

push_code() {
  local message="${*:-}"
  if [[ -z "$message" ]]; then
    read -r -p "Enter commit message: " message
  fi

  [[ -n "$message" ]] || { error "Commit message is required"; exit 1; }

  step "Checking git status"
  git status --short

  step "Staging changes"
  git add -A

  if git diff --cached --quiet; then
    warn "No staged changes to commit"
    return 0
  fi

  step "Creating commit"
  git commit -m "$message"

  step "Pushing to origin/main"
  git push origin main
  success "Code pushed to GitHub"
}

push_docker_image() {
  ensure_env
  load_env_file

  local image_name="${DOCKER_IMAGE_NAME:-}"
  local image_tag="${DOCKER_IMAGE_TAG:-latest}"

  if [[ -z "$image_name" ]]; then
    error "DOCKER_IMAGE_NAME is not set in .env"
    info "Example: DOCKER_IMAGE_NAME=ghcr.io/lalitnayyar/pilangfuse"
    exit 1
  fi

  local dc
  dc="$(compose_cmd)"

  step "Building Docker image for push"
  $dc build

  step "Pushing Docker image: ${image_name}:${image_tag}"
  $dc push
  success "Docker image pushed: ${image_name}:${image_tag}"
}

start_docker() {
  ensure_env
  local dc
  dc="$(compose_cmd)"
  step "Starting application with Docker Compose"
  $dc up -d --build
  success "Docker services started"
}

stop_docker() {
  local dc
  dc="$(compose_cmd)"
  step "Stopping Docker services"
  $dc down
  success "Docker services stopped"
}

restart_docker() {
  stop_docker
  start_docker
}

logs_docker() {
  local dc
  dc="$(compose_cmd)"
  $dc logs -f
}

status_docker() {
  local dc
  dc="$(compose_cmd)"
  $dc ps
}

health_check() {
  local url="${1:-$DEFAULT_URL}/api/health"
  step "Checking health: $url"
  if command -v curl >/dev/null 2>&1; then
    curl -fsS "$url" && printf "\n"
    success "Health check passed"
  else
    warn "curl not available. Open $url manually"
  fi
}

open_ui() {
  local url="${1:-$DEFAULT_URL}"
  info "Opening $url"
  if command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$url" >/dev/null 2>&1 &
  elif command -v open >/dev/null 2>&1; then
    open "$url"
  else
    warn "No browser opener found. Visit $url manually"
  fi
}

run_research() {
  local topic="${*:-}"
  if [[ -z "$topic" ]]; then
    read -r -p "Enter research topic: " topic
  fi

  [[ -n "$topic" ]] || { error "Topic is required"; exit 1; }
  ensure_env
  step "Running research workflow for: $topic"
  npm run research -- "$topic"
}

update_app() {
  step "Pulling latest code"
  git pull --rebase origin main
  step "Installing updated dependencies"
  npm install
  success "Application updated"
}

deploy_app() {
  step "Deploying latest application version"
  update_app
  build_docker
  start_docker
  health_check "$DEFAULT_URL"
  success "Deployment completed"
}

backup_reports() {
  local stamp archive
  stamp="$(date +%Y%m%d-%H%M%S)"
  archive="reports-backup-$stamp.tar.gz"
  if [[ ! -d reports ]]; then
    warn "reports directory not found"
    return 0
  fi
  tar -czf "$archive" reports
  success "Created backup: $archive"
}

clean_runtime() {
  rm -rf "$RUN_DIR"
  mkdir -p "$RUN_DIR"
  success "Runtime state cleaned"
}

print_help() {
  cat <<'EOF'
Usage: bash scripts/manage.sh <command> [args]

Commands:
  install               Install dependencies
  env-tavily            Copy Tavily + YouTube sample env to .env
  env-serpapi           Copy SerpAPI sample env to .env
  check                 Run syntax checks
  start-local           Start local server in background
  stop-local            Stop local background server
  restart-local         Restart local background server
  status-local          Show local server status
  logs-local            Tail local server logs
  build-docker          Build Docker image
  start-docker          Start with Docker Compose
  stop-docker           Stop Docker Compose services
  restart-docker        Restart Docker Compose services
  status-docker         Show Docker Compose status
  logs-docker           Tail Docker Compose logs
  deploy                Pull latest code, build, start, and health-check
  update                Pull latest code and install dependencies
  push-code [message]   Git add, commit, and push to origin/main
  push-image            Build and push Docker image from docker-compose
  health [url]          Check /api/health
  open [url]            Open the application in browser
  research [topic]      Run CLI research workflow
  backup-reports        Create tar.gz backup of reports/
  clean                 Remove runtime PID state
  menu                  Open interactive management menu
  help                  Show this help
EOF
}

interactive_menu() {
  while true; do
    printf "\n"
    bold "🧭 pilangfuse management console"
    printf "1) Install dependencies\n"
    printf "2) Use Tavily + YouTube env profile\n"
    printf "3) Use SerpAPI env profile\n"
    printf "4) Run syntax check\n"
    printf "5) Start local server\n"
    printf "6) Stop local server\n"
    printf "7) View local status\n"
    printf "8) View local logs\n"
    printf "9) Build Docker image\n"
    printf "10) Start Docker deployment\n"
    printf "11) Stop Docker deployment\n"
    printf "12) View Docker status\n"
    printf "13) View Docker logs\n"
    printf "14) Deploy latest version\n"
    printf "15) Update repository + dependencies\n"
    printf "16) Push code to GitHub\n"
    printf "17) Push Docker image\n"
    printf "18) Health check\n"
    printf "19) Open UI\n"
    printf "20) Run research from CLI\n"
    printf "21) Backup reports\n"
    printf "22) Clean runtime state\n"
    printf "0) Exit\n"
    read -r -p "Select an option: " choice

    case "$choice" in
      1) install_app ;;
      2) copy_env_tavily ;;
      3) copy_env_serpapi ;;
      4) syntax_check ;;
      5) start_local ;;
      6) stop_local ;;
      7) status_local ;;
      8) logs_local ;;
      9) build_docker ;;
      10) start_docker ;;
      11) stop_docker ;;
      12) status_docker ;;
      13) logs_docker ;;
      14) deploy_app ;;
      15) update_app ;;
      16) push_code ;;
      17) push_docker_image ;;
      18) health_check ;;
      19) open_ui ;;
      20) run_research ;;
      21) backup_reports ;;
      22) clean_runtime ;;
      0) exit 0 ;;
      *) warn "Invalid option" ;;
    esac
  done
}

command="${1:-menu}"
shift || true

case "$command" in
  install) install_app ;;
  env-tavily) copy_env_tavily ;;
  env-serpapi) copy_env_serpapi ;;
  check) syntax_check ;;
  start-local) start_local ;;
  stop-local) stop_local ;;
  restart-local) restart_local ;;
  status-local) status_local ;;
  logs-local) logs_local ;;
  build-docker) build_docker ;;
  start-docker) start_docker ;;
  stop-docker) stop_docker ;;
  restart-docker) restart_docker ;;
  status-docker) status_docker ;;
  logs-docker) logs_docker ;;
  deploy) deploy_app ;;
  update) update_app ;;
  push-code) push_code "$@" ;;
  push-image) push_docker_image ;;
  health) health_check "$@" ;;
  open) open_ui "$@" ;;
  research) run_research "$@" ;;
  backup-reports) backup_reports ;;
  clean) clean_runtime ;;
  menu) interactive_menu ;;
  help|--help|-h) print_help ;;
  *)
    error "Unknown command: $command"
    print_help
    exit 1
    ;;
esac
