#!/usr/bin/env bash
set -euo pipefail

APP_NAME="pilangfuse"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$ROOT_DIR/logs"
RUN_DIR="$ROOT_DIR/.run"
PID_FILE="$RUN_DIR/server.pid"
DOCKER_PORT_FILE="$RUN_DIR/docker-host-port"
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

serialize_env_value() {
  local value="${1-}"

  if [[ -z "$value" ]]; then
    printf ""
  elif [[ "$value" =~ ^[A-Za-z0-9_./:@-]+$ ]]; then
    printf '%s' "$value"
  else
    value="${value//\\/\\\\}"
    value="${value//\"/\\\"}"
    value="${value//$'\n'/\\n}"
    value="${value//$'\r'/\\r}"
    printf '"%s"' "$value"
  fi
}

is_port_available() {
  local port="${1:?port is required}"

  if command -v python3 >/dev/null 2>&1; then
    python3 - "$port" <<'PY'
import socket, sys
port = int(sys.argv[1])
sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
try:
    sock.bind(("0.0.0.0", port))
except OSError:
    raise SystemExit(1)
finally:
    sock.close()
PY
    return
  fi

  if command -v python >/dev/null 2>&1; then
    python - "$port" <<'PY'
import socket, sys
port = int(sys.argv[1])
sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
try:
    sock.bind(("0.0.0.0", port))
except OSError:
    raise SystemExit(1)
finally:
    sock.close()
PY
    return
  fi

  if command -v ss >/dev/null 2>&1; then
    ! ss -ltn "sport = :$port" | tail -n +2 | grep -q "."
    return
  fi

  if command -v lsof >/dev/null 2>&1; then
    ! lsof -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1
    return
  fi

  error "Cannot check port availability: install python3, ss, or lsof"
  exit 1
}

find_available_port() {
  local start_port="${1:-3000}"
  local port="$start_port"

  while ! is_port_available "$port"; do
    port=$((port + 1))
  done

  printf '%s' "$port"
}

get_running_docker_host_port() {
  if ! command -v docker >/dev/null 2>&1; then
    return 1
  fi

  if ! docker ps --format '{{.Names}}' | grep -qx "$APP_NAME"; then
    return 1
  fi

  docker port "$APP_NAME" 3000/tcp 2>/dev/null | head -n 1 | awk -F: '{print $NF}'
}

get_docker_url() {
  local port=""

  if [[ -f "$DOCKER_PORT_FILE" ]]; then
    port="$(cat "$DOCKER_PORT_FILE")"
  else
    port="$(get_running_docker_host_port || true)"
  fi

  port="${port:-3000}"
  printf 'http://localhost:%s' "$port"
}

get_default_app_url() {
  if [[ -f "$DOCKER_PORT_FILE" ]] || [[ -n "$(get_running_docker_host_port || true)" ]]; then
    get_docker_url
  else
    printf '%s' "$DEFAULT_URL"
  fi
}

resolve_docker_host_port() {
  ensure_env
  load_env_file

  local running_port=""
  running_port="$(get_running_docker_host_port || true)"
  if [[ -n "$running_port" ]]; then
    printf '%s' "$running_port" > "$DOCKER_PORT_FILE"
    printf '%s' "$running_port"
    return 0
  fi

  local preferred_port="${HOST_PORT:-${PORT:-3000}}"
  local host_port="$preferred_port"

  if ! is_port_available "$host_port"; then
    host_port="$(find_available_port "$host_port")"
    warn "Host port ${preferred_port} is busy. Using available port ${host_port} for Docker deployment."
  fi

  printf '%s' "$host_port" > "$DOCKER_PORT_FILE"
  printf '%s' "$host_port"
}

detect_langfuse_region() {
  local base_url="${1:-}"
  case "$base_url" in
    https://cloud.langfuse.com) printf 'eu' ;;
    https://us.cloud.langfuse.com) printf 'us' ;;
    https://jp.cloud.langfuse.com) printf 'jp' ;;
    https://hipaa.cloud.langfuse.com) printf 'hipaa' ;;
    *) printf 'custom' ;;
  esac
}

