# Reuse map: warnetech/warnetech-core (MIT, © 2026 Warnetech; clone at fdb7b49)

Status: research only. No code copied yet.

| Need (PRD) | Existing in warnetech-core | Plan |
|---|---|---|
| Phase 1 local model on phone | `providers/llamacpp.py` (llama-server, OpenAI protocol, no key), `scripts/termux_install.sh` (arm64 Termux install), `docs/OLLAMA.md` | Reuse directly |
| Phase 1 eval gate | `custom/evals.py`, `config/evals/custom.yaml`, `tests/test_custom_models.py` | Reuse; fill with our 50-question set |
| Run mode for Linux assistant | `interpreter/policy.py` (ask / dry-run / auto; default approver denies, fails closed), `interpreter/executor.py`, `interpreter/audit.py`, `interpreter/workspace.py` | Reuse; add command block-list from PRD §15.3 |
| Memory / learned habits | `memory/sqlite.py`, `migrations/0001_warnetech_memory.sql` | Reuse for habit profile (PRD D8) |
| Knowledge base retrieval | `memory/rag_store.py`, `memory/ingest.py` | Evaluate; likely reuse for KB spans with citations |
| Routing / fallback to hosted models | `routing/*`, `providers/*` | Keep as optional fallback (PRD §4 option A/C) |
| Service + UI | `service/app.py`, `service/warnetech_ui.html` | Compare with Worker UI plan; prefer Worker for public URL |
| From-scratch training | `custom/builder.py`, `custom/modelfile.py`, `docs/CUSTOM_MODELS.md` | Phase 4 starting point |
| Deploy | `deploy/kubernetes/*`, `Dockerfile.hf`, `docs/DEPLOY.md` | Not needed for Cloudflare Worker path |

## Recommendation
Depend on warnetech-core as a pinned package (git tag or commit) instead of copying files. Copy only config and evals. Keep our Worker and KB layer in this repo.

## Not reused
- `vendor/claude-code-assist` (separate MIT project inside core); not needed.
- Nemotron / NVIDIA providers: out of scope per PRD §14.

## Open questions
- Confirm the pin: commit `fdb7b49` (main, PR #14).
- Confirm dependency over copy.
