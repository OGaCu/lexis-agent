# Deploying the Lexis Vocab Service to AWS EC2

A step-by-step guide for someone new to deployment. By the end you will have:

1. A public URL like `http://<EC2-IP>:8000/vocab/words` that returns your vocab data as JSON.
2. Automatic redeploys: every push to the `main` branch updates the running server.

We deploy **API only** for now (Postgres + `vocab-service` + `api-gateway`). The web UI can be added later without redoing any of this — see **step 8 (Add the web UI)** below.

**Time:** ~45–60 minutes the first time. **Cost:** $0 if you stay inside the AWS Free Tier.

---

## How the pieces fit together

```
Browser / curl
      │  http://<EC2-IP>:8000/vocab/words
      ▼
┌─────────────────────────── EC2 instance (one small Linux box) ───────────────────────────┐
│                                                                                            │
│   api-gateway  ──proxies /vocab/*──►  vocab-service  ──SQL──►  Postgres (db)               │
│   (port 8000, public)                 (port 8001, internal)   (internal only, not public)  │
│                                                                                            │
│   All three run as Docker containers via docker-compose.prod.yml                           │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

Only port **8000** is exposed to the internet. Postgres is never reachable from outside.

**Important about "existing data":** a brand-new EC2 database starts empty and is auto-populated from `db/init.sql` + `db/seed.sql` (the seed words). It will **not** contain the data currently sitting in your local Docker volume. To copy your local data across, see **step 10 (Migrating your local data)** below.

---

## 0. Before you start

You need:

- An **AWS account** (https://aws.amazon.com/ — sign up, it asks for a card but Free Tier is free).
- The Lexis repo pushed to **GitHub** (it already is).
- A terminal on your Mac (you have `zsh`).

Concepts in one line each:
- **EC2 instance** = a rented Linux computer in the cloud.
- **Security Group** = the firewall for that computer (which ports the world can reach).
- **Key pair (.pem file)** = the SSH password-file that lets you log into the box.

---

## 1. Launch a free-tier EC2 instance

1. Sign in to the AWS Console → search **EC2** → open it.
2. Top-right, confirm a nearby **Region** (e.g. `us-east-1`). Remember which one — everything lives in one region.
3. Click **Launch instance**.
4. **Name:** `lexis`.
5. **Application and OS Images:** choose **Amazon Linux 2023** (free-tier eligible). *(If you prefer Ubuntu, pick "Ubuntu Server 24.04 LTS" — the only difference later is the SSH username, noted below.)*
6. **Instance type:** pick one marked **Free tier eligible** — `t2.micro` or `t3.micro` (1 GB RAM).
7. **Key pair (login):** click **Create new key pair**.
   - Name: `lexis-key`, type **RSA**, format **.pem**.
   - Click Create — a file `lexis-key.pem` downloads. **Keep it safe; you cannot download it again.**
8. **Network settings** → **Edit**. Under firewall (security group) rules, create these inbound rules:
   - **SSH**, port `22`, source **My IP** (so only you can log in).
   - **Custom TCP**, port `8000`, source **Anywhere (0.0.0.0/0)** — this is the public API.
9. **Configure storage:** default 8 GB is fine (free tier allows up to 30 GB — you can bump it to 20 GB for headroom, still free).
10. Click **Launch instance**, then **View all instances**. Wait until **Instance state = Running** and **Status checks = 2/2**.
11. Click the instance and copy its **Public IPv4 address** (e.g. `54.123.45.67`). This is your `<EC2-IP>` from now on.

> **Tip:** the public IP changes every time you stop/start the instance. For a stable address, later allocate a free **Elastic IP** (EC2 → Elastic IPs → Allocate → Associate with the instance). One Elastic IP attached to a running instance is free.

---

## 2. Connect to the instance over SSH

On your Mac, move the key somewhere safe and lock down its permissions (SSH refuses keys that are too readable):

```bash
mkdir -p ~/.ssh
mv ~/Downloads/lexis-key.pem ~/.ssh/lexis-key.pem
chmod 400 ~/.ssh/lexis-key.pem
```

Now connect. The username depends on the OS you chose:
- Amazon Linux 2023 → `ec2-user`
- Ubuntu → `ubuntu`

```bash
ssh -i ~/.ssh/lexis-key.pem ec2-user@<EC2-IP>
```

Type `yes` at the fingerprint prompt. You are now on the server (prompt changes to something like `[ec2-user@ip-172-... ~]$`).

---

## 3. Install Docker, git, and a swap file

Run these **on the server**. Commands below are for **Amazon Linux 2023**; Ubuntu equivalents are in the note after.

```bash
# Update, install git + docker
sudo dnf update -y
sudo dnf install -y git docker