verify_langfuse_region() {
  ensure_env
  load_env_file

  local expected_region="${1:-}"
  local base_url="${LANGFUSE_BASE_URL:-https://cloud.langfuse.com}"
  local detected_region
  detected_region="$(detect_langfuse_region "$base_url")"

  step "Checking Langfuse base URL"
  info "LANGFUSE_BASE_URL=$base_url"
  info "Detected region: $detected_region"

  if [[ -z "${LANGFUSE_PUBLIC_KEY:-}" || -z "${LANGFUSE_SECRET_KEY:-}" ]]; then
    warn "Langfuse keys are not fully configured in .env"
  else
    success "Langfuse keys are present in .env"
  fi

  if [[ "$detected_region" == "custom" ]]; then
    warn "Base URL does not match a known managed Langfuse region"
    info "Known regions: eu=https://cloud.langfuse.com us=https://us.cloud.langfuse.com jp=https://jp.cloud.langfuse.com hipaa=https://hipaa.cloud.langfuse.com"
  fi

  if [[ -n "$expected_region" ]]; then
    case "$expected_region" in
      eu|us|jp|hipaa|custom) ;;
      *)
        error "Unsupported Langfuse region: $expected_region"
        info "Supported regions: eu, us, jp, hipaa, custom"
        exit 1
        ;;
    esac

    if [[ "$detected_region" == "$expected_region" ]]; then
      success "LANGFUSE_BASE_URL matches expected region: $expected_region"
    else
      error "LANGFUSE_BASE_URL region mismatch. Expected '$expected_region' but detected '$detected_region'"
      exit 1
    fi
  fi
}

langfuse_test() {
  local url="${1:-$(get_default_app_url)}/api/settings/langfuse/test"
  step "Calling Langfuse test endpoint: $url"

  if ! command -v curl >/dev/null 2>&1; then
    error "curl is required for langfuse-test"
    exit 1
  fi

  local response
  response="$(curl -fsS -X POST "$url")"
  printf '%s\n' "$response"
  success "Langfuse test endpoint completed"
}

download_env_docker() {
  local container_name="${1:-$APP_NAME}"
  local output_file="${2:-.env.from-docker}"

  if ! command -v docker >/dev/null 2>&1; then
    error "Docker CLI is not installed"
    exit 1
  fi

  if ! docker ps --format '{{.Names}}' | grep -qx "$container_name"; then
    error "Container '$container_name' is not running"
    info "Tip: start Docker first with 'bash scripts/manage.sh start-docker'"
    exit 1
  fi

  if [[ ! -f .env.example ]]; then
    error ".env.example not found"
    exit 1
  fi

  local -a env_keys=()
  mapfile -t env_keys < <(awk -F= '/^[A-Z0-9_]+=/{print $1}' .env.example)

  if [[ ${#env_keys[@]} -eq 0 ]]; then
    error "No environment keys found in .env.example"
    exit 1
  fi

  step "Downloading environment values from Docker container: $container_name"
  : > "$output_file"

  local key value
  for key in "${env_keys[@]}"; do
    value="$(docker exec "$container_name" /bin/sh -lc "printenv '$key' || true" | tr -d '\r')"
    printf '%s=%s\n' "$key" "$(serialize_env_value "$value")" >> "$output_file"
  done

  success "Saved container environment to $output_file"
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

delete_docker_image() {
  ensure_env
  load_env_file

  local image_name="${DOCKER_IMAGE_NAME:-}"
  local image_tag="${DOCKER_IMAGE_TAG:-latest}"
  local image_id=""
  local force="true"
  local auto_yes="false"

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --name)
        image_name="${2:-}"
        shift 2
        ;;
      --tag)
        image_tag="${2:-latest}"
        shift 2
        ;;
      --id)
        image_id="${2:-}"
        shift 2
        ;;
      --force)
        force="true"
        shift
        ;;
      --no-force)
        force="false"
        shift
        ;;
      -y|--yes)
        auto_yes="true"
        shift
        ;;
      *)
        error "Unknown delete-image option: $1"
        info "Usage: bash scripts/manage.sh delete-image [--name <image>] [--tag <tag>] [--id <image-id>] [--force|--no-force] [-y|--yes]"
        exit 1
        ;;
    esac
  done

  if ! command -v docker >/dev/null 2>&1; then
    error "Docker CLI is not installed"
    exit 1
  fi

  local target=""
  if [[ -n "$image_id" ]]; then
    target="$image_id"
  elif [[ -n "$image_name" ]]; then
    target="${image_name}:${image_tag}"
  else
    error "No Docker image target provided"
    info "Use --id <image-id> or set DOCKER_IMAGE_NAME / pass --name"
    exit 1
  fi

  if ! docker image inspect "$target" >/dev/null 2>&1; then
    error "Docker image not found: $target"
    exit 1
  fi

  if [[ "$auto_yes" != "true" ]]; then
    local answer
    read -r -p "Delete Docker image '$target'? [y/N]: " answer
    case "$answer" in
      y|Y|yes|YES) ;;
      *)
        warn "Deletion cancelled"
        return 0
        ;;
    esac
  fi

  local -a cmd=(docker image rm)
  if [[ "$force" == "true" ]]; then
    cmd+=(--force)
  fi
  cmd+=("$target")

  step "Deleting Docker image: $target"
  "${cmd[@]}"
  success "Docker image deleted: $target"
}

