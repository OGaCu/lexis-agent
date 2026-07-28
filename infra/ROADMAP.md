# Lexis on AWS — improvement roadmap

A learning ladder from a solution-architect's chair. Today's setup is a **single
free-tier EC2 box** running Postgres + services in Docker, deployed by CodeDeploy. That is
the correct place to start — cheap, simple, one thing to reason about. This doc is the
*next* rungs, ordered so each one teaches a durable fundamental before the one after it
needs it.

**Assumption:** this stays a learning project on/near the free tier for now, with an eye
toward "could become real." Items are ordered by **fundamentals first**, not by flashiness.
If your actual goal is different (ship to real users soon? keep it a personal toy forever?),
tell me and I'll re-prioritize — that single answer changes half the ordering below.

Each item: **what · why it matters · rough effort · cost · do-it-when.**

---

## Tier 0 — Do these next (cheap, high-leverage, teaches the core lesson)

### 0.1 Stop losing your database — EBS snapshots
- **What:** schedule automatic snapshots of the instance's EBS volume (AWS Backup, or a
  Data Lifecycle Manager policy). Today, **Terminate deletes your DB**; only `db/seed.sql`
  survives in git.
- **Why:** durability is the first real-world fundamental. A backup you didn't test isn't a
  backup — so also practice a *restore* once.
- **Effort:** 30 min. **Cost:** cents/month for a small volume. **When:** now.

### 0.2 Get secrets out of plaintext `.env` — SSM Parameter Store
- **What:** move `ANTHROPIC_API_KEY` (and later the DB password) into **SSM Parameter
  Store** (SecureString) or **Secrets Manager**. Have `start.sh`/user-data read them at
  deploy time instead of a hand-edited `.env`.
- **Why:** teaches the IAM-role → fetch-secret pattern you'll use forever. Removes the
  "SSH in and paste the key" manual step after every relaunch.
- **Effort:** half a day. **Cost:** Parameter Store standard = free; Secrets Manager ≈
  $0.40/secret/mo. **When:** right after backups. Start with Parameter Store (free).

### 0.3 A real budget alarm
- **What:** AWS Budgets → a $1–$5 monthly budget with email alert (partly covered in
  `DEPLOY_EC2.md`).
- **Why:** the cheapest insurance against a surprise bill while you experiment.
- **Effort:** 10 min. **Cost:** free. **When:** today.

---

## Tier 1 — Ways to store data on AWS (the storage ladder)

You asked specifically about storage. Here is the progression, weakest-coupling to
strongest-managed. **Learn them in this order** — each explains why the next exists.

| Option | What it is | Good for | Trade-off | Where you are |
|---|---|---|---|---|
| **EBS volume** | the box's virtual disk | anything on one box | dies with the instance unless snapshotted; tied to one box | ← you are here (Postgres data lives here) |
| **EBS snapshots** | point-in-time backups of that disk | cheap durability | restore is manual; not "live" HA | Tier 0.1 |
| **S3** | object storage (files, blobs) | DB dumps, seed backups, user uploads, static assets | not a database — no queries | recommended next (1.1) |
| **RDS for PostgreSQL** | *managed* Postgres | your actual app DB, once data matters | costs more than in-container; leaves free tier eventually | the big one (1.2) |
| **DynamoDB** | managed NoSQL key-value | high-scale simple lookups | wrong shape for your relational vocab data | skip for now |

### 1.1 S3 for backups & assets (do before RDS)
- **What:** an S3 bucket. Push your `pg_dump` / `dump-seed.sh` output there on a schedule
  instead of only committing to git. Later: serve the frontend's static build from it.
- **Why:** S3 is the workhorse of AWS — cheap, durable (11 nines), versioned. Learning
  bucket + IAM policy + lifecycle rules is foundational.
- **Effort:** half a day. **Cost:** pennies. **When:** alongside Tier 0 backups.

### 1.2 Move Postgres to RDS (the graduation step)
- **What:** replace the `db` container with a managed **RDS PostgreSQL** instance. Point
  `DATABASE_URL` at the RDS endpoint; delete the `db` service from compose.
