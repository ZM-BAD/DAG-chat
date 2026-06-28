#!/bin/bash

# Startup script for launching DAG-chat frontend and backend services

# Load root .env if available
[ -f .env ] && set -a && source .env && set +a 2>/dev/null

# Cleanup handler
cleanup() {
    echo -e "\nStopping services..."
    if [ ! -z "$BACKEND_PID" ]; then
        kill $BACKEND_PID 2>/dev/null
        echo "Backend service stopped"
    fi
    if [ ! -z "$FRONTEND_PID" ]; then
        kill $FRONTEND_PID 2>/dev/null
        echo "Frontend service stopped"
    fi
    exit 0
}

# Register signal handlers
trap cleanup SIGINT SIGTERM

# Function: stop all services
stop_services() {
    echo "Finding and stopping DAG-chat services..."

    # Find and stop frontend service (port 3000)
    FRONTEND_PID=$(lsof -ti:3000 2>/dev/null)
    if [ ! -z "$FRONTEND_PID" ]; then
        echo "Found frontend service (PID: $FRONTEND_PID), stopping..."
        kill -TERM $FRONTEND_PID 2>/dev/null
        sleep 2
        # Force kill if still running
        if kill -0 $FRONTEND_PID 2>/dev/null; then
            kill -KILL $FRONTEND_PID 2>/dev/null
            echo "Force stopped frontend service"
        else
            echo "Frontend service stopped"
        fi
    else
        echo "No running frontend service found (port 3000)"
    fi

    # Find and stop backend service (port 8000)
    BACKEND_PID=$(lsof -ti:8000 2>/dev/null)
    if [ ! -z "$BACKEND_PID" ]; then
        echo "Found backend service (PID: $BACKEND_PID), stopping..."
        kill -TERM $BACKEND_PID 2>/dev/null
        sleep 2
        # Force kill if still running
        if kill -0 $BACKEND_PID 2>/dev/null; then
            kill -KILL $BACKEND_PID 2>/dev/null
            echo "Force stopped backend service"
        else
            echo "Backend service stopped"
        fi
    else
        echo "No running backend service found (port 8000)"
    fi

    # Additional check: find possible related Node.js and Python processes
    echo "Checking for other DAG-chat processes..."

    # Find possible npm dev or start processes
    NPM_PIDS=$(pgrep -f "npm.*(dev|start)" 2>/dev/null)
    if [ ! -z "$NPM_PIDS" ]; then
        echo "Found npm processes: $NPM_PIDS"
        echo "$NPM_PIDS" | xargs kill -TERM 2>/dev/null
        sleep 1
    fi

    # Find possible Python API processes
    PYTHON_PIDS=$(pgrep -f "python.*run_api.py" 2>/dev/null)
    if [ ! -z "$PYTHON_PIDS" ]; then
        echo "Found Python API processes: $PYTHON_PIDS"
        echo "$PYTHON_PIDS" | xargs kill -TERM 2>/dev/null
        sleep 1
    fi

    echo "All DAG-chat services stopped!"
}

# Function: display help information
display_help() {
    echo "Usage: $0 [option]"
    echo "Options:"
    echo "  --frontend     Start frontend only"
    echo "  --backend      Start backend only"
    echo "  --all          Start both frontend and backend"
    echo "  --stop         Stop all DAG-chat services"
    echo "  --help         Display help information"
    echo ""
    echo "Examples:"
    echo "  $0 --frontend  # Start frontend (default port 3000)"
    echo "  $0 --backend   # Start backend (default port 8000)"
    echo "  $0 --all       # Start both frontend and backend"
    echo "  $0 --stop      # Stop all related services"
}

