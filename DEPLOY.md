# Deployment Guide — Hetzner

## Environment Variables

All vars must be set on the Hetzner server before starting the backend process.

### Required

| Variable | Description | Where to get |
|---|---|---|
| `GROQ_API_KEY` | Groq API key for LLM extraction on digital PDFs | https://console.groq.com → API Keys |
| `DATALAB_API_KEY` | Datalab API key for Chandra OCR 2 pipeline | https://www.datalab.to → Account → API Keys |
| `DATALAB_PIPELINE_ID` | Chandra OCR 2 pipeline ID | https://www.datalab.to → Pipelines → copy ID (format: `pl_XXXX`) |

### Current values (dev)
Stored in `backend/.env` (gitignored, never commit). Copy to server env.

---

## Hetzner Setup Steps

### 1. Server provisioning
- OS: Ubuntu 22.04 LTS
- Min spec: CPX21 (3 vCPU, 4 GB RAM) — PDF parsing is CPU-bound
- Open ports: 80 (HTTP), 443 (HTTPS), 22 (SSH)

### 2. Install dependencies
```bash
curl -fsSL https://deb.nodesource.com/setup_23.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v  # must be >= 23.0.0 (required for native FormData/fetch)
```

### 3. Clone and build
```bash
git clone <repo-url> /opt/open-parsed
cd /opt/open-parsed/backend
npm install
npm run build
cd /opt/open-parsed/frontend
npm install
npm run build
```

### 4. Set environment variables
```bash
# /etc/environment or /opt/open-parsed/backend/.env
GROQ_API_KEY=<value>
DATALAB_API_KEY=<value>
DATALAB_PIPELINE_ID=<value>
```

### 5. Process manager (PM2)
```bash
npm install -g pm2
cd /opt/open-parsed/backend
pm2 start dist/index.js --name open-parsed-backend
pm2 startup
pm2 save
```

For the Next.js frontend:
```bash
cd /opt/open-parsed/frontend
pm2 start npm --name open-parsed-frontend -- start
pm2 save
```

### 6. Nginx reverse proxy
```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location /api/backend/ {
        proxy_pass http://localhost:8000/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        client_max_body_size 50M;
    }

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### 7. SSL (Let's Encrypt)
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

---

## Storage

PDFs are stored in `backend/documents/<id>/` on local disk.
- No cloud storage yet — disk fills up over time
- Future: migrate to Cloudflare R2 with 30-day lifecycle (see TODO.md Phase 7)
- Current safe limit: ~20 GB free disk recommended

---

## Cost per request

| PDF type | Service | Cost |
|---|---|---|
| Digital PDF | Groq (llama-3.3-70b-versatile) | ~$0.0002/page (free tier generous) |
| Scanned PDF | Datalab Chandra OCR 2 | $4.00/1,000 pages = ₹0.38/page at ₹95/$ |

---

## Future env vars (not yet implemented)

| Variable | Purpose |
|---|---|
| `POSTHOG_API_KEY` | Session replay + event analytics |
| `R2_ACCOUNT_ID` | Cloudflare R2 bucket account |
| `R2_ACCESS_KEY_ID` | R2 credentials |
| `R2_SECRET_ACCESS_KEY` | R2 credentials |
| `R2_BUCKET_NAME` | R2 bucket for PDF storage |
| `DATABASE_URL` | Postgres connection (for auth/usage tracking) |
