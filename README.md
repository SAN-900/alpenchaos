# AlpenChaos

AlpenChaos is an interactive, deterministic Solana consensus simulator. It lets users explore consensus scenarios, inject faults into a **simulated** network, inspect outcomes, and review saved replays. Its separate Live view reads public Solana RPC data for network observability.

> **Safety boundary:** fault injection and consensus experiments run in the simulator. The Live observer is read-only; it does not inject faults into Solana, submit transactions, or operate validators.

## Features

- Deterministic consensus scenarios and simulated network faults.
- Interactive single-player simulation and result inspection.
- Replay, score/leaderboard, and room features where enabled by the current deployment.
- Read-only Solana RPC observability, including cluster health, consensus-certificate status, and slot information.
- A TypeScript monorepo with a Next.js frontend, Bun/Hono API server, and shared simulation packages.

## Repository layout

```text
apps/
  web/                 Next.js frontend (port 3000)
  server/              Bun + Hono API and realtime server (port 3001)
packages/
  fault-injection/     Simulated fault models
  game-rules/          Simulation/game rules
  network-simulator/   Deterministic network model
  protocol-alpenglow/  Alpenglow consensus model
  protocol-legacy/     Legacy consensus model
  scenarios/           Scenario definitions
  shared/              Shared types and utilities
  simulation-core/     Simulation primitives
scripts/               Repository maintenance scripts
```

## Prerequisites

Install these tools before starting:

- Git
- Node.js 22 LTS or another version supported by the installed Next.js/toolchain
- pnpm (the package manager used by this workspace)
- Bun (runs the API server and provides `bun:sqlite`)

Check your installations:

```bash
node --version
pnpm --version
bun --version
```

If pnpm is not installed, enable Corepack where supported and activate pnpm, or install pnpm using its official installation instructions. Install Bun using the instructions at <https://bun.sh/docs/installation>.

## Quick start

### 1. Clone and install

```bash
git clone https://github.com/SAN-900/alpenchaos
cd alpenchaos
pnpm install --frozen-lockfile
```

### 2. Configure environment

The frontend currently defaults to `http://localhost:3001` when `NEXT_PUBLIC_API_URL` is unset. For local development, create `apps/web/.env.local`:

```dotenv
NEXT_PUBLIC_API_URL=http://localhost:3001
```

The server accepts these environment variables in the current source:

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3001` | HTTP and WebSocket server port |
| `DB_PATH` | `alpenchaos.sqlite` | SQLite database file path |
| `ALLOWED_ORIGINS` | empty, added to current built-in defaults | Comma-separated browser origins allowed by the server |

For local development, the web origin is `http://localhost:3000`. For a deployment, set `ALLOWED_ORIGINS` to the exact trusted frontend origins, separated by commas. Do not put secrets in `NEXT_PUBLIC_*` variables; they are exposed to browser code.


### 3. Start the API server

In terminal 1, from the repository root:

```bash
pnpm dev:server
```

The server listens on `http://localhost:3001` by default. The SQLite database is created at `DB_PATH` (default: `alpenchaos.sqlite`) relative to the server process's working directory.

### 4. Start the frontend

In terminal 2, from the repository root:

```bash
pnpm dev:web
```

Open <http://localhost:3000>.

If port 3000 or 3001 is already in use, find the owning process before stopping it:

```bash
ss -ltnp | grep -E ':3000|:3001'
```

Do not kill all Node.js or Bun processes indiscriminately; the process may belong to another project.

## Available commands

Run these from the repository root:

```bash
# Start development services
pnpm dev:web
pnpm dev:server

# Type-check workspace packages
pnpm typecheck

# Run package tests where a test script exists
pnpm test

# Build the frontend for production
pnpm --filter @alpenchaos/web build

# Run the built frontend (after building)
pnpm --filter @alpenchaos/web start
```

The server package currently defines `start` as `bun src/index.ts`. The frontend uses Next.js. The monorepo includes package-level test and typecheck scripts; individual packages may not all define both.

## Deploy the frontend on Vercel

1. Import this Git repository in Vercel and create a project.
2. Set **Root Directory** to `apps/web`. Keep the Next.js framework preset and let Vercel detect the build and output settings (`pnpm build`, `.next`).
3. Make sure the build can access files outside the root directory, since the web app imports workspace packages from `packages/`.
4. Deploy. The frontend's local simulations work without the API server.

Online arena, replay, leaderboard, and live-network API requests need a separately deployed API server; the current Bun/SQLite/WebSocket server is not part of the Vercel frontend deployment. Once that server is available, add `NEXT_PUBLIC_API_URL` in the Vercel project's **Environment Variables** (for example, `https://api.example.com`) and redeploy. The API server must allow the Vercel production/custom-domain origin via `ALLOWED_ORIGINS`. Do not use `localhost` for the deployed API URL.

For pnpm workspace installs, Vercel must use the repository's `pnpm-lock.yaml` and `pnpm-workspace.yaml`. If Vercel asks for an install command, use `pnpm install --frozen-lockfile`.

## API and realtime overview

The API server is implemented with Hono and Bun. The current app includes health, scenario, room, replay, and leaderboard routes, plus WebSocket handling. The exact enabled endpoints depend on the server code and configuration in the checked-out revision.