# Start Docker and let it run on boot
sudo systemctl enable --now docker

# Let your user run docker without sudo
sudo usermod -aG docker $USER

# Install the docker compose v2 plugin
sudo mkdir -p /usr/local/lib/docker/cli-plugins
sudo curl -SL https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64 \
  -o /usr/local/lib/docker/cli-plugins/docker-compose
sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
```

TroubleShoot if build image on Mac (arm64) but want to run on EC2 with Linux (x86_64/amd64): 
```bash
  mkdir -p ~/.docker/cli-plugins
   
  curl -SL https://github.com/docker/buildx/releases/download/v0.34.1/buildx-v0.34.1.linux-amd64 \
     -o ~/.docker/cli-plugins/docker-buildx
   
  chmod +x ~/.docker/cli-plugins/docker-buildx

  # then sanity check with
  ls -lh ~/.docker/cli-plugins/docker-buildx
  # should tens of MB 
```

**Add a 2 GB swap file.** The free-tier box has only 1 GB RAM; building Docker images (pip installs) can run out of memory without swap.

```bash
sudo dd if=/dev/zero of=/swapfile bs=1M count=2048
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab   # persist across reboots
```

Now **log out and back in** so the docker group membership takes effect:

```bash
exit
ssh -i ~/.ssh/lexis-key.pem ec2-user@<EC2-IP>
docker version   # should print client + server with no "permission denied"
```
**Implementation Troubleshoting** if running `docker version` gives permisson denied:
if running `groups` in terminal, and docker doesn't show up:
then run `newgrp docker`
then rerun `docker version`

running `getent group docker` and getting output `docker:x:992:ec2-user`verifies that $USER (ec2-user in our case) is added to the group named docker. 

> **Ubuntu note:** replace the install block with:
> ```bash
> sudo apt-get update -y
> sudo apt-get install -y git docker.io docker-compose-v2
> sudo systemctl enable --now docker
> sudo usermod -aG docker $USER
> ```
> and use `ubuntu@` as the SSH username throughout.

---

## 4. Get the code and create the `.env` file

Clone your repo into `~/lexis` (the auto-deploy workflow expects exactly this path):

```bash
cd ~
git clone https://github.com/<your-github-username>/<your-repo>.git lexis
cd lexis
```

> If the repo is **private**, the simplest first-time clone is over HTTPS with a GitHub personal access token, or set up a deploy key. Ask if you need help — for a public repo the plain clone above just works.

Create the `.env` file. For **viewing data you do not need any API keys** — a minimal file is enough:

```bash
cat > .env <<'EOF'
DATABASE_URL=postgresql://lexis:lexis@db:5432/lexis
VOCAB_SERVICE_URL=http://vocab-service:8001
ANTHROPIC_API_KEY=
NOTION_API_KEY=
NOTION_DATABASE_ID=
EOF
```

(To just **view** data you need no keys. `ANTHROPIC_API_KEY` is required only to **add words** with AI enrichment — you'll fill it in step 8. Leaving Notion blank disables sync.)

---

## 5. First deploy

Build and start the three containers using the production compose file:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

First build takes a few minutes. When it finishes, check everything is up:

```bash
docker compose -f docker-compose.prod.yml ps      # all should say "running"/"healthy"
curl localhost:8000/health                        # -> {"status":"ok"}
curl localhost:8000/vocab/words                    # -> JSON array of seed words
```

---

## 6. View your data from anywhere

From your **own laptop's** browser or terminal:

```
http://<EC2-IP>:8000/vocab/words
```

You should see the JSON list of words. That is your public vocab API. Other endpoints:

- `GET  http://<EC2-IP>:8000/vocab/words` — list all words
- `GET  http://<EC2-IP>:8000/vocab/words/<id>` — one word
- `POST http://<EC2-IP>:8000/vocab/words` — add a word

> Not loading? Check: instance is Running, the security group has the port **8000 / Anywhere** rule from step 1.8, and `docker compose ... ps` shows containers healthy.

---

## 7. Auto-deploy on push to `main` (AWS CodeDeploy)

Deploys are handled by **AWS CodeDeploy**: a push to `main` flows through CodePipeline →
CodeDeploy, which runs `docker compose up` on the box.

