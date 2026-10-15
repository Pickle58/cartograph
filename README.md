# Cartograph

A local app that reads a public GitHub repository and draws it as a dependency
map. Folders as boxes, imports as lines. Everything on screen comes from really
parsing the code.

## Get started

How to run it, including Clerk, Supabase, the chat agent, and every key those
processes need: **[docs/manual.md](docs/manual.md)**.

```bash
pnpm install
# configure .env.local — see the manual
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). Chat needs a second
process under `cartagraph-agent/`; the manual covers that.

## Docs

- [docs/manual.md](docs/manual.md) — setup and usage
- [docs/project-doc.md](docs/project-doc.md) — product decisions
- [docs/specs/](docs/specs/) — phase specs
