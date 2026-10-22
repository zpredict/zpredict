# Contributing

## Workflow

1. **Issue first.** Labels: one `type:`, the `area:`s it touches, one `priority:`, plus `privacy` if it changes what anyone can learn.
2. **Branch** off `main`: `feat/…`, `fix/…`, `refactor/…`, `docs/…`, `chore/…`.
3. **Small commits**, [Conventional Commits](https://www.conventionalcommits.org/): `feat(core): …`.
4. **PR** with `Closes #n`, the issue's labels, what changed, and test evidence. Add a comment saying where review should focus.
5. Merge commits only; branches auto-delete.

## Checks

CI (`.github/workflows/ci.yml`) runs the same checks on every PR, and `main` requires it to pass. A merge to `main` runs CI again, then deploys through Coolify (`deploy.yml`).

The Husky pre-commit hook runs Biome on staged files and `cargo fmt --check`. Before you open a PR:

```sh
cargo fmt --all && cargo clippy --all-targets -- -D warnings && cargo test
pnpm check && pnpm build && pnpm test
```

## Layout

`apps/` holds anything that runs or deploys. `packages/` holds the libraries those apps share. Cargo workspace members are listed explicitly.

**Rust crates**
- `lib.rs` is crate docs, constants, `mod` and `pub use` only.
- One concept per module (`order.rs`, `clearing.rs`, …). Backends go under `backend/`; the crate's error type goes in `error.rs`.
- Unit tests sit next to the code. Cross-crate and cross-language tests go in `tests/`, with fixtures in `testdata/`.

**Astro (`apps/landing`)**
- `layouts/` for the page shell, `components/` with one section per file and scoped styles, `data/` for typed content, `scripts/` for client code.
- `styles/` holds tokens and the reset only.

**Next.js (`apps/web`)**
- `app/` routes only compose.
- `components/ui/` for primitives, `components/<feature>/` for features.
- `hooks/` for data hooks; `lib/` for non-React logic and config.

**Everywhere**
- One component or concept per file; keep files under ~250 lines.
- No speculative abstractions.

## Privacy rules

A leak disqualifies the project, so every PR keeps to these:
- No transparent addresses anywhere.
- No third-party requests from the frontends.
- No analytics, no IP logs.
- Never send two order shares to the same origin.
- Never commit keys or seeds.

Check against the leak checklist in [DESIGN.md](DESIGN.md#leak-checklist-from-the-research).