The full setup — IAM roles, the CodeDeploy agent, `appspec.yml` / `scripts/start.sh`, the
application + deployment group, and the CodePipeline — lives in **[`AWS-native-CICD.md`](AWS-native-CICD.md)**.
That doc is the single source of truth for CI/CD, and it also lists the **relaunch
prerequisites** (agent + IAM role + tag) any new box needs to be deployable.

Once set up, verify: push to `main` → pipeline Source green → Deploy green → re-check
`http://<EC2-IP>:8000/vocab/words`. From then on every push to `main` redeploys.

---

## 8. Add the web UI (frontend) — on the same EC2 box (cheapest, $0 extra)

The visual UI is the Next.js `frontend` container. The cheapest way to serve it is to run it **on the same EC2 instance**, next to the API — no extra AWS resources, no extra bill. Nothing from steps 1–7 changes; you're just turning on one more container.

The `frontend` service is already defined in `docker-compose.prod.yml`, gated behind a compose **profile** called `web`. Default deploys (steps 5–7) skip it; turning on the profile brings it up. This keeps the API-only path lightweight and means the migration to AWS-native CI/CD (section 11) doesn't have to special-case the UI.

### How the pieces change

```
Browser
  ├── http://<EC2-IP>:3001   →  frontend (Next.js UI)  ─┐
  └── http://<EC2-IP>:8000   →  api-gateway  ───────────┴─►  vocab-service  →  Postgres
```

The UI is server-rendered on :3001, but the **browser** calls the API directly on :8000. Two things follow from that:
- The API URL is **baked into the UI at build time** (`NEXT_PUBLIC_API_URL`), so it must be set to your public address *before* the image builds.
- The gateway must **allow the UI's origin** through CORS (`EXTRA_CORS_ORIGINS`).

Both are driven entirely by `.env` on the server, so no tracked file needs editing — which is exactly what makes the CI/CD migration clean.

### 8a. Get a stable IP first (recommended)

Because `NEXT_PUBLIC_API_URL` is baked into the build, if your public IP changes (it does on every stop/start) the UI would point at a dead address until the next rebuild. Allocate a free **Elastic IP** and associate it with the instance (EC2 → Elastic IPs → Allocate → Associate). Use that IP everywhere below as `<EC2-IP>`.

### 8b. Add the Anthropic key so you can *add* words

Viewing words needs no key, but the "add word" flow uses Claude to generate the definition, examples, and related words. On the server, edit `.env` and set your key:

```bash
# ON THE SERVER, in ~/lexis
nano .env
```

Set (or add) this line — get a key at https://console.anthropic.com/ → **API Keys**:

```
ANTHROPIC_API_KEY=sk-ant-...your key...
```

> Treat this key like a password. It lives only in `.env` on the server (which is gitignored and never committed). If it ever leaks, rotate it in the Anthropic console.

### 8c. Point the UI at your API and open CORS

Still in `.env`, add these three lines (replace `<EC2-IP>` with your Elastic IP):

```
COMPOSE_PROFILES=web
PUBLIC_API_URL=http://<EC2-IP>:8000
EXTRA_CORS_ORIGINS=http://<EC2-IP>:3001
```

- `COMPOSE_PROFILES=web` — activates the frontend container for *every* `docker compose` command (including the CodeDeploy deploy), so you never have to change the deploy script.
- `PUBLIC_API_URL` — baked into the UI build as `NEXT_PUBLIC_API_URL` (see the `frontend` block in `docker-compose.prod.yml`).
- `EXTRA_CORS_ORIGINS` — the gateway reads this and allows the browser origin (see `services/api-gateway/main.py`).

### 8d. Open port 3001 in the security group

EC2 → your instance → **Security** tab → click the security group → **Edit inbound rules** → **Add rule**: **Custom TCP**, port **3001**, source **Anywhere (0.0.0.0/0)** → Save. (Now ports 22, 8000, 3001 are open — nothing else.)

### 8e. Build and start (with the UI)

```bash
# ON THE SERVER, in ~/lexis
docker compose -f docker-compose.prod.yml up -d --build
```

Because `COMPOSE_PROFILES=web` is now in `.env`, this brings up the frontend too. Verify:

```bash
docker compose -f docker-compose.prod.yml ps        # should now list "frontend" as well
curl -I localhost:3001                               # -> HTTP/1.1 200 OK
```

