# PRD: warnetech-llm — a personal LLM that runs on a phone

Status: **Draft for review** · Owner: dev.warnetech · Repo: `warnetech/warnetech-llm` · Target URL: `warnetech-llm.warnetwork.cloud`

---

## 1. Summary

Run a language model on a Samsung Galaxy S23 Ultra inside Termux → proot Debian, serve it with llama.cpp, and expose a chat UI on a Cloudflare Worker at `warnetech-llm.warnetwork.cloud`. The Worker is the front door; the phone does the thinking.

Build it in phases. Phase 1 is a quick win that needs no new code: a working local model on the phone, benchmarked. Each later phase adds one capability.

---

## 2. Problem and outcome

You had a chat UI on Cloudflare backed by hosted models. The backups and database were deleted and you want to own the model, not rent it. You want:

1. A model that runs on your own hardware, offline-capable, with no per-token bill.
2. The largest model the phone can run comfortably.
3. Access from a browser at a stable URL.
4. Eventually, a model whose weights and training you control (from scratch).

**Outcome we are designing for:** you open `warnetech-llm.warnetwork.cloud` on any device, chat with a model that runs on your phone, and can later swap in a model you trained yourself.

---

## 3. Constraints (measured from your brief, not yet benchmarked)

| Constraint | Value | Source |
|---|---|---|
| Device | Samsung Galaxy S23 Ultra | your brief |
| RAM available to the model | ~5 GB | your brief |
| Storage free | ~250 GB (50% of 500 GB) | your brief |
| Runtime | Termux → proot Debian, CPU only (no usable GPU path in proot) | research (§9) |
| Public URL | `warnetech-llm.warnetwork.cloud` on zone `warnetwork.cloud` | your brief; zone must be confirmed in the new account (§10) |

**Memory budget (estimate from published file sizes):**

| Model (GGUF) | Weights at Q4_K_M | Fits 5 GB with room for context? |
|---|---|---|
| Qwen3.5-0.8B / 2B | < 1.5 GB | Yes, easily |
| **Qwen3.5-4B** | **2.74 GB** (published size) | **Yes, ~2 GB headroom for KV cache, runtime, Termux** |
| Qwen3.5-9B | ~5+ GB (estimated by scaling from 4B; not checked against a published file) | No — too close to the limit |
| 7–8B class (Llama/Qwen) | ~4.5–5 GB | Not reliably |

**The honest answer to "highest parameter count possible": about 4B at 4-bit.** A 9B model might load at aggressive quantization, but it will leave no headroom and Android's low-memory killer may stop Termux. We should test 9B only as a stretch goal in Phase 2 and only if 4B works first.

**Speed is unknown.** I did not find a published tokens-per-second figure for the S23 Ultra in proot. Phase 1's first job is to measure it with `llama-bench` and record the number in this document.

---

## 4. "Built from scratch" — the decision that shapes everything

Two readings of "from scratch" are possible, and they produce very different projects:

| Option | What it means | Cost | Quality ceiling on a phone |
|---|---|---|---|
| **A. Serve an open model you choose, own the stack** | Your code, your repo, your UI, your deployment, your data. Weights come from a published model. | Free | Highest (4B today) |
| **B. Train your own model from scratch** | Weights come from your own training run on rented cloud GPUs. | See table below | Much lower at equal size |
| **C. Both (recommended)** | Start with A for a working product; build B as a separate track that eventually replaces the weights. | Phase 4 only | Starts at A; B is an experiment that must beat the baseline on your own evals to replace it |

