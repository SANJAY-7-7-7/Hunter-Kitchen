# Hunter's Kitchen — Production Deployment Guide

This guide details the complete deployment process for **Hunter’s Kitchen**, covering containerized deployment (Docker Compose), managed cloud deployment (Railway / Render / Fly.io), and standard Ubuntu VPS deployment (Node + PM2 + Nginx + PostgreSQL 18).

---

## Architecture Overview

- **Frontend**: React 19 + Vite + Tailwind CSS (optimized manual chunk splitting in `dist/assets/`)
- **Backend**: Node.js + Express + TypeScript (bundled with `esbuild` into `dist/server.cjs`)
- **Load Balancer**: Nginx reverse proxy with upstream balancing, HTTP/2, Gzip, and SSE streaming buffer bypass
- **Primary Database**: PostgreSQL 18.x (ACID-compliant, migrations in `database/migrations/`)
- **Cache & Rate Limiting**: Redis 7.x (`ioredis` distributed rate limiting + atomic counters with resilient in-memory fallback)
- **Real-Time Stream**: Multi-node Server-Sent Events (SSE) via `/api/events/stream` backed by Redis Pub/Sub
- **Background Workers**: Distributed Outbox Worker with PostgreSQL `FOR UPDATE SKIP LOCKED` concurrency
- **Webhooks**: Incoming payment callbacks (`/api/webhooks/payment`) + HMAC-signed outgoing webhook delivery
- **Disaster Recovery**: Automated checksummed backup snapshots (`npm run db:backup` / `npm run db:restore`)
- **CI/CD**: GitHub Actions automated pipeline (`.github/workflows/ci.yml`) testing lint, build, Postgres, Redis & Docker image

---

## 1. Environment Configuration

Create a `.env` file in the root directory by copying `.env.example`:

```bash
cp .env.example .env
```

### Essential Production Variables

| Variable | Description | Example / Recommendation |
| :--- | :--- | :--- |
| `NODE_ENV` | Environment mode | `production` |
| `PORT` | HTTP Server port | `3000` |
| `APP_URL` / `APP_ORIGIN` | Public domain of the application | `https://hunterskitchen.com` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:5432/hunters_kitchen?sslmode=require` |
| `REDIS_URL` | Redis connection URL | `redis://default:pass@host:6379` |
| `JWT_SECRET` | 32+ character random secret string | `openssl rand -hex 32` |
| `SESSION_COOKIE_SECRET` | Cookie signing secret | `openssl rand -hex 32` |

### Optional Service Integrations

| Variable | Description |
| :--- | :--- |
| `GMAIL_USER` & `GMAIL_APP_PASSWORD` | Real-time OTP emails via Gmail App Passwords |
| `GEMINI_API_KEY` | Gemini AI food pairing & menu assistant |
| `GOOGLE_MAPS_PLATFORM_KEY` | Client-side Google Maps & Autocomplete |
| `GOOGLE_CLIENT_ID` / `_SECRET` | Google OAuth single sign-on |

---

## 2. Deployment Method A: Docker & Docker Compose (Recommended)

Docker Compose provides a 1-command deployment including PostgreSQL 18, Redis 7, and the Hunter's Kitchen application.

### Step 1: Clone Repository & Configure Environment
```bash
git clone https://github.com/your-repo/hunters-kitchen.git
cd hunters-kitchen
cp .env.example .env
# Edit .env with your secrets and domain
nano .env
```

### Step 2: Build and Start Containers
```bash
docker compose up -d --build
```
This will:
1. Start PostgreSQL 18 container with persistent volume `postgres_data`.
2. Automatically execute all migrations in `database/migrations/` on initial boot.
3. Start Redis 7 container with persistent volume `redis_data`.
4. Multi-stage build the Vite frontend & Express server in the `app` container.
5. Launch the application on port `3000`.

