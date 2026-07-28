# CI/CD for the Lexis backend — AWS CodeDeploy (current)

Deploy automation for the EC2 backend. **This is now the live mechanism.**

**GitHub → CodePipeline (Source) → CodeDeploy → box runs `docker compose up`.**

Keep everything in **one Region** (e.g. `us-east-1`): EC2, IAM, CodeDeploy, and
CodePipeline must all live in the same one. Region mismatch is the #1 setup failure.

> **Deploy path in the repo:** CodeDeploy reads `appspec.yml` at the repo root, which runs
> `scripts/start.sh` — the same idempotent
> `docker compose -f docker-compose.prod.yml up -d --build`. Every environment-specific
> value (`COMPOSE_PROFILES`, `PUBLIC_API_URL`, `EXTRA_CORS_ORIGINS`, secrets) lives in
> `.env` on the box, not in any tracked file, so the same revision deploys unchanged
> everywhere and the `web` profile (UI) comes along automatically.

---

## Two ways code reaches a box — and why both exist

| Trigger | Mechanism | Used for |
|---|---|---|
| **Push to `main`** | CodePipeline → CodeDeploy | updating a **running** box |
| **First boot of a fresh box** | `infra/user-data.sh` (see `FAST-LAUNCH.md`) | getting code onto a **newly launched** box immediately |

CodeDeploy only fires on a push (or a manual deployment) — a box you *just* launched has
no code until the next push. `user-data.sh` fills that gap by running the same compose
command on first boot. They run the identical command, so they never conflict.

To push code to a freshly launched box *without* waiting for the next commit, trigger a
manual deployment: **CodeDeploy → Applications → `lexis` → deployment group `lexis-dg` →
Create deployment → use the latest revision.**

---

## Relaunch prerequisites — MUST be on every box CodeDeploy targets

⚠️ **Read this before you terminate/relaunch.** CodeDeploy finds a box by **tag**, but it
can only deploy to it if the box also has **two things**. A fresh instance missing either
one is silently skipped (deploy reports "0 instances" or times out):

1. the **CodeDeploy agent** installed and running, and
2. the **`lexis-ec2-role` IAM instance role** attached.

The clean way to never re-do these by hand: **bake the agent into your AMI** and **attach
the IAM role in the Launch Template**, both covered in `infra/FAST-LAUNCH.md`. The manual
recipe for each (to do once, or if you are not using the AMI/template flow) is below.

### Prereq A — Install the CodeDeploy agent on the box

SSH in, then (Amazon Linux 2023; replace **both** `<REGION>` with e.g. `us-east-1`):

```bash
sudo dnf install -y ruby wget
cd /home/ec2-user
wget https://aws-codedeploy-<REGION>.s3.<REGION>.amazonaws.com/latest/install
chmod +x ./install
sudo ./install auto
sudo systemctl enable --now codedeploy-agent
sudo systemctl status codedeploy-agent   # must say "active (running)"
```
(Ubuntu: use `sudo apt-get install -y ruby wget` for the first line.)

To bake it into the AMI so every launched box already has it: run the block above on the
instance **before** you create the image (see `FAST-LAUNCH.md` Part 1).

### Prereq B — Attach the `lexis-ec2-role` IAM instance role

- **Existing box:** EC2 → your instance → **Actions → Security → Modify IAM role** →
  select `lexis-ec2-role` → Update.
- **Launched from a Launch Template:** set the **IAM instance profile** to `lexis-ec2-role`
  in the template, so every launched box has it automatically (see `FAST-LAUNCH.md` Part 2).

If `lexis-ec2-role` does not exist yet, create it: IAM → Roles → Create role → **AWS
service / EC2** → attach **`AmazonEC2RoleforAWSCodeDeploy`** → name `lexis-ec2-role`.

### Prereq C — Tag the box so CodeDeploy targets it

The deployment group matches **`Name = lexis`**. Set that tag on the instance (EC2 →
instance → Tags), or bake it into the Launch Template so every launched box carries it.

---

## One-time setup (already done — kept here as the record / to rebuild)

### 1. Two IAM roles
- **Instance role** `lexis-ec2-role` — Prereq B above. Attach to the EC2 instance.
- **Service role** `lexis-codedeploy-service-role` — IAM → Create role → service
  **CodeDeploy** → attach **`AWSCodeDeployRole`**. (Selected in step 3.)

### 2. `appspec.yml` + `scripts/start.sh` at the repo root
```yaml
# appspec.yml
version: 0.0
os: linux
files:
  - source: /
    destination: /home/ec2-user/lexis
hooks:
  ApplicationStart:
    - location: scripts/start.sh
      timeout: 600
      runas: ec2-user
```
```bash
# scripts/start.sh   (commit it executable: chmod +x scripts/start.sh)
#!/usr/bin/env bash
set -e
cd /home/ec2-user/lexis
docker compose -f docker-compose.prod.yml up -d --build
docker image prune -f
```
`.env` on the box is gitignored, so the `files:` copy never overwrites it.

### 3. CodeDeploy application + deployment group
- **Application** `lexis`, platform **EC2/On-premises**.
- **Deployment group** `lexis-dg`: service role `lexis-codedeploy-service-role`; type
  **In-place**; environment **Amazon EC2 instances** matched by tag **`Name = lexis`**;
  deployment setting **`CodeDeployDefault.AllAtOnce`**; **no** load balancer.

### 4. CodePipeline
- **Create pipeline** `lexis-pipeline` (let it create a new service role).
- **Source:** provider **GitHub (via GitHub App)** → Connect → install the app on
  `OGaCu/lexis-agent`, branch `main` (CodeStar connection — OAuth, no SSH keys).
- **Build stage:** **Skip** (the box builds via `start.sh`).
- **Deploy:** provider **AWS CodeDeploy**, application `lexis`, group `lexis-dg`.

### 5. Verify
Push to `main` → pipeline Source green → Deploy green → CodeDeploy `ApplicationStart`
succeeds → `curl http://<EC2-IP>:8000/vocab/words` still serves.

---

## Optional later: CodeBuild + ECR

Only if building on the free-tier box gets too slow/memory-hungry: create one ECR repo per
service, add **`AmazonEC2ContainerRegistryReadOnly`** to `lexis-ec2-role`, add a **Build**
stage with a `buildspec.yml` that builds + `docker push`es, and switch
`docker-compose.prod.yml` from `build:` to `image: <ecr-url>` per service. `appspec.yml` /
`start.sh` barely change — `up -d` then pulls instead of building.

**Gotchas:** region mismatch (top cause); deployment-group tag not matching the instance
tag (deploy finds zero instances); agent not running (deploy times out at start);
`start.sh` not committed executable / wrong `runas`.