**Compute estimates for option B** (my arithmetic: training FLOPs ≈ 6 × params × tokens, with 20 tokens per parameter as a compute-optimal rule; GPU price taken from nanochat's stated ~$24/hour for an 8×H100 node):

| From-scratch size | Tokens (20/param) | Rough compute | Rough cloud cost |
|---|---|---|---|
| ~124M (GPT-2 small class) | ~2.5 B | a few GPU-hours on one H100 | roughly $15 on a single GPU (order of magnitude); nanochat reports GPT-2-capability for ~$73 on 8×H100 in ~3 hours |
| ~1B | ~20 B | ~1.5 days on 8×H100 | ~$800–$1,000 |

These are order-of-magnitude estimates, not quotes. A 1B model trained from scratch on a modest token budget will likely be **worse** than the 4B distilled/fine-tuned open model on general chat. Option B is worth doing for learning and for a model fine-tuned to a narrow job, not as a general-purpose replacement.

**Decision needed (see §12, D1).**

---

## 5. Users and use cases

- **Primary user: you**, chatting from a phone browser or laptop.
- Use cases for v1: general Q&A, drafting, summarising pasted text, offline-capable chat on the phone itself.
- Not in v1: multi-user, public signup, file uploads, voice, tool calling, image input.

---

## 6. Architecture

```
Browser (any device)
   │  HTTPS
   ▼
Cloudflare Worker  warnetech-llm.warnetwork.cloud        ← Phase 2+
   • serves chat UI (static assets)
   • POST /api/chat → proxies SSE stream
   │  HTTPS + Cloudflare Access service token
   ▼
Cloudflare Tunnel (cloudflared, running in Debian proot on the phone)
   │  localhost
   ▼
llama-server  (llama.cpp, OpenAI-compatible API, GGUF model, CPU)   ← Phase 1
```

Phase 1 skips the Worker entirely: `llama-server` ships a built-in web UI, reachable on the phone's localhost, and can be tunnelled for a quick remote test.

**Why this shape:** Workers cannot load a GGUF file. Workers AI only runs catalog models, and I found no public path to upload custom weights (§9). So the Worker is the UI and router, and the phone is the inference engine. This is the main trade-off: **the app is only up when the phone is on, charging and connected.**

**Why Access in front of the tunnel:** the phone's API must not be public. A Cloudflare Access service token lets only the Worker call it (Access supports service tokens via `CF-Access-Client-Id` / `CF-Access-Client-Secret` headers, per Cloudflare docs).

---

## 7. Phases

Each phase has acceptance criteria. Do not start phase N+1 until N's criteria pass.

### Phase 1 — Quick win: local model on the phone (no new code)

**Scope**
- Install Termux (from F-Droid or GitHub, same signing source as all Termux plugins).
- Install proot-distro Debian, or use the existing proot Debian.
- Install llama.cpp: `pkg install llama-cpp` in Termux, or build from `ggml-org/llama.cpp` in Debian.
- Download Qwen3.5-4B Q4_K_M (`unsloth/Qwen3.5-4B-GGUF`, file `Qwen3.5-4B-Q4_K_M.gguf`, published size 2.74 GB). Verify licence on the model card before use.
- Run `llama-server -m <model> -c 4096 --host 127.0.0.1 --port 8080`.
- Run `llama-bench` and record: tokens/s prompt, tokens/s generation, peak RSS.

**Acceptance**
- [ ] Model loads and answers a prompt from the phone's browser at `http://127.0.0.1:8080`.
- [ ] Recorded numbers in this doc: generation tokens/s and peak memory for 4B and, if it fits, 2B.
- [ ] Runs for 30 minutes of chatting without the process being killed.
- [ ] A short note in `docs/` on the exact install steps that worked.

**Fallback:** if 4B is too slow (below ~3 tok/s) or unstable, ship 2B as the default and keep 4B as an option.

### Phase 2 — Public URL and chat UI on Cloudflare

**Scope**
- New repo layout: `src/index.ts` (Worker), `public/` (chat UI), `wrangler.jsonc`, `.github/workflows/deploy.yml`.
- Worker: serves `public/`, exposes `POST /api/chat`, forwards to the phone's tunnel origin, passes the SSE stream through.
- `cloudflared` tunnel on the phone, with a named hostname (e.g. `llm-origin.<zone>`), protected by a Cloudflare Access app and a service token.
- Routes: `warnetech-llm.warnetwork.cloud` (custom domain).
- Secrets via `wrangler secret put`: `ORIGIN_CF_ACCESS_CLIENT_ID`, `ORIGIN_CF_ACCESS_CLIENT_SECRET`. Never in `vars`, never in git.
- Health check: `GET /api/health` returns model name and origin reachability.
- Clear "phone offline" state in the UI (not a generic error).
- Tests: Worker unit tests for the proxy (mock origin); no tests that assert exact model text.

**Acceptance**
- [ ] `https://warnetech-llm.warnetwork.cloud` loads from a browser on another network.
- [ ] A message round-trips and streams tokens into the UI.
- [ ] Without the service token, the origin returns 403 (verified with curl).
- [ ] With the phone asleep, the UI shows "offline" within 5 seconds.
- [ ] GitHub Actions deploy on push to `main` succeeds.

**Stretch (only if 4B passed Phase 1):** benchmark Qwen3.5-9B Q3/Q4 for memory and speed. Keep only if it stays up for 30 minutes.

### Phase 3 — Accounts, history and safety

**Scope**
- Chat history in D1 (new database — the old database id must be removed from the config; the old data is gone).
- Login. **Use a proven auth provider** (Cloudflare Access for a single owner, or Auth.js/Clerk if others need access). Do not copy the hand-rolled session code from the old project as-is.
- Rate limiting per user at the Worker.
- Retention job (cron) for old messages.

**Acceptance**
- [ ] Unauthenticated `/api/chat` returns 401.
- [ ] Chat history survives a page reload and is per-user.
- [ ] Rate limit returns 429 above the agreed threshold.

### Phase 4 — From-scratch model track (option B)

**Scope**
- Separate directory `training/` (PyTorch, nanochat-style single-file trainer as the starting point).
- Train a small model (start at ~124M) on a public text corpus with a fixed eval set built from your own prompts.
- Export to GGUF with llama.cpp's conversion script, quantise, and load on the phone with the same `llama-server` setup.
- Eval gate: the from-scratch model must beat the Phase 1 baseline on your eval set before it replaces the default. Record the score before and after.
- Compute runs on rented GPUs, not the phone. Budget approval required before any paid run (§12, D2).

**Acceptance**
- [ ] One from-scratch model trained end to end, exported to GGUF, and loaded by `llama-server` on the phone.
- [ ] Eval score recorded for both models on the same set, in the repo.

### Phase 5 — Optional, not scheduled

- Tool calling, retrieval over your own files, voice input, a second model for comparison, scheduled nightly eval runs.

---

## 8. Requirements

**Functional (v1 = Phases 1–2)**
- F1: Serve one GGUF model via OpenAI-compatible API on the phone.
- F2: Chat UI at the target URL with streaming responses.
- F3: Show online/offline state of the phone origin.
- F4: Model is selected by config, not hard-coded in the UI.

**Non-functional**
- N1: Peak memory under 4.5 GB during generation (leaves margin under the 5 GB budget).
- N2: First token under 5 s for a 200-token prompt on the S23 Ultra (target; to be measured in Phase 1; if missed, report it and lower the model size before changing the target).
- N3: No model or secret in git. Model files stay on the phone and are referenced by path.
- N4: Latest stable versions of llama.cpp, wrangler and the Workers runtime at build time (verify the version when building; do not pin from memory).

---

## 9. Research — existing tools and prior art

What already exists, and whether we should reuse it:

| Area | Option | Verdict | Evidence |
|---|---|---|---|
| On-device runtime | **llama.cpp** (MIT, `ggml-org/llama.cpp`) | **Use.** Mature CPU path for ARM, GGUF format, `llama-server` OpenAI-compatible API, built-in web UI | github.com/ggml-org/llama.cpp |
| Termux install | `pkg install llama-cpp` (Termux repo), or build from source with cmake | **Use** the package for Phase 1; build from source if it lags | jonathansblog.co.uk Termux guide |
| Runtime alternative | **Ollama** (`pkg install ollama`, works in proot) | Viable, easier UX, adds a daemon and its own model store. Not chosen for v1 because llama.cpp gives direct control and `llama-bench` | nkaushik.in Ollama-in-Termux guide |
| Runtime alternatives | MediaPipe LLM Inference, ExecuTorch (+ LiteRT-LM), MLC LLM | Android-native, better for an APK. Not for us: we want a server on Linux inside proot | Arm KleidiAI/MediaPipe learning path; allthingsopen ExecuTorch talk |
| Model — default | **Qwen3.5-4B** (Apache 2.0 per family; **verify on model card**) | **Use as Phase 1 default** | unsloth/Qwen3.5-4B-GGUF, Q4_K_M 2.74 GB |
| Model — alternatives | Qwen3.5-2B / 0.8B; **Gemma 4 E4B** GGUF (`unsloth/gemma-4-E4B-it-GGUF`); SmolLM3-3B; Phi-4-mini 3.8B | Benchmark 2 of these in Phase 1 against your own prompts | Qwen3.5 small series (0.8B–9B, March 2026); Gemma 4 family (April 2026) |
| Model — size guidance | Qwen3.5-9B is the next step up | Stretch only (§7 Phase 2) | — |
| Hosting | **Cloudflare Workers** + static assets | **Use** for UI and proxy | your existing project |
| Hosting — inference | Workers AI catalog | Keep as a **fallback** option, not the product. Catalog churns: the May 2026 changelog deprecated many models; the model id in the old project (`@cf/meta/llama-3.3-70b-instruct-fp8-fast`) was not on the list I read, but verify before reuse | developers.cloudflare.com/workers-ai/changelog |
| Hosting — custom weights | Workers AI custom model upload | **Not found.** Do not plan around it | Workers AI docs and changelog |
| Exposing the phone | **Cloudflare Tunnel** (`cloudflared`) + **Access service tokens** | **Use.** Phone stays private; only the Worker can call it | developers.cloudflare.com/tunnel; Access service tokens docs |
| Exposing the phone (alt) | Quick tunnel (`trycloudflare.com`) | Phase 1 testing only. Random URL, no auth | Cloudflare Pages preview docs |
| Training from scratch | **nanochat** (Karpathy, single-file pipeline, `--depth` dial) | **Use as the Phase 4 starting point.** Reports GPT-2-class training for ~$73 on 8×H100 in ~3 h (Jan 2026 discussion #481) | github.com/karpathy/nanochat |
| Training from scratch (alt) | nanoGPT, modded-nanoGPT | Reference only | — |
| Chat UI | Open WebUI, SillyTavern | Heavier than needed; llama.cpp's built-in UI covers Phase 1 | — |
| Prior art (your repo) | `tewartech-node/warnetwork-llm` — Workers AI chat app with auth, D1, R2, optional NVIDIA "Deep Think" | Reuse **patterns** (SSE reshaping, Worker routing, deploy workflow). Do not copy code blindly: it hard-codes the old D1 id and the `servtech` names, and its auth is hand-rolled | your zip, read in full |

**Gaps in the research I could not close:**
- No public S23 Ultra tokens/s figure for these models in proot. Measure in Phase 1.
- Qwen3.5 and Gemma 4 licences were not read from the model cards in this pass. Check before downloading.
- Workers AI model catalog changes often; re-check the model id at build time.

---

## 10. Migration from the old project

- Start a **fresh** repo layout; copy patterns, not files.
- Remove from the new config: old D1 `database_id`, old R2 bucket name, `servtech` names, the `servtech.warnetwork.cloud` route.
- Your old database and backups were deleted, so there is no data to migrate.
- Confirm the zone `warnetwork.cloud` exists in **this** Cloudflare account before Phase 2 (the old config assumed it did in the old account).
- Create the GitHub secret `CLOUDFLARE_API_TOKEN` for the deploy workflow.

---

## 11. Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | Android kills Termux or the llama process under memory pressure | High | High | Use 2B/4B; `termux-wake-lock`; keep other apps closed; monitor RSS |
| R2 | Phone sleeps or loses network → site unavailable | High | Medium | Clear offline state (F3); keep phone on charger; accept as a known limit of the design |
| R3 | Thermal throttling makes generation slow over long chats | Medium | Medium | Measure in Phase 1 over 30 min; shorter context default |
| R4 | Model licence restricts your use | Low | High | Check model card before download (Phase 1 acceptance) |
| R5 | Workers AI or tunnel product changes | Medium | Low | Pin versions at build time; keep model config-driven |
| R6 | From-scratch model worse than baseline | High | Low | Eval gate in Phase 4; baseline stays default |
| R7 | Exposed origin abused | Medium | High | Access service token; never expose llama-server directly |
| R8 | Cloud GPU spend overruns | Medium | Medium | Budget cap and approval before each paid run (D2) |

---

## 12. Decisions needed from you

These block the phases marked. Defaults are what I will use if you do not choose.

- **D1 — "From scratch" meaning** (blocks Phase 4). *Default: option C (serve an open model now; train your own as a separate track).*
- **D2 — Cloud GPU budget for Phase 4** (blocks Phase 4 only). *Default: none approved. Phase 4 starts at ~124M, under ~$20, after you approve.*
- **D3 — Phone uptime expectations** (blocks Phase 2 UX). *Default: site shows offline when the phone is down; no fallback to Workers AI.* Alternative: fall back to a hosted model when offline.
- **D4 — Who can use the site** (blocks Phase 3). *Default: only you, via Cloudflare Access.*
- **D5 — Model choice for Phase 1** (non-blocking). *Default: Qwen3.5-4B Q4_K_M, with Gemma 4 E4B and Qwen3.5-2B benchmarked alongside.*
- **D6 — Reuse of old code** (non-blocking). *Default: new repo, patterns copied, not files.*

---

## 13. Success metrics

- Phase 1: measured generation tokens/s and peak RSS for at least two models, recorded in this doc.
- Phase 2: public URL live; end-to-end chat works from an external network; deploy workflow green.
- Phase 4: a from-scratch model scored on the same eval set as the baseline, with both numbers recorded.

---

## 14. Out of scope for this PRD

- The NVIDIA "Deep Think" path from the old project (external API, not an own-model path).
- Mobile app packaging (APK), iOS, desktop installers.
- Multi-tenant SaaS.

---

## Appendix A — Sources

- llama.cpp: https://github.com/ggml-org/llama.cpp (MIT licence)
- Termux llama.cpp install: https://jonathansblog.co.uk/running-local-llms-on-android-with-llama-cpp-in-termux
- Ollama in Termux: https://nkaushik.in/writing/install-ollama-in-termux-android-2026-guide/
- Qwen3.5-4B GGUF (Q4_K_M 2.74 GB): https://huggingface.co/unsloth/Qwen3.5-4B-GGUF
- Gemma 4 E4B GGUF: https://huggingface.co/unsloth/gemma-4-E4B-it-GGUF
- Qwen3.5 small-model series timeline: https://hidekazu-konishi.com/entry/open_weights_llm_release_history_and_timeline.html
- Workers AI changelog (deprecations, catalog churn): https://developers.cloudflare.com/workers-ai/changelog/
- Cloudflare Tunnel: https://developers.cloudflare.com/tunnel/
- Access service tokens: https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/
- nanochat: https://github.com/karpathy/nanochat ; cost discussion: https://github.com/karpathy/nanochat/discussions/481
- Arm KleidiAI on Android (reference for ARM CPU acceleration): https://learn.arm.com/learning-paths/mobile-graphics-and-gaming/kleidiai-on-android-with-mediapipe-and-xnnpack/

## Appendix B — Measurements (to fill in during Phase 1)

| Model | Quant | Load time | Prompt tok/s | Gen tok/s | Peak RSS | 30-min stable? |
|---|---|---|---|---|---|---|
| Qwen3.5-4B | Q4_K_M | TBD | TBD | TBD | TBD | TBD |
| Qwen3.5-2B | Q4_K_M | TBD | TBD | TBD | TBD | TBD |
| Gemma 4 E4B | Q4_K_M | TBD | TBD | TBD | TBD | TBD |

---

## 15. v2 scope — grounded Q&A + Linux assistant (supersedes §5 use cases)

**Owner direction (verbatim intent):** answer basic questions with short examples ("Is the sun hot? Yes, very hot"); answer only from an encyclopaedia-based record; cover countries (history to 2005), current capitals/states/counties/territories, mathematics (structures, equations, how they're derived), and computing (systems, programs, software, coding, scripts, data, shell, binaries); execute instructions in a Linux (Debian/Ubuntu) environment; manage data, numbers and files; ask when unclear; learn habits.

### 15.1 Answering model
- **Retrieval-first.** Every factual answer is built from retrieved knowledge-base spans and cites them. Nothing in the KB → say "not in my record" and offer what is close. No guessing.
- **Short answers by default**, with one example when useful ("Q: Can fish swim in the sky? A: No. Some fish jump out of water and a few walk on land.").
- **Clarify first** when a request is ambiguous (one question, not a list).
- **Minimal stored knowledge:** store compact summaries plus source ID/URL/licence, not full article copies, where licence allows.

### 15.2 Knowledge base (KB)
| Domain | Source (verify licence before use) | Build |
|---|---|---|
| General encyclopaedia | Wikipedia dumps (CC BY-SA; verify current terms) | Extract lead sections + infobox facts |
| Countries, history to 2005 | Wikipedia country/history articles; dated entries | Timeline records with year fields |
| Capitals, states, counties, territories (today) | ISO 3166 / national lists via Wikipedia and official sources | Structured table, cross-checked |
| Mathematics | Wikipedia math articles; standard textbooks where licence allows | Structure + equation + derivation outline |
| Computing / CS | Wikipedia CS articles; man pages (GPL/free docs); POSIX/Debian docs | Concept cards + command reference |

- **Build on a server or CI, ship a prebuilt index to the phone.** Full Wikipedia is tens of GB; the phone has ~250 GB free but indexing there is slow. Index built once, shipped as a SQLite FTS5 file.
- **Facts go stale.** The 2005 cutoff for history is intentional; "current" lists carry an as-of date in every record.

### 15.3 Linux assistant (executor)
- **Two modes:** *explain* (default) and *run*. Run mode requires a plan shown first, then explicit yes.
- **Confirmation gate** for any write, delete, permission, network or package change. Read-only commands may run after the plan is shown.
- **Hard blocks:** `rm -rf` on system paths, `dd` to block devices, `mkfs`, disabling firewall or updates, editing `/etc` without approval. Blocked commands are refused with the reason.
- **Sandbox:** run as an unprivileged user inside the proot Debian; project directories only; no access to `.env`/keys (ENF-SEC-006).
- **File placement:** a small rules table (`docs`, `src`, `data`, `logs`, `backups`) so "where does this file belong" has a deterministic answer; the assistant proposes, the user confirms.
- **Number and data handling:** Python or `awk`/`jq` tools for calculation and data files; never mental arithmetic for stated results (verified by running).

### 15.4 Learning habits (modest, transparent)
- Local SQLite profile: preferred answer length, common directories, frequently run commands.
- Shown to the user, editable, and can be reset. Nothing is sent off-device.
- Habits only change suggestions (ordering, defaults), never bypass the confirmation gate.

### 15.5 Updated acceptance (added to Phase 1 and 2)
- [ ] 50-question eval set (factual, maths, computing, Linux) with expected answers; score recorded before/after each change (LLM-EVAL-001).
- [ ] Every factual answer shows at least one citation; "not in record" fires for out-of-KB questions in the eval.
- [ ] Run mode: destructive commands are blocked or require confirmation in tests (verified by running them against a throwaway directory).
- [ ] Clarifying question asked for ambiguous prompts in the eval.

### 15.6 Decisions still open
- **D7:** KB size for phase 1 (recommend: Wikipedia lead sections + curated country/capital/maths/CS subset, ~1–2 GB; full dump later).
- **D8:** Which retention for learned habits (recommend 30 days, user can clear any time).
- **D9:** Whether run mode is on by default for the public link (recommend: off; users opt in per install).
