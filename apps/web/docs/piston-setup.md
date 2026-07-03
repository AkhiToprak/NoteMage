# Piston setup (code_write execution) on Coolify

The `code_write` quiz editor runs student code through a self-hosted **Piston**
container. It's MIT-licensed — no commercial license needed. The public
`emkc.org` API is off-limits (token-gated, "no paid products" since 2026-02-15),
so we run our own container on the same Hetzner box, reachable only over
Coolify's internal Docker network. The web app finds it via one env var:
`PISTON_URL` (base URL, **no** `/api/v2` suffix — the client appends it).

Piston sends/needs **no auth token**, so the only thing protecting it is *not
publishing its port publicly*. Keep port 2000 internal + host-local.

## 0. Prereqs (SSH into the Hetzner box)

```
stat -fc %T /sys/fs/cgroup      # must print: cgroup2fs  (Piston needs cgroup v2)
df -h /                          # need a few GB free; all 8 runtimes are ~2-4 GB
```

If the first prints `tmpfs`, the host is on cgroup v1 — enable v2
(`systemd.unified_cgroup_hierarchy=1` in GRUB, reboot) before continuing.

## 1. Create the Piston service (Coolify → New Resource → Docker Compose, Empty)

Same Project + Server as the web app. Paste this compose, then Deploy:

```yaml
networks:
  coolify:
    external: true

services:
  piston:
    image: ghcr.io/engineer-man/piston
    container_name: piston
    restart: always
    privileged: true                    # isolate sandbox needs this
    ports:
      - "127.0.0.1:2000:2000"           # host-local only, for admin/install
    volumes:
      - piston-packages:/piston/packages
    tmpfs:
      - /piston/jobs:exec,uid=1000,gid=1000,mode=711   # exec flag is required
    networks:
      - coolify

volumes:
  piston-packages:
```

`privileged` + the `exec` tmpfs are both load-bearing — without them runs fail
with sandbox/permission errors. The named volume keeps installed runtimes across
restarts. Port is bound to `127.0.0.1` so it's reachable for admin but never
public.

## 2. Put the web app on the same network

Web app resource → **Networks** → enable **Connect to Predefined Network**
(`coolify`). Now the app resolves `http://piston:2000` by container name.

## 3. Install language runtimes

The base image ships zero languages. Install via the ppman CLI (it maps
`c++`→gcc, `javascript`→node, etc.). Run on the host (uses the host-local port):

The Piston container must already be deployed and running (Step 1) — `ppman`
talks to the live API at `127.0.0.1:2000`. Check with `docker ps | grep piston`.
The CLI has its own npm deps, so install them before running it:

```
docker run --rm --network host node:20-slim sh -c \
  "apt-get update -qq && apt-get install -y -qq git >/dev/null && \
   git clone -q https://github.com/engineer-man/piston /p && \
   cd /p/cli && npm install --omit=dev --no-audit --no-fund --loglevel=error && \
   node index.js ppman install python javascript typescript java c++ sqlite3 go rust"
```

Java/Rust/Go/C++ are the heavy ones — drop any you don't need (and narrow
`EXECUTABLE_CODE_LANGUAGES` in `packages/shared/src/quiz.ts` so the AI stops
generating them).

## 4. Point the web app at Piston

Web app → Environment Variables → add:

```
PISTON_URL=http://piston:2000
```

Redeploy the web app (env changes need a rebuild/restart to take effect).

## 5. Verify

```
curl -s http://127.0.0.1:2000/api/v2/runtimes | jq -r '.[].language' | sort -u
```

Should list python, javascript, typescript, java, c++, sqlite3, go, rust. Then
open a coding quiz in the app, hit **Run** on a `code_write` question — it
executes instead of showing "the code runner isn't available."

Confirm it's not publicly exposed: `curl http://<public-ip>:2000` from off-box
must refuse/time out.

## Notes

- Going live also closes audit finding **NM3-11**: while Piston was unconfigured,
  `code_write` submissions fell back to trusting the client's `passed` flag.
  Server-side re-execution now grades for real.
- If `http://piston:2000` doesn't resolve from the app, Coolify may have renamed
  the container — check `docker ps`, and either match `container_name` or add a
  `networks.coolify.aliases: [piston]` block to the service.
