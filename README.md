# pilangfuse

[![CI](https://github.com/lalitnayyar/pilangfuse/actions/workflows/ci.yml/badge.svg)](https://github.com/lalitnayyar/pilangfuse/actions/workflows/ci.yml)
![Node 22+](https://img.shields.io/badge/node-22%2B-3C873A)
![Docker Ready](https://img.shields.io/badge/docker-ready-2496ED)
![Langfuse Tracing](https://img.shields.io/badge/langfuse-tracing-6C47FF)

A modular **3-agent research system** that collects web sources, YouTube videos, and generates a polished shareable markdown brief for any topic — with **Langfuse tracing**, **retry/fallback logic**, **live progress activity**, **API endpoints**, **browser UI**, and **Docker support**.

---

## Overview

`pilangfuse` orchestrates three specialized agents:

- **Agent 1 · 🌐 Web Research Agent**
  - collects **5 relevant web URLs** for a given topic
- **Agent 2 · 🎥 Video Research Agent**
  - collects **5 relevant YouTube videos** for the same topic
- **Agent 3 · 📝 Report Writer Agent**
  - compiles the findings into a **shareable markdown file** named:
    - `<topic>-<datetime>.md`

Every step can be traced with **Langfuse**, and progress is shown in a professional emoji-rich activity stream in both **CLI** and **Web UI**.

---

## Table of Contents

- [Core Functionality](#core-functionality)
- [Key Features](#key-features)
- [Architecture](#architecture)
- [Visual Flow](#visual-flow)
- [Mermaid Flowcharts](#mermaid-flowcharts)
- [UI Preview Placeholders](#ui-preview-placeholders)
- [Project Structure](#project-structure)
- [How the Agents Work](#how-the-agents-work)
- [Provider Support](#provider-support)
- [Langfuse Tracing](#langfuse-tracing)
- [Progress Activity Format](#progress-activity-format)
- [Installation](#installation)
- [Environment Variables](#environment-variables)
- [Sample Environment Profiles](#sample-environment-profiles)
- [Usage Guide](#usage-guide)
  - [CLI Usage](#cli-usage)
  - [Web UI Usage](#web-ui-usage)
  - [API Usage](#api-usage)
- [Management Script](#management-script)
- [GitHub Actions CI](#github-actions-ci)
- [Docker Setup](#docker-setup)
- [Output Format](#output-format)
- [Error Handling and Retries](#error-handling-and-retries)
- [Customization Guide](#customization-guide)
- [Example End-to-End Flow](#example-end-to-end-flow)
- [Future Enhancements](#future-enhancements)

---

## Core Functionality

Given a topic such as:

```text
AI agents for software engineering
```

the system will:

1. start a workflow trace
2. run **Agent 1** and **Agent 2** in parallel
3. collect:
   - 5 web resources
   - 5 YouTube videos
4. pass both result sets to **Agent 3**
5. generate a markdown report
6. save the report under `reports/`
7. expose status updates in:
   - terminal logs
   - web UI live activity stream
   - API job events endpoint

---

## Key Features

### 1. Multi-agent workflow
- separate research responsibilities by agent
- better modularity and maintainability
- easier provider replacement and extension

### 2. Langfuse integration
- top-level workflow trace
- per-agent spans
- trace metadata includes runtime context when available

### 3. Live progress activity
- eye-catching professional event feed
- clear emoji-based step labels
- suitable for demos, internal tools, and user-facing workflows

### 4. Retry + timeout support
- automatic retries for transient HTTP issues
- request timeout handling
- clearer operational resilience

### 5. Provider fallback
- switch search providers through env config
- fallback to alternate provider when available

### 6. Optional LLM-enhanced report generation
- use OpenAI to make the markdown more polished
- graceful fallback to deterministic markdown if unavailable or if generation fails

### 7. API + Browser UI
- can be used as a script, service, or internal research dashboard
- includes an in-app settings modal to edit `.env` values without leaving the UI
- API keys are masked in the browser form, with show/hide toggles when you need to reveal them
- includes copy-to-clipboard controls for environment values
- includes a copy-visible-settings-as-env-block action
- includes search/filter inside the settings modal
- includes `.env` export and import actions directly in the UI
- includes a Langfuse connection test button in the settings modal
- includes a health-debug download action backed by `/api/health`
- includes a reset-to-defaults action for managed settings
- includes a Docker image list, selection dropdown, refresh action, and delete action from the UI

### 8. Docker-ready deployment
- includes `Dockerfile`
- includes `docker-compose.yml`
- easy local or server deployment

### 9. Operations management script
- interactive terminal menu for common operations
- one-command deploy, update, start, stop, logs, status, and health checks
- supports both local mode and Docker mode

### 10. GitHub Actions CI
- automated dependency install on push and pull request
- syntax validation for project JavaScript files
- visible CI badge on the repository homepage

---

## Architecture

The application is split into layers:

### Agents
Responsible for business behavior:
- `webAgent.js`
- `videoAgent.js`
- `reportAgent.js`

### Providers
Responsible for external search integrations:
- `webSearch.js`
- `videoSearch.js`

### Workflow
Responsible for orchestration:
- `runResearch.js`

### Shared libraries
Responsible for config, tracing, retries, logging, and utilities:
- `config.js`
- `http.js`
- `logger.js`
- `langfuse.js`
- `errors.js`
- `utils.js`

### Delivery layers
- `src/index.js` → CLI entry point
- `src/server.js` → API + browser UI host

---

## Visual Flow

### High-level workflow

```text
             ┌──────────────────────────────┐
             │ User provides a topic        │
             │ CLI / API / Web UI           │
             └──────────────┬───────────────┘
                            │
                            ▼
             ┌──────────────────────────────┐
             │ Orchestrator starts workflow │
             │ Langfuse trace created       │
             └──────────────┬───────────────┘
                            │
              ┌─────────────┴─────────────┐
              │                           │
              ▼                           ▼
┌─────────────────────────┐   ┌─────────────────────────┐
│ Agent 1 🌐 Web Research │   │ Agent 2 🎥 Video Search │
│ Collect 5 web URLs      │   │ Collect 5 YouTube links │
└─────────────┬───────────┘   └─────────────┬───────────┘
              │                             │
              └─────────────┬──────────────┘
                            ▼
             ┌──────────────────────────────┐
             │ Agent 3 📝 Report Writer     │
             │ Build markdown brief         │
             │ Save <topic>-<datetime>.md   │
             └──────────────┬───────────────┘
                            │
                            ▼
             ┌──────────────────────────────┐
             │ Result exposed to user       │
             │ CLI / UI / API / file output │
             └──────────────────────────────┘
```

### Detailed execution sequence

```text
User Topic
   │
   ├── 🚀 Orchestrator starts workflow
   ├── 🧬 Langfuse trace opens
   ├── 🌐 Agent 1 starts web search
   │     ├── try primary provider
   │     ├── retry on transient failures
   │     └── fallback provider if enabled
   ├── 🎥 Agent 2 starts video search
   │     ├── try primary provider
   │     ├── retry on transient failures
   │     └── fallback provider if enabled
   ├── 🔗 Results merged
   ├── 📝 Agent 3 writes report
   │     ├── 🤖 optional OpenAI enhancement
   │     └── 🧾 fallback deterministic formatter
   ├── ✅ report saved
   └── 🎉 workflow completed
```

---

## Mermaid Flowcharts

> GitHub renders Mermaid diagrams directly. If your markdown viewer supports Mermaid, the diagrams below will appear as flowcharts.

### 1. End-to-end workflow

```mermaid
flowchart TD
    A[User enters topic] --> B[🚀 Orchestrator starts workflow]
    B --> C[🧬 Create Langfuse trace]
    C --> D[🌐 Agent 1: Web research]
    C --> E[🎥 Agent 2: Video research]
    D --> F[🔗 Merge web + video results]
    E --> F
    F --> G[📝 Agent 3: Build markdown report]
    G --> H[💾 Save report to reports/<topic>-<datetime>.md]
    H --> I[🎉 Return output to CLI / API / UI]
```

### 2. Provider + retry behavior

```mermaid
flowchart TD
    A[Start provider request] --> B{Credentials available?}
    B -- No --> C{Fallback enabled and available?}
    B -- Yes --> D[Call primary provider]
    D --> E{Success?}
    E -- Yes --> F[Normalize results]
    E -- No --> G{Retryable error?}
    G -- Yes --> H[Retry with backoff]
    H --> D
    G -- No --> C
    C -- Yes --> I[Switch to fallback provider]
    I --> J[Call fallback provider]
    J --> K{Success?}
    K -- Yes --> F
    K -- No --> L[Return structured error]
    C -- No --> L
```

### 3. Live UI activity flow

```mermaid
sequenceDiagram
    participant User
    participant UI as Web UI
    participant API as Express API
    participant WF as Workflow
    participant LF as Langfuse

    User->>UI: Enter topic + click Run Agents
    UI->>API: POST /api/research
    API->>WF: start job
    WF->>LF: create trace + spans
    WF-->>API: progress events
    API-->>UI: SSE activity stream
    WF->>API: final result
    API-->>UI: job completed payload
    UI-->>User: show report link + collected sources
```

---

## UI Preview Placeholders

Until you capture real screenshots or GIFs, the README uses placeholder UI assets.

### Dashboard placeholder

![Topic Research Studio dashboard placeholder](docs/assets/ui-dashboard-placeholder.svg)

### Live activity placeholder

![Live activity timeline placeholder](docs/assets/ui-live-activity-placeholder.svg)

### Report output placeholder

![Report output placeholder](docs/assets/ui-report-output-placeholder.svg)

### Recommended replacements

After running the app, replace the placeholders with actual assets such as:

- `docs/assets/ui-dashboard.png`
- `docs/assets/ui-live-demo.gif`
- `docs/assets/ui-report-output.png`

A helper note is included in:

```text
docs/assets/README.md
```

---

## Project Structure

```text
src/
  agents/
    reportAgent.js
    videoAgent.js
    webAgent.js
  lib/
    config.js
    errors.js
    http.js
    langfuse.js
    logger.js
    utils.js
  providers/
    videoSearch.js
    webSearch.js
  workflow/
    runResearch.js
  index.js
  server.js
public/
  index.html
  app.js
  styles.css
docs/
  assets/
    ui-dashboard-placeholder.svg
    ui-live-activity-placeholder.svg
    ui-report-output-placeholder.svg
  DEPLOYMENT.md
env/
  .env.tavily-youtube.example
  .env.serpapi.example
scripts/
  check-syntax.mjs
  manage.sh
.github/
  workflows/
    ci.yml
reports/
Dockerfile
docker-compose.yml
.env.example
package.json
README.md
```

---

## How the Agents Work

## Agent 1 · 🌐 Web Research Agent

Purpose:
- search the web for the topic
- collect top 5 relevant URLs
- normalize output into a structured format

Output shape:

```json
{
  "index": 1,
  "title": "Example title",
  "url": "https://example.com",
  "brief": "Short summary",
  "score": 0.91,
  "source": "tavily"
}
```

Behavior:
- starts a Langfuse span
- emits progress updates
- uses configured provider
- retries on transient failure
- optionally falls back to alternate provider

---

## Agent 2 · 🎥 Video Research Agent

Purpose:
- search YouTube-related video content for the topic
- collect top 5 video links
- normalize results into a common format

Output shape:

```json
{
  "index": 1,
  "title": "Example video",
  "url": "https://www.youtube.com/watch?v=...",
  "brief": "Short summary",
  "channel": "Example channel",
  "publishedAt": "2026-08-03T09:00:00Z",
  "source": "youtube"
}
```

Behavior:
- starts a Langfuse span
- emits progress updates
- supports retries and fallback

---

## Agent 3 · 📝 Report Writer Agent

Purpose:
- combine web and video results
- create a readable markdown brief
- save it to disk using a timestamped filename

Features:
- deterministic markdown formatter by default
- optional OpenAI enhancement for a more polished shareable summary
- graceful fallback if OpenAI fails

Saved file example:

```text
reports/ai-agents-for-software-engineering-2026-08-03T10-15-00-000Z.md
```

---

## Provider Support

The system supports configurable providers.

### Web search providers
- `tavily`
- `serpapi`

### Video search providers
- `youtube`
- `serpapi`

### Example configuration

```env
WEB_SEARCH_PROVIDER=tavily
VIDEO_SEARCH_PROVIDER=youtube
ALLOW_PROVIDER_FALLBACK=true
```

### Fallback example
If `WEB_SEARCH_PROVIDER=tavily` fails and `SERPAPI_API_KEY` exists, the workflow can automatically switch to `serpapi`.

---

## Langfuse Tracing

Tracing is integrated at workflow and agent level using the current Langfuse JS stack:
- `@langfuse/tracing`
- `@langfuse/otel`
- `@langfuse/openai`
- `@opentelemetry/sdk-trace-node`
- `openai`

### Startup setup
At server startup the app registers a `LangfuseSpanProcessor` through `NodeTracerProvider` and exports traces in immediate mode so short-lived operations are less likely to be lost.

### Workflow trace
The application creates a top-level `topic-research-agents` observation for the whole research run.

### Agent spans
The following observations are generated:
- `agent1-web-search`
- `agent2-youtube-search`
- `agent3-report-writer`
- `openai-report-generation` when LLM enhancement is enabled

### Trace metadata
When available, metadata includes:
- app name
- provider
- model
- pi session id
- pi reasoning level
- Langfuse base URL
- recent workflow progress events
- latest workflow progress status

### Progress captured in traces
Each workflow now pushes recent progress information into the top-level trace metadata so Langfuse shows more execution context while the job is running.

Examples of trace-enriched progress information:
- tracing enabled / disabled state
- latest orchestrator step
- recent agent progress events
- flush status before buffered observations are sent to Langfuse
- settings-popup connectivity test traces created from the Langfuse test button

### OpenAI tracing
When `OPENAI_API_KEY` is configured, report generation uses the official OpenAI JS SDK wrapped with Langfuse's `observeOpenAI(...)` helper. This records model calls as Langfuse generations without changing application behavior.

### If Langfuse credentials are missing
The workflow still runs normally, but tracing is disabled.

---

## Progress Activity Format

The system emits professional step updates with emoji for easier readability.

### Example CLI progress

```text
10:12:01 | 🚀 Orchestrator   | START     | Research workflow started — Topic: AI agents for software engineering
10:12:01 | 🧭 Orchestrator   | RUNNING   | Agents dispatched — Running web and video research in parallel
10:12:01 | 🧬 Langfuse       | SUCCESS   | Tracing active — Base URL: https://cloud.langfuse.com
10:12:02 | 🌐 Agent 1        | RUNNING   | Searching the web — Tavily attempt 1/3
10:12:02 | 🎥 Agent 2        | RUNNING   | Searching YouTube — YouTube API attempt 1/3
10:12:05 | ✅ Agent 1        | SUCCESS   | Web research completed — 5 sources collected
10:12:06 | ✅ Agent 2        | SUCCESS   | Video research completed — 5 videos collected
10:12:07 | 🔗 Orchestrator   | RUNNING   | Research merged — Passing structured findings to report agent
10:12:08 | 📝 Agent 3        | RUNNING   | Report generation started — Building shareable markdown report
10:12:09 | ✅ Agent 3        | SUCCESS   | Report ready — ai-agents-for-software-engineering-2026-08-03T10-12-09-000Z.md
10:12:09 | 🎉 Orchestrator   | SUCCESS   | Workflow completed — /absolute/path/to/report.md
10:12:09 | 🪄 Langfuse       | RUNNING   | Flushing trace — Sending buffered observations to Langfuse
```

### Common emoji meanings
- `🚀` workflow start
- `🧭` orchestration
- `🧬` tracing
- `🪄` Langfuse flush
- `🌐` web research
- `🎥` video research
- `🔗` merge/hand-off
- `📝` report writing
- `🤖` LLM enhancement
- `🧾` deterministic formatting
- `⚠️` warning/fallback
- `✅` success
- `❌` failure
- `🎉` completed

---

## Installation

### Prerequisites
- Node.js 20+ recommended
- API keys for your chosen providers

### Install dependencies

```bash
npm install
```

### Create environment file

```bash
cp .env.example .env
```

---

## Environment Variables

Default example:

```env
# Output / server
OUTPUT_DIR=reports
PORT=3000

# Optional Docker image naming
DOCKER_IMAGE_NAME=
DOCKER_IMAGE_TAG=latest

# Providers
WEB_SEARCH_PROVIDER=tavily
VIDEO_SEARCH_PROVIDER=youtube
ALLOW_PROVIDER_FALLBACK=true

# Retry behavior
HTTP_RETRY_COUNT=3
HTTP_RETRY_DELAY_MS=1200
HTTP_TIMEOUT_MS=30000

# Provider keys
TAVILY_API_KEY=
YOUTUBE_API_KEY=
SERPAPI_API_KEY=

# Optional LLM summary
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini

# Langfuse
LANGFUSE_PUBLIC_KEY=
LANGFUSE_SECRET_KEY=
LANGFUSE_BASE_URL=https://cloud.langfuse.com
```

### Variable descriptions

| Variable | Purpose |
|---|---|
| `OUTPUT_DIR` | Directory where markdown reports are saved |
| `PORT` | API/UI server port |
| `DOCKER_IMAGE_NAME` | Docker image name used for push/delete actions |
| `DOCKER_IMAGE_TAG` | Docker image tag used for push/delete actions |
| `WEB_SEARCH_PROVIDER` | Web provider: `tavily` or `serpapi` |
| `VIDEO_SEARCH_PROVIDER` | Video provider: `youtube` or `serpapi` |
| `ALLOW_PROVIDER_FALLBACK` | Enables fallback to alternate provider |
| `HTTP_RETRY_COUNT` | Number of retry attempts |
| `HTTP_RETRY_DELAY_MS` | Base backoff delay between attempts |
| `HTTP_TIMEOUT_MS` | Timeout per request |
| `TAVILY_API_KEY` | Tavily API key |
| `YOUTUBE_API_KEY` | YouTube Data API key |
| `SERPAPI_API_KEY` | SerpAPI key |
| `OPENAI_API_KEY` | Optional OpenAI key for richer report generation |
| `OPENAI_MODEL` | LLM model name for report generation |
| `LANGFUSE_PUBLIC_KEY` | Langfuse public key |
| `LANGFUSE_SECRET_KEY` | Langfuse secret key |
| `LANGFUSE_BASE_URL` | Langfuse host URL |

---

## Sample Environment Profiles

Ready-to-copy sample profiles are included in:

```text
env/.env.tavily-youtube.example
env/.env.serpapi.example
```

### Profile 1 · Tavily + YouTube

Use when:
- you want Tavily for web search
- you want the YouTube Data API for video search
- you want provider fallback enabled

Copy example:

```bash
cp env/.env.tavily-youtube.example .env
```

### Profile 2 · SerpAPI for both

Use when:
- you want a single provider for web and video results
- you want simpler credential management
- you prefer no fallback path

Copy example:

```bash
cp env/.env.serpapi.example .env
```

---

## Usage Guide

## CLI Usage

Run the workflow from the terminal:

```bash
npm run research -- "AI agents for software engineering"
```

What happens:
1. workflow starts
2. web and video agents run in parallel
3. report is created
4. absolute file path is printed

Best for:
- automation scripts
- quick research runs
- terminal-first workflows

---

## Web UI Usage

Start the server:

```bash
npm start
```

Then open:

```text
http://localhost:3000
```

### UI flow
1. enter a topic
2. click **🚀 Run Agents**
3. watch live activity cards appear
4. view final collected links
5. open the generated markdown report
6. click **⚙️ Settings** anytime to open the in-app configuration modal
7. edit `.env` values directly in the app and save them back to disk
8. use **Show / Hide** on secret fields when you need to inspect an API key value
9. use **Reset to Defaults** to load default values into the form before saving
10. use **Copy** to copy any visible or hidden setting value to the clipboard
11. use the search box to filter settings by variable name, label, group, or description
12. export the current `.env` or import a replacement `.env` directly from the popup
13. optionally refresh the local Docker image list, select an image, and delete it from the same modal

The UI shows:
- current job status
- live event timeline
- final output summary
- direct link to the markdown file
- local browser download for the generated markdown using `<topic>-<datetime>.md`
- a popup settings modal for runtime configuration
- masked but editable API key fields with reveal toggles
- copy-to-clipboard controls
- copy-all-visible-settings as an env block
- search/filter controls
- `.env` export/import controls
- Langfuse test controls
- downloadable health/Langfuse debug info
- reset-to-defaults controls
- local Docker image selection before delete

### In-app settings modal

The browser UI now includes a dedicated popup for environment management.

What it does:
- loads the current `.env` values from the running app
- shows all managed environment variable names and editable values
- masks API keys in password-style inputs
- lets you reveal or hide secret values on demand
- lets you copy setting values directly to the clipboard
- lets you copy all currently visible settings as a single env block
- provides search/filter across the settings list
- provides export/import actions for `.env`
- provides a Langfuse connection test button
- provides a health-debug download action from `/api/health`
- provides a reset-to-defaults button for all managed settings
- saves changes back to `.env`
- updates live runtime configuration for future requests
- moves the app to the new port automatically if `PORT` changes
- lists local Docker images from the server machine
- lets you select a Docker image before deletion
- can still fall back to `DOCKER_IMAGE_NAME` + `DOCKER_IMAGE_TAG` from the form when no local image is selected

Notes:
- provider, retry, OpenAI, Langfuse, output directory, and Docker image settings are editable from the modal
- changing `PORT` redirects the browser to the new app port after save
- Docker image listing and deletion require the Docker CLI on the machine running the app server

Best for:
- demos
- teams
- stakeholder-friendly interaction
- visually tracking the workflow

---

## API Usage

### 1. Start a job

**Request**

```http
POST /api/research
Content-Type: application/json
```

Body:

```json
{
  "topic": "AI agents for software engineering"
}
```

**Response**

```json
{
  "jobId": "<uuid>",
  "status": "queued"
}
```

---

### 2. Get job state

**Request**

```http
GET /api/jobs/:jobId
```

**Response**

```json
{
  "id": "<uuid>",
  "topic": "AI agents for software engineering",
  "status": "completed",
  "createdAt": "2026-08-03T10:00:00.000Z",
  "updatedAt": "2026-08-03T10:00:09.000Z",
  "result": {
    "topic": "AI agents for software engineering",
    "webResults": [],
    "youtubeResults": [],
    "report": {
      "filePath": "/absolute/path/reports/...md",
      "reportUrl": "/reports/...md",
      "markdown": "..."
    }
  },
  "error": null,
  "events": []
}
```

---

### 3. Subscribe to live progress events

**Request**

```http
GET /api/jobs/:jobId/events
```

This endpoint uses **Server-Sent Events (SSE)** and streams job activity in real time.

---

### 4. Health check

```http
GET /api/health
```

Returns service health plus raw runtime/Langfuse debug information that can be downloaded from the settings modal as JSON. The response now also includes an automatic Langfuse region hint derived from `LANGFUSE_BASE_URL`.

### 5. Read app settings

```http
GET /api/settings
```

Returns the editable environment settings currently loaded by the app.

### 6. Test Langfuse connection

```http
POST /api/settings/langfuse/test
```

Creates a lightweight Langfuse test trace/span and flushes it so you can verify credentials and connectivity from the settings popup.

### 7. Save app settings

```http
PUT /api/settings
Content-Type: application/json
```

Body:

```json
{
  "settings": {
    "OPENAI_MODEL": "gpt-4.1-mini",
    "WEB_SEARCH_PROVIDER": "tavily"
  }
}
```

This updates `.env` and applies the new values to the running application.

### 8. Export current `.env`

```http
GET /api/settings/export
```

Downloads the current `.env` content from the application.

### 9. Import `.env`

```http
POST /api/settings/import
Content-Type: application/json
```

Body:

```json
{
  "content": "PORT=3000\nWEB_SEARCH_PROVIDER=tavily\n..."
}
```

This writes the provided `.env` content to disk and applies the managed settings to the running application.

### 10. List local Docker images

```http
GET /api/docker/images
```

Returns the local Docker images available on the server so the UI can show a selection dropdown before deletion.

### 11. Delete Docker image

```http
POST /api/docker/delete-image
Content-Type: application/json
```

Delete by selected local image id:

```json
{
  "imageId": "sha256:...",
  "force": true
}
```

Or delete by configured image name and tag:

```json
{
  "imageName": "ghcr.io/lalitnayyar/pilangfuse",
  "imageTag": "latest",
  "force": true
}
```

If `imageId`, `imageName`, and `imageTag` are omitted, the app falls back to `DOCKER_IMAGE_NAME` and `DOCKER_IMAGE_TAG` from `.env`.

---

## Management Script

A ready-to-use operations script is available at:

```bash
bash scripts/manage.sh menu
```

You can also run it through npm:

```bash
npm run manage
```

### What it can do

- install dependencies
- copy sample env profiles
- run syntax checks
- start, stop, restart local server
- tail local logs
- build, start, stop Docker deployment
- show Docker status and logs
- deploy latest version
- update repository + dependencies
- push code to GitHub
- push Docker image to a registry
- delete Docker images from the management script with options
- verify `LANGFUSE_BASE_URL` against a known Langfuse region
- call the app's Langfuse test endpoint from the terminal
- download the managed env values from a running Docker container
- run health checks
- open the UI in browser
- run research from CLI
- back up `reports/`
- clean runtime PID state

### Common commands

```bash
bash scripts/manage.sh install
bash scripts/manage.sh env-tavily
bash scripts/manage.sh start-local
bash scripts/manage.sh logs-local
bash scripts/manage.sh start-docker
bash scripts/manage.sh status-docker
bash scripts/manage.sh push-code "Update research workflow"
bash scripts/manage.sh push-image
bash scripts/manage.sh delete-image --name ghcr.io/lalitnayyar/pilangfuse --tag latest -y
bash scripts/manage.sh langfuse-region eu
bash scripts/manage.sh langfuse-test
bash scripts/manage.sh download-env-docker
bash scripts/manage.sh deploy
bash scripts/manage.sh health
bash scripts/manage.sh research "AI agents for software engineering"
```

### Interactive mode

If you run the script without a command, it opens an interactive console menu:

```bash
bash scripts/manage.sh
```

This is useful for everyday app administration and quick local operations.

---

## GitHub Actions CI

A CI workflow is included at:

```text
.github/workflows/ci.yml
```

### What CI does

On every push and pull request to `main`, GitHub Actions will:

1. check out the repository
2. set up Node.js 22
3. install dependencies with `npm install`
4. run `npm run check`

### Local equivalent

You can run the same validation locally:

```bash
npm run check
```

---

## Docker Setup

The project includes:

- `Dockerfile`
- `docker-compose.yml`
- `.dockerignore`

### Option A · Build and run with Docker

```bash
docker build -t pilangfuse .
docker run --rm -p 3000:3000 --env-file .env -v "$(pwd)/reports:/app/reports" pilangfuse
```

### Option B · Run with Docker Compose

```bash
docker compose up --build
```

Then open:

```text
http://localhost:3000
```

### Container behavior
- app runs on port `3000`
- reports are persisted to `./reports`
- health check calls `/api/health`
- image name can be configured with `DOCKER_IMAGE_NAME`
- image tag can be configured with `DOCKER_IMAGE_TAG`

### Recommended workflow

1. copy one of the sample env profiles
2. update keys
3. run with Docker Compose

Example:

```bash
cp env/.env.tavily-youtube.example .env
docker compose up --build
```

### Management shortcuts

Instead of remembering Docker commands manually, you can use:

```bash
bash scripts/manage.sh start-docker
bash scripts/manage.sh logs-docker
bash scripts/manage.sh stop-docker
```

### Delete a Docker image from the app

Open the browser UI, click **⚙️ Settings**, then use the **Danger Zone** section.

You can:
- refresh the local Docker image list
- select a local image from the dropdown before deleting it
- or leave the selector on the configured form image

Requirements:
- either select a local image from the list, or set `DOCKER_IMAGE_NAME`
- optionally set `DOCKER_IMAGE_TAG` (defaults to `latest`)
- Docker CLI must be available on the machine running the app server

This action removes the selected or configured local image directly through the application.

### Delete Docker image with `manage.sh`

You can delete a Docker image from the terminal using the configured `.env` values or explicit options.

Examples:

```bash
# use DOCKER_IMAGE_NAME + DOCKER_IMAGE_TAG from .env
bash scripts/manage.sh delete-image

# delete by image name + tag
bash scripts/manage.sh delete-image --name ghcr.io/lalitnayyar/pilangfuse --tag latest

# delete by image id
bash scripts/manage.sh delete-image --id sha256:abc123

# skip confirmation
bash scripts/manage.sh delete-image --name ghcr.io/lalitnayyar/pilangfuse --tag latest -y

# do not force deletion
bash scripts/manage.sh delete-image --name ghcr.io/lalitnayyar/pilangfuse --tag latest --no-force
```

Supported options:
- `--name <image>`
- `--tag <tag>`
- `--id <image-id>`
- `--force`
- `--no-force`
- `-y`, `--yes`

If `--id` is provided it takes precedence over `--name` and `--tag`.

### Run Langfuse test endpoint with `manage.sh`

You can trigger the app's Langfuse connectivity check from the terminal.

```bash
bash scripts/manage.sh langfuse-test
```

Optional custom base URL for the running app:

```bash
bash scripts/manage.sh langfuse-test http://localhost:3000
```

This calls:

```text
POST /api/settings/langfuse/test
```

### Verify Langfuse region with `manage.sh`

You can verify whether `LANGFUSE_BASE_URL` matches the expected managed Langfuse region.

Examples:

```bash
# inspect configured base URL and detected region
bash scripts/manage.sh langfuse-region

# require EU region
bash scripts/manage.sh langfuse-region eu

# require US region
bash scripts/manage.sh langfuse-region us
```

Supported region values:
- `eu`
- `us`
- `jp`
- `hipaa`
- `custom`

Known managed URLs:
- `eu` → `https://cloud.langfuse.com`
- `us` → `https://us.cloud.langfuse.com`
- `jp` → `https://jp.cloud.langfuse.com`
- `hipaa` → `https://hipaa.cloud.langfuse.com`

### Download `.env` from Docker container with `manage.sh`

If you want to reconstruct a local env file from a running Docker deployment, use:

```bash
bash scripts/manage.sh download-env-docker
```

Optional arguments:

```bash
bash scripts/manage.sh download-env-docker <container-name> <output-file>
```

Defaults:
- container name: `pilangfuse`
- output file: `.env.from-docker`

This reads the managed environment variables from the running container and writes them to a local env file.

### Push code vs push Docker image

These are two different operations:

#### Push code to GitHub
Docker does not change how Git works. Even if you run the app with Docker, you still push source code normally:

```bash
bash scripts/manage.sh push-code "Your commit message"
```

#### Push Docker image to a registry
If you want to publish the built container image, set these in `.env`:

```env
DOCKER_IMAGE_NAME=ghcr.io/lalitnayyar/pilangfuse
DOCKER_IMAGE_TAG=latest
```

Then run:

```bash
bash scripts/manage.sh push-image
```

> Note: `.env` is intentionally ignored by git, so your secrets and private deployment settings are not pushed to GitHub.

### Deployment guide

For a dedicated deployment walkthrough, see:

```text
docs/DEPLOYMENT.md
```

---

## Output Format

Generated filename pattern:

```text
<topic>-<datetime>.md
```

Example:

```text
reports/ai-agents-for-software-engineering-2026-08-03T10-15-00-000Z.md
```

### Markdown report includes
- title
- generated time
- executive summary
- 5 web resources with short briefs
- 5 YouTube videos with short briefs
- key takeaways

---

## Error Handling and Retries

The project includes improved reliability features.

### Retry behavior
Automatic retries occur for transient failures such as:
- request timeout
- `429 Too Many Requests`
- `500`, `502`, `503`, `504`

### Better error handling
- structured application errors
- clearer status messages
- provider-specific failure visibility
- fallback behavior when alternate provider credentials exist

### Agent 3 fallback logic
If OpenAI fails or is unavailable:
- the workflow does **not** stop
- deterministic markdown generation is used instead

---

## Customization Guide

### Change web provider

```env
WEB_SEARCH_PROVIDER=serpapi
```

### Change video provider

```env
VIDEO_SEARCH_PROVIDER=serpapi
```

### Disable fallback

```env
ALLOW_PROVIDER_FALLBACK=false
```

### Change output directory

```env
OUTPUT_DIR=custom-reports
```

### Change server port

```env
PORT=8080
```

### Adjust retry behavior

```env
HTTP_RETRY_COUNT=5
HTTP_RETRY_DELAY_MS=1500
HTTP_TIMEOUT_MS=45000
```

### Use OpenAI-enhanced report writing
Add:

```env
OPENAI_API_KEY=your_key_here
OPENAI_MODEL=gpt-4.1-mini
```

---

## Example End-to-End Flow

User input:

```text
Prompt engineering for enterprise support teams
```

Workflow behavior:
- Agent 1 finds 5 relevant articles/pages
- Agent 2 finds 5 related YouTube videos
- Agent 3 creates a markdown brief combining both
- report is stored in `reports/`
- UI and API show progress as the job runs
- Langfuse captures workflow and span traces

Result:
- a ready-to-share markdown file for teammates or stakeholders

---

## Future Enhancements

Potential next upgrades:
- PDF export alongside markdown
- email/slack sharing of final report
- additional providers for web/video search
- persistent database-backed job storage
- authentication for multi-user access
- downloadable ZIP of all sources
- source ranking/scoring improvements
- report templates for different audiences
- batch topic processing
- scheduled research jobs

---

## Quick Start Summary

### Local

```bash
npm install
cp env/.env.tavily-youtube.example .env
# fill keys
npm start
```

### Local with management console

```bash
npm install
bash scripts/manage.sh env-tavily
# fill keys in .env
bash scripts/manage.sh start-local
```

### Docker

```bash
cp env/.env.tavily-youtube.example .env
docker compose up --build
```

### Docker with management console

```bash
bash scripts/manage.sh env-tavily
# fill keys in .env
bash scripts/manage.sh start-docker
```

Then open:

```text
http://localhost:3000
```

Or run directly from CLI:

```bash
npm run research -- "your topic here"
```

---

## Final Notes

This project is designed to be:
- modular
- traceable
- demo-friendly
- production-extensible
- easy to operate from terminal, browser, API, or Docker

If you want next, I can also add:
- persistent job storage
- authentication
- PDF/HTML report export
- Slack/email sharing
- CI pipeline for build and Docker publish
