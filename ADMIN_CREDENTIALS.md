# SRIBEESonline — Admin Portal Credentials

> **Status**: development / QA credentials.
> **⚠️** Change every password before this touches production.

Everything below is created by `fastapi_backend/migrations/026_seed_full_dataset.sql`,
which runs on every deploy. There is no separate seed script to remember — if an
account here does not work, that migration did not run.

---

## Admin accounts

One account per role, plus a manager for each of the five seeded branches.
**Password for all of them: `Admin@123`**

| Email | Role | Branch scope |
|---|---|---|
| `superadmin@sribeesonline.lk` | Super Admin | Every branch |
| `manager.colombo@sribeesonline.lk` | Branch Manager | Colombo Main (CMB) |
| `manager.kandy@sribeesonline.lk` | Branch Manager | Kandy City (KDY) |
| `manager.galle@sribeesonline.lk` | Branch Manager | Galle Fort (GLE) |
| `manager.negombo@sribeesonline.lk` | Branch Manager | Negombo Beach (NGB) |
| `manager.kurunegala@sribeesonline.lk` | Branch Manager | Kurunegala Hub (KUR) |
| `marketing@sribeesonline.lk` | Marketing Manager | Colombo Main (CMB) |
| `inventory@sribeesonline.lk` | Inventory Manager | Colombo Main (CMB) |
| `support@sribeesonline.lk` | Customer Support | Negombo Beach (NGB) — the only branches with live order volume are NGB and KUR |

A Branch Manager is always assigned a branch. The server rejects a scoped admin
with no branch, so such an account could sign in and then fail on every
branch-scoped screen.

## Partner accounts (professional referral team)

Created by `028_seed_partners.sql`. **Password: `Partner@123`**

| Email | Role in the tree | Code |
|---|---|---|
| `partner.lead@sribeesonline.lk` | Recruiter — earns level 2 under the agents | `SBPLEAD01` |
| `partner.agent1@sribeesonline.lk` | Agent | `SBAGENT01` |
| `partner.agent2@sribeesonline.lk` | Agent | `SBAGENT02` |
| `partner.agent3@sribeesonline.lk` | Agent | `SBAGENT03` |
| `partner.agent4@sribeesonline.lk` | Agent — **deactivated on purpose** | `SBAGENT04` |

Six demo customers are attached to the three active agents, so their orders
produce level-1 commission for the agent and level-2 for the recruiter.

## Customer accounts (mobile app)

`demo.customer01@sribees.test` … `demo.customer40@sribees.test`,
**password `Demo@1234`**. Created by `025_seed_demo_data.sql` with addresses,
order history, wallets, wishlists and referral links. The `.test` TLD is
reserved (RFC 2606) and can never resolve.

---

## Who can see what

Branch isolation is enforced **server-side** (`inject_branch_filter`), not by the
client. A Branch Manager receives only their own branch's rows however the UI
asks; a Super Admin sees the network and may narrow with `?branch_id=`.

| Role | Dashboard | Analytics | Products | Orders | Inventory | Marketing | Users / Branches |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| Super Admin | Network | Network | Full | Full | Full | Full | Yes |
| Branch Manager | Own branch | Own branch | View/Update | View/Update | View/Update | Banners | No |
| Marketing Manager | Yes | — | View | — | — | Full | No |
| Inventory Manager | Yes | — | Create/Update | — | Full | — | No |
| Customer Support | Yes | — | View | View/Update | — | — | No |

**Analytics is Super Admin and Branch Manager only.** `/admin/analytics/*` is
restricted server-side to those two roles, so the sidebar deliberately hides the
entry for everyone else rather than offering a page that can only answer 403.

---

## Running it locally

```bash
# 1. Backend (creates tables on first boot)
cd fastapi_backend
uvicorn app.main:app --reload --port 8000

# 2. Migrations + seed data, in filename order. This is exactly what the deploy
#    does, and the seed is what the admin panel and the E2E suite read.
for f in $(ls -1 migrations/*.sql | sort); do
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"
done

# 3. Admin panel — Vite proxies /api to :8000, so there is no CORS to configure
cd ../admin
npm run dev
```

Then sign in at http://localhost:5173/login.

### Verifying a deployment

```bash
# API-level: logs in, calls every analytics endpoint, checks the figures are
# real and agree with each other. This also runs automatically at the end of
# every backend deploy.
cd fastapi_backend
python scripts/smoke_test.py --base-url http://127.0.0.1:8000 \
  --email superadmin@sribeesonline.lk --password 'Admin@123'

# Browser-level: drives the real admin panel against the real backend.
cd admin
npm run build && npm run test:e2e
```

---

## Resetting the demo data

The seeds are idempotent — re-running them adds the missing rows and changes
nothing else. To start genuinely clean, drop the database, let the backend
recreate the tables on boot, then re-apply the migrations as above.

---

## Security notes

- Every account above shares `Admin@123`. That is acceptable only because this
  database holds no real users.
- Password policy: min 8 characters, with an uppercase, a lowercase, a digit and
  a symbol.
- The seeded `sessions`, `admin_sessions`, `email_verifications` and
  `password_resets` rows are **already expired and consumed**. They exist so
  those tables are not empty; none of them is a usable credential.