- **Why this is the real lesson:** separating **stateful** data from **stateless** compute.
  Once the DB lives in RDS, your EC2 box becomes disposable — terminate and relaunch freely,
  the data stays. Automated backups, point-in-time restore, and patching come for free.
- **Trade-offs:** `db.t3.micro` is free-tier-eligible for 12 months, then ~$15/mo; a
  running DB you can't just Stop-for-free like EC2. Put RDS in a **private subnet**, reach
  it only from the app's security group.
- **Effort:** 1–2 days (networking is the learning curve). **When:** when losing data would
  actually hurt, or when you want relaunches to stop touching data.

---

## Tier 2 — Make it a "real" service

### 2.1 HTTPS + a domain name
- **What:** register a domain (Route 53), put an **Application Load Balancer** in front with
  a free **ACM** TLS cert, terminate HTTPS there. Kills the `http://<IP>:8000` era and the
  "IP changed, UI broke" problem for good.
- **Why:** TLS, DNS, and load balancers are three fundamentals in one project.
- **Effort:** 1 day. **Cost:** domain ~$12/yr; ALB ≈ $16/mo (not free tier — the main
  reason to delay). **When:** when you want a shareable URL.

### 2.2 Offload builds — CodeBuild + ECR
- **What:** build images in **CodeBuild**, push to **ECR**, have the box `pull` instead of
  `build`. Already sketched in `AWS-native-CICD.md` → "Optional later."
- **Why:** the 1 GB box struggles to build the Next.js image (that's why the swap file
  exists). Moving builds off-box makes deploys faster and the box smaller.
- **Effort:** 1 day. **Cost:** CodeBuild has a free tier; ECR storage pennies. **When:**
  when on-box builds get annoyingly slow or OOM.

### 2.3 Centralize logs — CloudWatch
- **What:** ship container logs to **CloudWatch Logs**; add one alarm (e.g. instance CPU or
  a failed health check).
- **Why:** `docker logs` over SSH doesn't scale past one box. Observability is a
  fundamental you'll want before, not after, the first incident.
- **Effort:** half a day. **Cost:** small free tier. **When:** anytime.

---

## Tier 3 — When one box isn't enough

> You already have an `infra/ecs/` directory — an alternate, container-orchestrated path.
> This tier is where it pays off. Don't jump here early: ECS adds real complexity and cost
> that a learning project doesn't need yet.

### 3.1 Containers on ECS/Fargate
- **What:** run the services as ECS tasks (Fargate = no servers to manage) behind the ALB,
  with the DB on RDS. Rolling deploys, self-healing, horizontal scale.
- **Why:** the industry-standard way to run containers on AWS without babysitting an
  instance. Natural sequel once compute is stateless (post-RDS).
- **Effort:** several days. **Cost:** leaves free tier. **When:** when you need >1 box,
  zero-downtime deploys, or auto-scaling — or purely to learn ECS deliberately.

### 3.2 Infrastructure as Code — Terraform or CloudFormation
- **What:** stop clicking in the console. Describe the AMI, launch template, IAM roles,
  security groups, RDS, and pipeline as **code** you can version and recreate.
- **Why:** the capstone fundamental. Everything you clicked this session becomes
  reproducible and reviewable. Do it once you understand *what* you're automating — which is
  exactly why it's last, not first.
- **Effort:** ongoing. **Cost:** free (the tools). **When:** once the console setup stops
  changing shape and you want it repeatable.

---

## Suggested path (if you just want an order)

1. Budget alarm + EBS snapshots + restore drill (Tier 0) — a weekend.
2. Secrets → Parameter Store (0.2) and S3 backups (1.1) — a weekend.
3. Postgres → RDS (1.2) — the graduation step; take your time.
4. HTTPS + domain (2.1) when you want to share it.
5. CodeBuild/ECR (2.2) and CloudWatch (2.3) as pain demands.
6. ECS (3.1) + Terraform (3.2) when you outgrow one box or want to learn them on purpose.

Each rung teaches one fundamental and leaves you with a working system. Resist skipping
ahead — RDS before backups, or ECS before IaC, just moves the learning cliff, it doesn't
remove it.