# Function: start frontend
start_frontend() {
    echo "Starting frontend service..."
    cd frontend || { echo "ERROR: frontend/ not found" >&2; return 1; }

    # Reinstall only when dependencies actually changed. Content-hash package.json
    # + package-lock.json (+ .npmrc if present) into a stamp so ANY change (manual
    # edit, npm install, git pull, registry/auth config) is detected — mtime alone
    # can miss a package.json edit that didn't regenerate the lockfile and is
    # fooled by touch/cp -p. Uses `npm ci` (never rewrites package-lock.json).
    # The stamp is written ONLY after `npm ci` succeeds, so a failed install never
    # poisons the cache or silently starts the dev server with stale deps.
    # SHA-256 tool: shasum (macOS) / sha256sum (Linux).
    if command -v shasum >/dev/null 2>&1; then HASH=(shasum -a 256)
    elif command -v sha256sum >/dev/null 2>&1; then HASH=(sha256sum)
    else echo "ERROR: no sha256 tool found (need shasum or sha256sum)" >&2; cd ..; return 1; fi

    [ -f package.json ] && [ -f package-lock.json ] || {
        echo "ERROR: missing package.json or package-lock.json" >&2; cd ..; return 1; }

    NEW_HASH=$(cat package.json package-lock.json .npmrc 2>/dev/null | "${HASH[@]}" | awk '{print $1}')
    [ -n "$NEW_HASH" ] || { echo "ERROR: failed to compute dependency hash" >&2; cd ..; return 1; }
    OLD_HASH=$(cat node_modules/.install-hash 2>/dev/null)

    # Reinstall if: no node_modules, OR deps changed (hash mismatch), OR the tree
    # looks incomplete (sentinel package missing — catches manual corruption).
    if [ ! -d node_modules ] || [ "$NEW_HASH" != "$OLD_HASH" ] || [ ! -d node_modules/vite ]; then
        echo "Installing frontend dependencies (npm ci)..."
        if ! npm ci --legacy-peer-deps; then
            echo "ERROR: npm ci failed; not updating install stamp, not starting dev server." >&2
            cd ..; return 1
        fi
        echo "$NEW_HASH" > node_modules/.install-hash
    else
        echo "Frontend dependencies up to date, skipping install."
    fi
    echo "Starting frontend dev server..."
    echo "Frontend will run on http://localhost:3000"
    npm run dev &
    FRONTEND_PID=$!
    cd ..

    # Wait for frontend service to start
    echo "Waiting for frontend service to start..."
    for i in {1..60}; do
        if curl -s -f http://localhost:3000 > /dev/null 2>&1; then
            echo "Frontend service started!"
            # Check if a browser already has this port open
            if ! lsof -ti:3000 -c chrome -c safari -c firefox > /dev/null 2>&1; then
                # If no browser is open, open one automatically
                echo "Opening browser..."
                if [[ "$OSTYPE" == "darwin"* ]]; then
                    # macOS
                    open http://localhost:3000
                elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
                    # Linux
                    xdg-open http://localhost:3000 > /dev/null 2>&1
                fi
            fi
            return 0
        fi
        echo -n "."
        sleep 1
    done

    echo "Frontend service startup timed out!"
    return 1
}

# Function: start backend
start_backend() {
    echo "Starting backend service..."
    cd backend
    echo "Installing Python dependencies..."
    # Check if in a virtual environment, activate if not
    if [ -z "$VIRTUAL_ENV" ] && [ -d "../.venv" ]; then
        echo "Activating virtual environment..."
        source ../.venv/bin/activate
    fi
    pip install -r requirements.txt
    echo "Starting backend server..."
    echo "Backend will run on http://localhost:8000"
    python3 run_api.py &
    BACKEND_PID=$!
    cd ..

    # Wait for backend service to start
    echo "Waiting for backend service to start..."
    for i in {1..60}; do  # 60 second timeout
        if curl -s -f http://localhost:8000/health > /dev/null 2>&1; then
            echo ""
            echo "Backend service started!"
            # Wait an extra 5 seconds to ensure database connection is ready
            echo "Waiting for database connection to stabilize..."
            sleep 5

            # Test database connection
            echo "Testing database connection..."
            if curl -s -f "http://localhost:8000/api/v1/dialogue/list?user_id=${DEFAULT_USER_ID:-default-user}&page=1&page_size=1" > /dev/null 2>&1; then
                echo "Database connection is ready!"
                return 0
            else
                echo "Database connection not ready yet, continuing to wait..."
            fi
        fi
        if [ $((i % 10)) -eq 0 ]; then
            echo ""  # Newline every 10 seconds
        fi
        echo -n "."
        sleep 1
    done

    echo "Backend service startup timed out!"
    return 1
}

# Check arguments
if [ $# -eq 0 ]; then
    display_help
    exit 1
fi

# Process arguments
case "$1" in
    --frontend)
        start_frontend
        ;;
    --backend)
        start_backend
        ;;
    --all)
        # Start backend service
        if ! start_backend; then
            echo "Backend service failed to start, cleaning up..."
            if [ ! -z "$BACKEND_PID" ]; then
                kill $BACKEND_PID 2>/dev/null
            fi
            exit 1
        fi

        # Start frontend service
        if ! start_frontend; then
            echo "Frontend service failed to start, cleaning up..."
            if [ ! -z "$FRONTEND_PID" ]; then
                kill $FRONTEND_PID 2>/dev/null
            fi
            if [ ! -z "$BACKEND_PID" ]; then
                kill $BACKEND_PID 2>/dev/null
            fi
            exit 1
        fi

        echo -e "\nFrontend and backend services are running!"
        echo "Frontend: http://localhost:3000"
        echo "Backend: http://localhost:8000"
        echo -e "\nPress Ctrl+C to stop all services"
        wait  # Wait for all background tasks
        ;;
    --stop)
        stop_services
        ;;
    --help)
        display_help
        ;;
    *)
        echo "Error: Unknown option $1"
        display_help
        exit 1
        ;;
esac
