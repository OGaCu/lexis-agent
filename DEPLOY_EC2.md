# Deploying the Lexis Vocab Service to AWS EC2

A step-by-step guide for someone new to deployment. By the end you will have:

1. A public URL like `http://<EC2-IP>:8000/vocab/words` that returns your vocab data as JSON.
2. Automatic redeploys: every push to the `main` branch updates the running server.

We deploy **API only** for now (Postgres + `vocab-service` + `api-gateway`). The web UI can be added later without redoing any of this — see [Adding the web UI later](#8-optional--adding-the-web-ui-later).

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

**Important about "existing data":** a brand-new EC2 database starts empty and is auto-populated from `db/init.sql` + `db/seed.sql` (the seed words). It will **not** contain the data currently sitting in your local Docker volume. To copy your local data across, see [Migrating your local data](#9-optional--migrating-your-local-data).

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
INVEST_SERVICE_URL=http://invest-service:8002
ANTHROPIC_API_KEY=
NOTION_API_KEY=
NOTION_DATABASE_ID=
EOF
```

(You only need `ANTHROPIC_API_KEY` if you later call the "add word with AI" endpoint. Leaving Notion blank disables sync.)

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

## 7. Auto-deploy on push to `main` (GitHub Actions)

The repo already includes `.github/workflows/deploy.yml`. On every push to `main` it SSHes into your EC2 box, runs `git pull`, and rebuilds. You just need to give GitHub the login details as **secrets**.

### 7a. Create a dedicated SSH key for GitHub (recommended)

Rather than handing GitHub your personal `.pem`, make a key **on the server** just for deploys:

```bash
# ON THE SERVER
ssh-keygen -t ed25519 -f ~/.ssh/deploy_key -N ""
cat ~/.ssh/deploy_key.pub >> ~/.ssh/authorized_keys   # allow this key to log in
cat ~/.ssh/deploy_key                                 # <-- copy this ENTIRE private key
```

### 7b. Add the secrets in GitHub

In your repo on GitHub → **Settings → Secrets and variables → Actions → New repository secret**. Add three:

| Secret name   | Value                                                        |
|---------------|--------------------------------------------------------------|
| `EC2_HOST`    | your `<EC2-IP>` (or Elastic IP / DNS name)                   |
| `EC2_USER`    | `ec2-user` (or `ubuntu`)                                     |
| `EC2_SSH_KEY` | the full private key text from `cat ~/.ssh/deploy_key`, including the `-----BEGIN...` and `-----END...` lines |

### 7c. Test it

Push the new files to `main`:

```bash
# ON YOUR LAPTOP, in the repo
git add docker-compose.prod.yml .github/workflows/deploy.yml DEPLOY_EC2.md
git commit -m "Add EC2 production deploy setup"
git push origin main
```

Go to the repo's **Actions** tab → watch the **Deploy to EC2** run go green. Then re-check `http://<EC2-IP>:8000/vocab/words`. From now on, every push to `main` redeploys automatically. You can also trigger it manually from the Actions tab (**Run workflow**).

---

## 8. Optional — Adding the web UI later

Nothing above needs to change. When you want the visual view:

1. In `docker-compose.prod.yml`, uncomment the `frontend` block and set `NEXT_PUBLIC_API_URL: http://<EC2-IP>:8000`.
2. Add `EXTRA_CORS_ORIGINS=http://<EC2-IP>:3001` to the `api-gateway` service environment (the gateway reads this to allow the browser origin — see `services/api-gateway/main.py`).
3. In the EC2 **security group**, add an inbound rule: Custom TCP, port **3001**, Anywhere.
4. Push to `main`. The UI comes up at `http://<EC2-IP>:3001`.

Note: the Next.js frontend is heavier — with it running you will definitely want the swap file from step 3, and you may feel the 1 GB RAM limit. If it struggles, move to a larger instance (leaves the free tier) or serve the frontend on Vercel instead (the CORS rule already allows `*.vercel.app`).

---

## 9. Optional — Migrating your local data

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
- Only ports 22 (you only) and 8000 (public) are open. Postgres is not exposed. Keep it that way.
- The DB password is the default `lexis`. Because the DB port is never published, it is not internet-reachable — fine for this setup. If you later expose Postgres, change it.
- To shut everything down and stop billing risk: **EC2 → Instance → Terminate** (deletes the box) or **Stop** (keeps it, minimal EBS storage cost).

---

## Where this is heading (for the admin) — AWS-native CI/CD

GitHub Actions + SSH is the pragmatic interim solution. The stated end goal is an **AWS-native pipeline**. When ready, replace step 7 with:

- **AWS CodePipeline** — orchestrates the flow. Source stage connects to GitHub via a **CodeStar / GitHub connection** (OAuth, no SSH keys), so a push to `main` triggers the pipeline automatically.
- **AWS CodeBuild** *(optional build stage)* — builds the Docker images in the cloud and pushes them to **Amazon ECR** (container registry), instead of building on the tiny EC2 box.
- **AWS CodeDeploy** — the deploy stage. Install the **CodeDeploy agent** on the EC2 instance, add an `appspec.yml` to the repo describing lifecycle hooks (e.g. a script that runs `docker compose ... up -d`), and CodeDeploy pushes each revision out with proper rollout/rollback.

Rough migration checklist for later:
1. Create an **ECR** repo per service; change the pipeline to build+push images there.
2. Attach an **IAM instance role** to EC2 granting ECR pull + CodeDeploy access; install the CodeDeploy agent.
3. Add `appspec.yml` + deploy hook scripts to the repo.
4. Create the **CodeStar GitHub connection**, then the **CodePipeline** (Source → [Build] → Deploy).
5. Remove `.github/workflows/deploy.yml` once the pipeline is verified.

This is more moving parts (IAM roles, ECR, agent, appspec) — worth it when you want managed rollouts, rollback, and no long-lived SSH key in GitHub. Not necessary just to get the service live today.
