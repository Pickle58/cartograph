# Cartograph manual

Sign in, paste a public TypeScript or JavaScript GitHub URL, and get a map of
it. Folders are boxes, imports are lines. Open a file for what it imports, what
imports it, and an explanation written from that file and its real neighbours.
Ask the repository a question and the chat agent looks the answer up on the
same graph.

Public repositories only. Every analysis belongs to the active Clerk
organization. Switch organization and you see that team's maps.

The product decisions behind this are in [project-doc.md](project-doc.md). This
file is how to run it.

## Using it

1. Sign in. The first account lands inside an organization without being asked
   to create one.
2. Paste a `https://github.com/owner/repo` URL and start the analysis.
3. When it finishes, open folders, select a file, and read the detail pane.
4. Ask a question in the chat panel. The agent answers from the parsed graph.

Invite someone through the organization switcher. Accepting the invitation
arrives at this app's sign-in page.

## Running locally

You need Node 22 or newer and [pnpm](https://pnpm.io). Two processes, two env
files: the Next app at the repo root, and the chat agent under
`cartagraph-agent/`.

```bash
pnpm install
# fill in .env.local (see Keys)
pnpm dev
```

In a second terminal:

```bash
cd cartagraph-agent
# fill in .env (see Keys)
npx mda dev
```

Open [http://localhost:3000](http://localhost:3000). `mda dev` listens on
`http://localhost:2024`, which the app already uses.

## Clerk

Identity and teams come from Clerk. Create an application, then set:

1. **Organizations** enabled, with membership required. A session without an
   active organization is a misconfiguration and the app fails loudly.
2. Under **Sessions → Customize session token**, add
   `"org_name": "{{org.name}}"`. The default token carries the organization id
   but not its name.
3. Sign-in methods you want (GitHub, Google, email). Those are dashboard
   settings, not environment variables in this repo.
4. Copy the publishable and secret keys into `.env.local` (see Keys).

The app already hosts `/sign-in` and `/sign-up`. Point Clerk at those paths
with the URL variables below. Without them, Clerk sends people to its hosted
Account Portal.

## Supabase

Clerk owns the session. Supabase verifies that token through its Clerk
third-party auth integration, then row-level security policies decide what each
request may see. The application never uses the Supabase secret key for that
path; the secret key would bypass the policies.

1. Create a Supabase project.
2. Enable Clerk as a third-party auth provider so `auth.jwt()` returns Clerk's
   claims (the active organization is `o.id`).
3. Copy the project URL and publishable key into `.env.local`.
4. Link the project and apply the migrations in
   [supabase/migrations](../supabase/migrations) in filename order
   (`supabase db push`).
5. Generate an `ANALYSIS_SIGNING_JWK` (see Keys) and put the private JWK in
   `.env.local`. Give Supabase the public half of that key so it can verify the
   short-lived analysis credential the chat agent uses. That credential names
   one organization and one analysis; it is not a Clerk session.

## LangChain and the chat agent

File explanations and role labels use the OpenAI client in this app, traced
with LangSmith. The chat panel is a separate LangChain agent under
`cartagraph-agent/`, built with `langchain` and Managed Deep Agents.

From `cartagraph-agent`, run `mda dev`. The agent:

- Defaults to `anthropic:claude-sonnet-5` (override with `MODEL`).
- Authenticates callers with a LangSmith API key.
- Reads analyses by calling this app's `/api/agent/snapshot` using
  `CARTOGRAPH_URL`.

Set `AGENT_URL` on the Next app only when the agent is not on
`http://localhost:2024`.

Explanations need `OPENAI_API_KEY`. Tracing needs `LANGSMITH_TRACING=true` and
`LANGSMITH_API_KEY`. Tracing off still lets explanations run; the detail pane
says so. Chat does not run without the LangSmith key, because the agent rejects
callers that do not present it.

## Keys

No real values below. Put secrets in the files named here and nowhere else in
the repo.

### App — `.env.local` (required to start)

Missing any of these stops `pnpm dev` before the first request.

```bash
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/
NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
ANALYSIS_SIGNING_JWK=
```

| Variable | Where it comes from |
| --- | --- |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | Clerk → API keys |
| Clerk `*_URL` variables | Paths this app already hosts; not secrets |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase → project API settings. Use the publishable key (the one that still goes through row-level security) |
| `ANALYSIS_SIGNING_JWK` | Generated locally. A P-256 private JWK with `alg` ES256 and a UUID `kid` |

Generate a signing key:

```bash
node -e "const {generateKeyPairSync,randomUUID}=require('node:crypto');const {privateKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'});const jwk=privateKey.export({format:'jwk'});jwk.kid=randomUUID();jwk.alg='ES256';console.log(JSON.stringify(jwk))"
```

Put the printed JSON on one line as `ANALYSIS_SIGNING_JWK`. Export the public
half (`kty`, `crv`, `x`, `y`, `kid`, `alg`, no `d`) for Supabase to verify
tokens signed with it.

### App — `.env.local` (required for model features)

| Variable | What fails without it |
| --- | --- |
| `OPENAI_API_KEY` | File explanations and AI role labels. The map still parses and draws |
| `LANGSMITH_API_KEY` | Chat (the app forwards this as `x-api-key`). Tracing also needs `LANGSMITH_TRACING=true` |
| `LANGSMITH_TRACING=true` | Turns tracing on when the LangSmith key is set |

### Agent — `cartagraph-agent/.env`

```bash
LANGSMITH_API_KEY=
ANTHROPIC_API_KEY=
CARTOGRAPH_URL=http://localhost:3000
# MODEL=anthropic:claude-sonnet-5
```

| Variable | Where it comes from |
| --- | --- |
| `LANGSMITH_API_KEY` | Same LangSmith key as the app. `mda dev` and the agent's identity check both use it |
| `ANTHROPIC_API_KEY` | Anthropic, for the default model. A different `MODEL` needs that provider's key instead |
| `CARTOGRAPH_URL` | This Next app, so tools can call `/api/agent/snapshot` |
| `MODEL` | Optional. Defaults to `anthropic:claude-sonnet-5` |

### Optional

| Variable | When |
| --- | --- |
| `AGENT_URL` | On the app, only when the agent is not at `http://localhost:2024` |
| `SUPABASE_SECRET_KEY` | Only for `pnpm analyze`, which has no Clerk session. The running app must not use it. Do not put this value in `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` |

`LANGSMITH_PROJECT`, `LANGSMITH_WORKSPACE_ID`, and `LANGSMITH_ENDPOINT` are
read by the eval scripts only. Skip them for getting started.

### Not a key in this repo

GitHub repository fetches use no token; only public repos are supported.
Sign-in with GitHub is a Clerk social connection in the Clerk dashboard, not an
environment variable here. Email sign-in needs no extra key.