- HTTP API: `http://localhost:3001`
- Frontend: `http://localhost:3000`
- Multiplayer WebSocket path, if enabled: `/ws/match`
- Legacy session WebSocket path `/ws` and legacy `/sessions`

Useful local checks:

```bash
curl -i http://localhost:3001/health
curl -s 'http://localhost:3001/live?cluster=devnet'
```

The `/live` route is available only in revisions that include the Live observer. Its data comes from the configured public RPC integration and can be unavailable when the RPC endpoint is unreachable or does not support a queried method.


### Security

- [ ] Configure an explicit production `ALLOWED_ORIGINS` allowlist; remove development/test origins from production defaults.
- [ ] Apply per-IP HTTP rate limits and request-size limits.
- [ ] Cap concurrent WebSocket connections globally and per IP; validate origin and message schemas.
- [ ] Disable or remove unused legacy `/sessions` and `/ws` APIs after confirming no consumers remain.
- [ ] Add security headers to Next.js responses: Content Security Policy, `frame-ancestors`, `Referrer-Policy`, `X-Content-Type-Options: nosniff`; set `poweredByHeader: false`.
- [ ] Make production builds fail when `NEXT_PUBLIC_API_URL` is missing or invalid.
- [ ] Avoid trusting forwarded client-IP headers unless the service is behind a correctly configured trusted proxy.
- [ ] Review dependency vulnerabilities and secrets before each release.

### SQLite and data lifecycle

- [ ] Enable SQLite WAL mode, a suitable `busy_timeout`, and foreign-key enforcement.
- [ ] Add a retention policy for match action logs and replay data; avoid publishing unbounded or sensitive logs.
- [ ] Store the database on a persistent volume and document tested backup and restore procedures.
- [ ] Test migrations, retention, backup restoration, and behavior when the disk is full.

### Runtime reliability and observability

- [ ] Gracefully stop accepting new connections on `SIGTERM`, close sockets, and close SQLite after in-flight work completes.
- [ ] Add process-level handling for uncaught exceptions and unhandled rejections with a controlled shutdown policy; do not continue in an unknown corrupted state.
- [ ] Emit structured logs with request IDs and useful error context, without logging credentials or sensitive payloads.
- [ ] Add a readiness endpoint that checks the database, and include app version/commit metadata in health output.
- [ ] Document that in-memory rooms require a single server instance unless shared state and coordination are implemented.

### Release hygiene

- [ ] Pin the Node.js version (`.nvmrc` or equivalent), pnpm version (`packageManager`), Bun version, TypeScript and Vitest versions; eliminate conflicting package-level versions.
- [ ] Add CI for frozen install, typecheck, tests, frontend production build, dependency audit, and secret scanning.
- [ ] Add a Dockerfile and deployment instructions only after persistent database storage and shutdown behavior are configured.
- [ ] Keep `.env.example` synchronized with validated environment variables; never commit real `.env` files.
- [ ] Add an explicit license and contribution/security reporting guidance.
- [ ] Add Next.js `error.tsx`, `not-found.tsx`, favicon, `robots.txt`, sitemap and Open Graph metadata.
- [ ] Remove committed generated artifacts such as `*.tsbuildinfo`; ensure `.gitignore` excludes local databases, build output and secrets.
- [ ] Test a clean clone using the documented setup, then run typecheck, tests and production build before tagging a release.

## Architecture and deployment limitations

- The simulation models consensus behavior; it is not a production validator client or a multi-validator Solana cluster.
- Live mode is observability only. Do not use it to send transactions or attempt to disrupt a real network.
- Rooms held in process memory do not automatically survive a server restart and do not support horizontal scaling without shared room state/coordination.
- SQLite durability depends on a persistent filesystem and a tested backup plan.
- Unauthenticated display names are not verified identities; leaderboard entries can be spoofed unless authentication or another verification mechanism is added.

## Troubleshooting

### `EADDRINUSE` on port 3000 or 3001

A process is already listening on that port. Identify it first:

```bash
ss -ltnp | grep ':3000'
ss -ltnp | grep ':3001'
```

If it is an old AlpenChaos process, stop that specific PID, then restart the corresponding service. Do not terminate unrelated browser or development processes.

### Frontend loads but API requests fail

1. Confirm the API server is running on port 3001.
2. Check `apps/web/.env.local` and `NEXT_PUBLIC_API_URL`.
3. Check the server's `ALLOWED_ORIGINS` value.
4. Inspect browser developer tools and the server logs for the exact failed route/status.

### SQLite file appears in an unexpected location

`DB_PATH` is resolved relative to the server process's working directory unless an absolute path is provided. Use an absolute path in deployments and ensure the service user can write to its directory.

## Contributing

1. Create a focused branch.
2. Make a small, reviewable change.
3. Run `pnpm typecheck`, `pnpm test`, and `pnpm --filter @alpenchaos/web build` where applicable.
4. Document any new environment variables and operational behavior.
5. Never commit secrets, private keys, production database files, or user data.

## License

No license is declared by this README. Add a `LICENSE` file and choose the appropriate license before publicly distributing or accepting external contributions.
