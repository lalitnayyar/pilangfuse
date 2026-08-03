# Deployment Guide

This project supports both local and Docker-based deployment.

## Recommended production approach

Use Docker Compose with an `.env` file.

### 1. Prepare environment

```bash
cp env/.env.tavily-youtube.example .env
```

Or:

```bash
cp env/.env.serpapi.example .env
```

Update the API keys before deployment.

## 2. Deploy with Docker Compose

```bash
docker compose up --build -d
```

Open:

```text
http://localhost:3000
```

## 3. View logs

```bash
docker compose logs -f
```

## 4. Push code vs Docker image

Push source code to GitHub:

```bash
bash scripts/manage.sh push-code "Your commit message"
```

Push Docker image to a registry:

```bash
# add to .env
DOCKER_IMAGE_NAME=ghcr.io/lalitnayyar/pilangfuse
DOCKER_IMAGE_TAG=latest

bash scripts/manage.sh push-image
```

> `.env` is ignored by git, so secrets are not committed.

## 5. Stop deployment

```bash
docker compose down
```

## 5. Health check

```bash
curl http://localhost:3000/api/health
```

## Interactive management

You can also use:

```bash
bash scripts/manage.sh menu
```

Or one-shot deployment:

```bash
bash scripts/manage.sh deploy
```
