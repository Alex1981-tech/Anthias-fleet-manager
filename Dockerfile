# Stage 1: Build frontend
FROM node:22-alpine AS frontend-build

WORKDIR /build

COPY package.json package-lock.json* ./
RUN npm ci

COPY webpack.common.js webpack.prod.js tsconfig.json ./
COPY static/src/ static/src/
COPY static/sass/ static/sass/

RUN npm run build


# Stage 2: Python application
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update && \
    apt-get install -y --no-install-recommends libpq-dev ffmpeg && \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Copy built frontend from stage 1
COPY --from=frontend-build /build/static/dist/ /app/static/dist/

COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

RUN python manage.py collectstatic --noinput 2>/dev/null || true

EXPOSE 8000

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["gunicorn", "fleet_manager.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "3", "--timeout", "120"]
