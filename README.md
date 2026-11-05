# DOM-Mind v1.0.0

A Chrome bookmarklet that puts an autonomous agent inside the current tab. It reads the page as a
reduced Accessibility & Action Tree, asks a local WebGPU LLM for one JSON action at a time, and
performs that action with synthetic DOM events — clicking, typing, selecting, scrolling — while it
verifies the result and recovers from failures.

No server. No build step. No page data leaves the tab. One payload file served from GitHub.

## Files

| File | What it is |
|---|---|
| `dom-mind.js` | The whole payload. This is the file the loader fetches. |
| `test.html` | Local bench: gated form, flaky re-render, consent wall, modal, shadow DOM, sensitive fields, injection text, pruning bait, cross-origin frame. |
| `fixtures/*.json` | Scripted decision sequences for the `oracle` backend, so the loop is testable with no model downloaded. |
| `PLAN.md` | Architecture, state machines, prompt structure, milestones, risks. |
| `README.md` | This file. |

## Install

The loader expects a **public** repo named `dom-mind` under `aomsinjaroensuk15-stack`, on `main`:

```
https://raw.githack.com/aomsinjaroensuk15-stack/dom-mind/main/dom-mind.js
```

githack is required because `raw.githubusercontent.com` serves `text/plain`, which Chrome refuses to
execute. jsDelivr (`https://cdn.jsdelivr.net/gh/aomsinjaroensuk15-stack/dom-mind@main/dom-mind.js`)
works as a fallback.

### 1. Push the files

Push `dom-mind.js` (optionally `test.html`, `fixtures/`, `README.md`, `PLAN.md`) to the repo.

### 2. Add the bookmark

Create a bookmark and paste this as its URL:

```js
javascript:(()=>{const s=document.createElement('script');s.src='https://raw.githack.com/aomsinjaroensuk15-stack/dom-mind/main/dom-mind.js?v='+Date.now();s.onerror=()=>alert('DOM-Mind failed to load. The repo must be public and this page must allow scripts.');document.documentElement.appendChild(s)})()
```

Notes:

- Chrome strips the `javascript:` prefix when pasting into some URL fields. Type `javascript:`
  yourself, then paste the rest.
- GitHub sanitizes `javascript:` links in rendered Markdown, so copy from a code block.
- githack caches a branch for minutes and `?v=` only busts the browser cache. For a stable release,
  point the loader at a tag (`/v1.0.0/dom-mind.js`) instead of `main`.
- Clicking the bookmark again reveals the existing HUD instead of mounting a second one.

### 3. [Use it](https://dainty-quokka-f09412.netlify.app)

1. Open any page and click the bookmark. The HUD appears top-right.
2. Type a goal, e.g. `fill the checkout form and place the order`.
3. Press **Run**. The `oracle` backend works immediately; switch to **webllm** and press
   **Load engine** for real inference (first run downloads the weights).

## Controls

| Control | Behavior |
|---|---|
| **Orb** | cyan idle · purple thinking · amber acting/waiting · green done · red halted |
| **Chip** | active backend and model tier |
| **Goal field** | the instruction; Enter starts a run |
| **Run** | start a run over a fresh history |
| **Pause** | pause/resume at the next step boundary |
| **Step** | execute exactly one tick |
| **Stop** | end the run, keep the page state |
| **ctx bar** | estimated prompt tokens against the 4096 window |
| **vram bar** | estimated model memory against a 4 GB reference |
| **Stream** | newest first; `#step ACTION [id] result · ms`; amber rows are failures |
| **engine** | backend, tier, load/unload, weight download progress |
| **tree** | the exact reduced tree sent to the model, with level/tokens/node counts |
| **safety** | whether this host is trusted for risky actions, and a revoke button |
| **−** | collapse to the title bar |
| **■** | destroy the instance (same as **F8**) |
| **Header drag** | move the HUD; the position is remembered |

Hotkeys: **F8** kills the instance from anywhere · **Esc** dismisses a confirm gate or stops a run ·
**Ctrl+Shift+M** collapses/expands. Shortcuts are ignored while you type in a page field.

## How a step works

1. **Reduce** — hidden, zero-size, `aria-hidden`, script/style/svg/canvas nodes are dropped; the rest
   becomes one line per element: `[42] btn "Place order" req`. IDs are a hash of
   (dom path, role, accessible name), so `[42]` still means the same button after a re-render.
2. **Think** — one inference call returns one JSON action. On WebLLM the action schema is enforced
   as a decoding grammar, so malformed JSON cannot be produced.
3. **Act** — the ID is resolved to a live node, scrolled into view, and driven with a realistic event
   sequence (`pointerover → pointerdown → mousedown → pointerup → mouseup → click`). Text goes in
   through the native value setter plus `input`/`change` so React-style inputs update.
4. **Settle + verify** — waits for a 250 ms mutation-quiet window (1.8 s cap) and checks a
   per-action post-condition: value equality for `TYPE`/`SELECT`, URL/checked/`aria-expanded`/mutation
   change for `CLICK`, scroll delta for `SCROLL`. The compressed observation goes into the next
   prompt; only two consecutive failures trigger a reflection pass.

Loop guards: 60 steps, 5 minutes, three consecutive failures, and an identical-action signature
repeated three times blocks that action for a step.

## Safety

- **Hard denied in code, never in the prompt:** password fields, card/CVV/OTP/SSN inputs, and
  `autocomplete="cc-*"` fields. The action is refused before dispatch.
- **Confirm gate:** any click whose accessible name matches `pay|buy|order|delete|send|transfer|
  publish|unsubscribe|cancel|book|submit|confirm|log out`, plus any off-origin `NAV`. You can allow
  once or trust the host; trust is stored per host in `localStorage`.