Then open **`http://<EC2-IP>:3001`** in your browser. You should see the Lexis vocab UI, listing your words. Try adding a word — if the Anthropic key is set, it fills in the definition automatically.

### 8f. It just works on the next push

Since everything lives in `.env` on the server, the CodeDeploy pipeline from step 7 needs **no changes** — the next push to `main` runs the same `docker compose ... up -d --build` (via `scripts/start.sh`), picks up the `web` profile, and redeploys UI + API together.

> **Memory note (1 GB free tier):** building the Next.js image is memory-hungry. The 2 GB swap file from step 3 is what keeps this build from being killed — don't skip it. If the box still struggles, either bump to a `t3.small` (leaves the free tier, ~$15/mo) or host only the frontend on **Vercel** (free for hobby use) pointing `NEXT_PUBLIC_API_URL` at your EC2 API — the gateway already allows `*.vercel.app` origins.

---

## 9. Changing which words ship by default (seed data)

Fresh databases are auto-loaded from `db/init.sql` (schema) + `db/seed.sql` (words). `db/seed.sql` is the **single source of truth** for the starter word list — every `INSERT` uses `ON CONFLICT (id) DO NOTHING`, so re-running it never clobbers or duplicates existing rows.

To refresh it from the live server, run the helper **from your laptop** — it SSHes to the
box, dumps the `words` table, rewrites every row as an idempotent
`INSERT ... ON CONFLICT (id) DO NOTHING`, and overwrites `db/seed.sql`:

```bash
EC2_HOST=<EC2-IP> ./infra/dump-seed.sh
```

(Optional env overrides — `EC2_USER`, `SSH_KEY`, `REMOTE_DIR`, `COMPOSE_FILE` — are
documented in the script header. It uses `pg_dump --column-inserts`, which is required:
plain `--data-only` emits `COPY` blocks, not the `INSERT` statements the seed file needs.)

Then review the diff and commit:

```bash
git diff db/seed.sql && git add db/seed.sql && git commit -m 'chore(db): refresh seed from prod'
```

Note: seed changes only affect **new** volumes (first boot). To load them into an existing
database, see section 10.

---

## 10. Optional — Migrating your local data

If you want the words from your **local** machine on the server instead of just the seed data:

```bash
# ON YOUR LAPTOP — dump only the vocab table from the local db container
docker compose exec -T db pg_dump -U lexis -d lexis -t words --data-only \
  > words_data.sql

# copy the dump up to the server
scp -i ~/.ssh/lexis-key.pem words_data.sql ec2-user@<EC2-IP>:~/lexis/

# ON THE SERVER — load it into the running db container
cd ~/lexis
cat words_data.sql | docker compose -f docker-compose.prod.yml exec -T db psql -U lexis -d lexis
```

(If a row already exists with the same id you may see duplicate-key notices — safe to ignore, or `TRUNCATE words;` on the server first if you want an exact replace.)

---

## Common commands (cheat sheet)

Run these **on the server**, from `~/lexis`:

```bash
docker compose -f docker-compose.prod.yml ps                 # status
docker compose -f docker-compose.prod.yml logs -f vocab-service   # tail logs
docker compose -f docker-compose.prod.yml restart            # restart all
docker compose -f docker-compose.prod.yml down               # stop (keeps data)
docker compose -f docker-compose.prod.yml up -d --build      # rebuild + start
```

---

## Cost & safety notes

- **Free tier** covers 750 hours/month of one `t2.micro`/`t3.micro` for 12 months — one instance running 24/7 fits. Watch the AWS **Billing → Free Tier** dashboard.
- Set a **Billing alert** (Billing → Budgets → create a $1 budget) so you get emailed if anything starts costing money.
- Only ports 22 (you only), 8000 (public API), and 3001 (public UI, once you enable it in step 8) are open. Postgres is never exposed. Keep it that way.
- The DB password is the default `lexis`. Because the DB port is never published, it is not internet-reachable — fine for this setup. If you later expose Postgres, change it.
- To shut everything down and stop billing risk: **EC2 → Instance → Terminate** (deletes the box) or **Stop** (keeps it, minimal EBS storage cost).

---

## 11. CI/CD details (for the admin) — AWS CodeDeploy

Deploys run through an **AWS-native pipeline** (CodePipeline → CodeDeploy). Setup, the
relaunch prerequisites, and the optional CodeBuild + ECR add-on live in their own guide:

**→ See [`AWS-native-CICD.md`](AWS-native-CICD.md).**
