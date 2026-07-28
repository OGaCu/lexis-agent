# What you built & learned — AWS session log

A record of the relaunch flow you completed and a plain-English glossary of every
AWS/DevOps concept it touched. Written for a newcomer to come back to. For the
step-by-step how-to, see [`FAST-LAUNCH.md`](FAST-LAUNCH.md) and
[`../AWS-native-CICD.md`](../AWS-native-CICD.md); this file explains the *why*.

---

## The process you went through (this session)

1. **Launched a throwaway EC2 instance** and followed `DEPLOY_EC2.md` steps 1–3 —
   installed Docker, git, and the 2 GB swap file. No repo, no `.env` (deps only).
2. **Installed the CodeDeploy agent** on that box (`AWS-native-CICD.md` Prereq A)
   *before* imaging, so every future box born from the image is deployable.
3. **Baked a custom AMI** (`lexis-base`) from that instance — a frozen snapshot of the
   slow-to-install, rarely-changing dependencies.
4. **Created a Launch Template** (`lexis`) pointing at that AMI, and inside it set the
   three things a box needs to be a valid CodeDeploy target:
   - **IAM instance role** `lexis-ec2-role` (Prereq B),
   - **resource tag `Name = lexis`** applied to *Instances* (Prereq C),
   - **user data** = `infra/user-data.sh` (fetches code + `docker compose up` on first boot).
5. **Launched an instance from the template.** It came up serving the API on `:8000`
   within a couple minutes, hands-off.
6. **Debugged the tag gotcha:** the box first came up without the `Name = lexis` tag, so
   CodeDeploy would have skipped it (0 instances). Fixed by ensuring the template applies
   the tag to *Instances*, not just volumes. Push-to-`main` deploys now land.

**Mental model that unlocked it:** the CodeDeploy *agent* is a daemon on the box (baked
into the AMI), never a file in the git repo. What lives in the repo is CodeDeploy's
*instructions*: `appspec.yml` + `scripts/start.sh`.

---

## The hybrid launch, in one picture

```
Custom AMI  (Docker + git + swap + CodeDeploy agent, baked once)  ──►  boots in seconds
     +
Launch Template  (AMI + IAM role + Name=lexis tag + user-data)   ──►  born deployable
     +
user-data.sh  (git clone + docker compose up, on first boot)     ──►  latest code, ~1-2 min
     =
one click ──►  http://<IP>:8000/vocab/words   serving, hands-off
```

Bake the **slow, stable** half (deps) into the image; script the **fast, changing** half
(code) on boot. Fast boots *and* always-fresh code.

---

## Glossary — every concept this session used

### Compute & images
- **EC2 instance** — a rented Linux VM in the cloud. Your whole stack runs on one box.
- **AMI (Amazon Machine Image)** — a saved snapshot of a configured disk. Launch N
  identical boxes from it without re-installing anything. You baked `lexis-base`.
- **EBS volume** — the instance's virtual hard drive. Holds the OS, your Postgres data,
  and `.env`. **Terminate deletes it; Stop keeps it** — the difference that decides
  whether your DB survives a shutdown.
- **Launch Template** — a saved "recipe" for launching instances (which AMI, instance
  type, key pair, security group, IAM role, tags, user data). Guarantees every box is
  born identical and correctly configured.
- **User data** — a script cloud-init runs **once, on first boot**, as root. Your
  `user-data.sh` pulls the code and starts the containers. Runs on launch only — not on
  reboot, not on later pushes.

### Networking & access
- **Security Group** — the instance's firewall. You opened inbound `22` (SSH, your IP
  only), `8000` (public API), optionally `3001` (web UI). Postgres stays closed.
- **Key pair (`.pem`)** — the SSH private key that logs you into the box. `chmod 400` it.
- **Elastic IP** — a fixed public IP you own and attach to whichever box is live, so your
  URL doesn't change on stop/start. Free while attached to a running instance.

### Identity & permissions
- **IAM role (instance role)** — permissions *the box itself* carries, so it can call AWS
  APIs without stored keys. `lexis-ec2-role` lets the CodeDeploy agent pull deploy
  artifacts. Without it, deploys silently skip the box.
- **IAM service role** — permissions an AWS *service* assumes on your behalf.
  `lexis-codedeploy-service-role` lets CodeDeploy act; CodePipeline has its own.
- **Instance profile** — the wrapper that attaches an IAM role to an EC2 instance (what
  the "IAM instance profile" field in the Launch Template sets).

### Tags
- **Resource tag** — a `Key = Value` label on an AWS resource. CodeDeploy's deployment
  group finds target boxes by **`Name = lexis`**. Must be applied to *Instances* in the
  template, exact and case-sensitive — the tag gotcha you hit.

### CI/CD (how code reaches the box)
- **CodePipeline** — the orchestrator. Watches GitHub `main`, then triggers the deploy.
  Stages here: **Source** (GitHub) → **Deploy** (CodeDeploy). Build stage skipped (the
  box builds itself).
- **CodeStar / GitHub App connection** — the OAuth link that lets CodePipeline read your
  GitHub repo without SSH keys.
- **CodeDeploy** — the deployer. Its **agent** (daemon on the box) receives the revision
  and runs the hooks in `appspec.yml`.
- **`appspec.yml`** — repo-root file telling CodeDeploy where to copy files and which
  scripts (hooks) to run. Yours copies the repo to `~/lexis` and runs `scripts/start.sh`
  at `ApplicationStart`.
- **`scripts/start.sh`** — the idempotent
  `docker compose -f docker-compose.prod.yml up -d --build`. Same command user-data runs,
  so first-boot and later deploys never conflict.
- **Application / Deployment group** — CodeDeploy's grouping: application `lexis`,
  deployment group `lexis-dg` (targets boxes tagged `Name = lexis`, in-place, all-at-once).

### App runtime (already in place before this session)
- **Docker / docker compose** — containers for `db` (Postgres), `vocab-service`,
  `api-gateway`, and the profiled `frontend`. `docker-compose.prod.yml` is the prod
  definition.
- **Compose profile (`web`)** — gates the frontend container so the default API-only
  deploy stays light on 1 GB RAM.
- **Swap file** — 2 GB of disk used as overflow RAM so memory-hungry image builds don't
  get OOM-killed on the free-tier box.

---

## The three "silent skip" traps (memorize these)

A box is a valid CodeDeploy target **only** if all three are true. Miss one and the
deploy reports 0 instances or times out — no loud error:

1. CodeDeploy **agent** installed and running (baked into the AMI).
2. **`lexis-ec2-role`** IAM role attached (set in the Launch Template).
3. **`Name = lexis`** tag on the instance (set in the Launch Template, applied to Instances).