start_docker() {
  ensure_env
  local dc
  local host_port
  dc="$(compose_cmd)"
  host_port="$(resolve_docker_host_port)"
  step "Starting application with Docker Compose on host port ${host_port}"
  HOST_PORT="$host_port" $dc up -d --build
  success "Docker services started at $(get_docker_url)"
}

stop_docker() {
  local dc
  local host_port="${HOST_PORT:-}"
  dc="$(compose_cmd)"
  if [[ -f "$DOCKER_PORT_FILE" ]]; then
    host_port="$(cat "$DOCKER_PORT_FILE")"
  fi
  step "Stopping Docker services"
  HOST_PORT="$host_port" $dc down
  rm -f "$DOCKER_PORT_FILE"
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
  local url="${1:-$(get_default_app_url)}/api/health"
  step "Checking health: $url"
  if command -v curl >/dev/null 2>&1; then
    curl -fsS "$url" && printf "\n"
    success "Health check passed"
  else
    warn "curl not available. Open $url manually"
  fi
}

open_ui() {
  local url="${1:-$(get_default_app_url)}"
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
  health_check "$(get_docker_url)"
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
  delete-image          Delete a Docker image by env config, image name/tag, or image id
  langfuse-region       Verify LANGFUSE_BASE_URL against a known region
  langfuse-test         Call the app's Langfuse test endpoint
  download-env-docker   Download app env values from a running Docker container
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
    printf "18) Delete Docker image\n"
    printf "19) Verify Langfuse region\n"
    printf "20) Run Langfuse test endpoint\n"
    printf "21) Download env from Docker container\n"
    printf "22) Health check\n"
    printf "23) Open UI\n"
    printf "24) Run research from CLI\n"
    printf "25) Backup reports\n"
    printf "26) Clean runtime state\n"
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
      18) delete_docker_image ;;
      19) verify_langfuse_region ;;
      20) langfuse_test ;;
      21) download_env_docker ;;
      22) health_check ;;
      23) open_ui ;;
      24) run_research ;;
      25) backup_reports ;;
      26) clean_runtime ;;
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
  delete-image) delete_docker_image "$@" ;;
  langfuse-region) verify_langfuse_region "$@" ;;
  langfuse-test) langfuse_test "$@" ;;
  download-env-docker) download_env_docker "$@" ;;
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