### Step 3: Seed Initial Menu & Admin Data (First Run Only)
```bash
docker compose exec app npm run db:seed
```

### Step 4: Verify Deployment
```bash
# Check container status
docker compose ps

# Check logs
docker compose logs -f app

# Test health check endpoint
curl http://localhost:3000/api/health
```

---

## 3. Deployment Method B: Cloud Platforms (Railway / Render / Fly.io)

### Railway
1. **New Project**: Go to [Railway.app](https://railway.app) and create a new project.
2. **Add PostgreSQL**: Click **New -> Database -> Add PostgreSQL** (PostgreSQL 16/18).
3. **Add Redis**: Click **New -> Database -> Add Redis**.
4. **Deploy Application**:
   - Connect your GitHub repository.
   - Set Build Command: `npm run build`
   - Set Start Command: `npm run start`
5. **Set Environment Variables**:
   - `DATABASE_URL`: `${{Postgres.DATABASE_URL}}`
   - `REDIS_URL`: `${{Redis.REDIS_URL}}`
   - `NODE_ENV`: `production`
   - `JWT_SECRET`: *(Generate 32-character string)*
   - `APP_URL`: *(Your Railway public URL)*
6. **Run Migrations & Seeds**:
   - Open Railway CLI or service shell:
     ```bash
     npm run db:migrate
     npm run db:seed
     ```

### Render (Free Tier Web Service) + Supabase (Free Tier PostgreSQL)

This is the recommended 100% free production deployment architecture:
- **Supabase Free Tier**: Provides managed PostgreSQL 16/17 with 500 MB storage and high availability connection pooling.
- **Render Free Tier**: Provides free web service hosting with custom domains, automated HTTPS, and CI/CD GitHub deployments.

#### Step 1: Provision Supabase Free Tier PostgreSQL
1. Sign in or create a free account at [Supabase.com](https://supabase.com).
2. Click **New Project**:
   - **Name**: `hunters-kitchen` (or your choice)
   - **Database Password**: Choose a strong password and **save it securely**.
   - **Region**: Choose the region closest to your users (e.g. `ap-south-1` Mumbai / Singapore / `us-east-1`).
   - **Pricing Plan**: Select **Free ($0/month)**.
3. Once the database is ready (1-2 minutes):
   - Click the **Connect** button at the top header (or go to **Project Settings -> Database**).
   - Under **Connection String**, click the **URI** tab.
   - Choose **Transaction** mode (port 6543) or **Session** mode (port 5432).
   - Copy the URI, for example:
     ```
     postgresql://postgres.[project-ref]:[YOUR-PASSWORD]@aws-0-[region].pooler.supabase.com:6543/postgres?sslmode=require
     ```
   - Replace `[YOUR-PASSWORD]` with the actual database password you chose in step 2.

#### Step 2: Deploy to Render Free Tier

##### Option A: 1-Click Setup with Render Blueprint (`render.yaml`)
1. Push your repository to GitHub.
2. Go to your [Render Dashboard](https://dashboard.render.com).
3. Click **New +** -> **Blueprint**.
4. Select your `hunter's-kitchen` GitHub repository.
5. Render detects the bundled `render.yaml` file:
   - It will auto-populate the build command (`npm install && npm run build`) and start command (`npm run start`).
   - It will auto-generate secure 32+ character values for `JWT_SECRET` and `SESSION_COOKIE_SECRET`.
   - Under `DATABASE_URL`, paste your **Supabase PostgreSQL URI** from Step 1.
6. Click **Apply**. Render will automatically build the React Vite frontend, bundle the Express backend, run migrations, auto-seed the initial menu and owner accounts, and start the app!

##### Option B: Manual Web Service Setup on Render
1. Go to [Render Dashboard](https://dashboard.render.com).
2. Click **New +** -> **Web Service**.
3. Select **Build and deploy from a Git repository** and connect your repo.
4. Fill in the service configuration:
   - **Name**: `hunters-kitchen`
   - **Region**: Singapore (or closest to your Supabase region)
   - **Branch**: `main`
   - **Runtime**: `Node`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm run start`
   - **Instance Type**: `Free`
5. Under **Advanced -> Environment Variables**, add:
   - `NODE_ENV`: `production`
   - `DATABASE_URL`: `[Your Supabase Connection URI from Step 1]`
   - `DB_SSL`: `true`
   - `JWT_SECRET`: *(A random 32+ character string, e.g. `openssl rand -hex 32`)*
   - `SESSION_COOKIE_SECRET`: *(A random 32+ character string)*
6. Set **Health Check Path** to `/api/health`.
7. Click **Create Web Service**.

#### Step 3: Zero-Touch Migration & Seeding
- On first boot, Hunter's Kitchen automatically executes all SQL migrations from `database/migrations/`.
- If the database is clean (no users), it automatically seeds the initial restaurant settings, menu categories, dish items, and admin/staff accounts from `data/database.json`.
- The in-memory cache fallback engages automatically without needing a separate Redis instance.
- You can access your live site at `https://<your-service-name>.onrender.com`.

---

## 4. Deployment Method C: Standalone Ubuntu VPS (Nginx + PM2)

### Step 1: Install Node.js 22, PostgreSQL 18 & Redis
```bash
# Node.js 22
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs git postgresql postgresql-contrib redis-server nginx certbot python3-certbot-nginx

# Global PM2 process manager
sudo npm install -g pm2
```

### Step 2: Configure PostgreSQL
```bash
sudo -u postgres psql
```
```sql
CREATE DATABASE hunters_kitchen;
CREATE USER hunter WITH ENCRYPTED PASSWORD 'your_strong_password';
GRANT ALL PRIVILEGES ON DATABASE hunters_kitchen TO hunter;
ALTER DATABASE hunters_kitchen OWNER TO hunter;
\q
```

### Step 3: Clone Code & Build
```bash
cd /var/www
git clone https://github.com/your-repo/hunters-kitchen.git
cd hunters-kitchen

npm ci
cp .env.example .env
# Configure .env with postgresql://hunter:your_strong_password@localhost:5432/hunters_kitchen
nano .env

# Run database migrations and seed data
npm run db:migrate
npm run db:seed

# Build Vite frontend + Express backend
npm run build
```

### Step 4: Run with PM2
```bash
pm2 start dist/server.cjs --name "hunters-kitchen" --time
pm2 save
pm2 startup
```

### Step 5: Configure Nginx Reverse Proxy with SSE & WebSocket Support
Create `/etc/nginx/sites-available/hunterskitchen.conf`:
```nginx
server {
    server_name yourdomain.com www.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Crucial for Server-Sent Events (SSE) real-time streaming
        proxy_buffering off;
        proxy_read_timeout 86400s;
    }
}
```

Enable site and obtain free SSL certificate:
```bash
sudo ln -s /etc/nginx/sites-available/hunterskitchen.conf /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

---

## 5. Post-Deployment Verification Checklist

| Test Item | Command / URL | Expected Result |
| :--- | :--- | :--- |
| **Health Check** | `GET /api/health` | HTTP 200, `"status": "ok"` |
| **Database Pool** | `GET /api/health` | `"postgres": { "status": "UP" }` |
| **Client Frontend** | `GET /` | Loads React SPA with full menu |
| **Real-time SSE** | `GET /api/events/stream` | Keeps open `text/event-stream` |
| **Admin Login** | `POST /api/auth/login` | Returns session cookie and user profile |
| **Integrity Audit** | `npm run db:verify` | 100% tests passing |

---

## 6. Zero-Downtime Update Routine

Whenever you push new updates:
```bash
cd /var/www/hunters-kitchen
git pull origin main
npm ci
npm run db:migrate
npm run build
pm2 reload hunters-kitchen
```