- **Kill switch:** **F8**, the **■** button, or **Esc** stops the loop, aborts the settle and
  terminates the engine worker.
- Page text is treated as untrusted data: it is fenced between `<<<PAGE` and `PAGE>>>` and the system
  prompt says it is content, not instructions. Enforcement lives in the executor, not the model.

## Engines

| Backend | What it does | Cost |
|---|---|---|
| `oracle` | fixture sequences, else a deterministic heuristic planner | none, instant |
| `webllm` | WebGPU inference in a dedicated worker (`@mlc-ai/web-llm` from `esm.run`) | weights download |

| Tier | Model | Weights | Est. VRAM |
|---|---|---|---|
| s | `Qwen2.5-0.5B-Instruct-q4f16_1-MLC` | ~350 MB | ~1.1 GB |
| m (default) | `Llama-3.2-1B-Instruct-q4f16_1-MLC` | ~700 MB | ~1.7 GB |
| l | `Qwen2.5-1.5B-Instruct-q4f16_1-MLC` | ~1.0 GB | ~2.6 GB |

Weights come from the HuggingFace CDN and are cached by the browser after the first download. The
engine is only loaded when you press **Load engine**, and it unloads when you press **Unload**.

## Local bench

```bash
cd dom-mind
npx --yes serve -l 8123 .
# http://127.0.0.1:8123/test.html
```

Press **Load DOM-Mind**, then:

- **Check ID stability** — reduces the page, force-rebuilds the flaky list, reduces again and compares
  the ID of the same button.
- **Check pruning** — confirms hidden bait text is absent from the tree and reports level/tokens/nodes.
- **Run checkout fixture** — five scripted actions fill name/email/country/terms and press *Place
  order*. That button is a risky verb, so the confirm gate appears mid-run.
- **Run delete-account fixture** — one action against a confirmed-risky button.

`fixtures/checkout.json` and `fixtures/delete-account.json` are the same sequences on disk; targets are
matched semantically (`{ "role": "btn", "name": "Place order" }`) so they survive ID churn.

## Verified locally (Chromium, Windows)

Run against `test.html` on a local static server:

- payload loads and mounts exactly **1** HUD host; loading it a second time still leaves **1**
- reducer on the checkout goal: **level 0, 62 nodes, 779 estimated tokens** for a page with ~200
  elements; the tree includes open shadow-root content (`Shadow action`) and excludes
  `aria-hidden`, `display:none` and zero-size nodes
- ID stability: the flaky list's `Add to cart` button kept **`[332] → [332]`** across a forced
  re-render
- `TYPE` and `SELECT` verified against real page state (`value="Dom Mind"`,
  `value="agent@example.com"`, `value="th"`)
- the confirm gate opened on the risky *Place order* click and blocked the run until answered
- no console errors, no failed script or fixture requests

Not verified in this environment: end-to-end completion of the fixture run and any WebGPU inference.
Both need a **visible, focused** tab — Chrome clamps timers to roughly once per second (or freezes
them entirely) in a hidden tab, which stalls the settle loop mid-step, and this session's preview tab
reported `document.visibilityState === 'hidden'`. The WebGPU path also needs a model download and a
GPU, neither of which was available here. Treat those as untested, not as passing.

Step latency and token-per-second numbers are therefore **not** published; measure them yourself with
the tab in front, using the ctx/vram/tok-s readouts.

## Known limits

- **Synthetic events are not trusted.** Sites that check `event.isTrusted`, run bot detection, or
  require native input will not respond. There is no bookmarklet workaround.
- **CSP.** A page that forbids external scripts blocks the payload (`script-src`), and one that
  forbids cross-origin fetches blocks weight loading (`connect-src`). The HUD reports engine failure;
  it cannot bypass page policy. `blob:` workers can also be blocked (`worker-src`).
- **WebGPU required for real inference** (Chrome 113+, secure context). Without it the oracle backend
  still runs, but there is no language model.
- **Cross-origin iframes** are opaque: they appear as one `frm` node, and nothing inside can be driven.
  **Closed shadow roots** cannot be traversed either.
- **Navigation destroys the agent.** Reload/route change kills the instance; click the bookmark again.
  A single-page-app route change that does not reload is handled by the next reduce.
- **A permanently animating page** (carousel, clock) never reaches the quiet window, so every step
  pays the 1.8 s settle cap and observations are marked `unsettled`.
- **No persistence**: goal, history and memory are per-page, in memory.
- **Prompt injection** is mitigated (fenced data, executor-side enforcement) but a 1B model can still
  be talked into wrong choices; the confirm gate and denylist are the real backstop.
- **Desktop Chromium only**, tested on Windows Chrome. Firefox/Safari and mobile are untested.

## Privacy

The payload makes no requests of its own. The loader fetches the script from githack/jsDelivr; the
WebLLM backend fetches model weights from the HuggingFace CDN. Page content, goals and action history
stay in the tab and are never transmitted. Nothing is written to `localStorage` except the HUD
position and the per-host trust flag.

## Console API

```js
window.__DOMMIND__.run('fill the form and submit')  // start a run
window.__DOMMIND__.step()                           // one tick
window.__DOMMIND__.stop()
window.__DOMMIND__.state()                          // status, step, recent actions, gate flag
window.__DOMMIND__.reduce('goal')                    // { level, tokens, nodes, text }
window.__DOMMIND__.highlight(42)                     // spotlight element [42]
window.__DOMMIND__.loadEngine('webllm', 'm')         // load a tier
window.__DOMMIND__.engine()
window.__DOMMIND__.answer(true, false)               // resolve an open confirm gate
window.__DOMMIND__.reveal()
window.__DOMMIND__.destroy()
```
