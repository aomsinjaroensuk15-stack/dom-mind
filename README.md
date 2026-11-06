# DOM-Mind v2.2.0

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
| `presence-sw.js` | Optional presence worker. Re-injects the payload on same-origin navigations so a mission continues without another bookmark click. |
| `page2.html` | Second bench page with no payload tag, used to prove presence across a real navigation. |
| `extension/manifest.json` | MV3 manifest that loads the payload on every http(s) page. |
| `extension/content.js` | Content script that supplies presence on origins you do not serve. |
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

### 3. Use it

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
| **results** | rows pulled by the last `EXTRACT`, with a **Copy as TSV** button |
| **mission** | the live mission: id, step, subgoal stack, **Resume** / **Undo** / **Discard**, auto-resume toggle |
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

## Reliability (v1.1)

- **Scored re-resolution.** An action's id no longer has to survive a re-render. If the id is gone, the
  executor ranks every collected node against the action's `find: {role, name}` — exact 6, prefix 4,
  substring 3, token overlap up to 4, plus role/interactive/in-view terms — and takes the best at ≥2.5,
  logging `matched "…" by name · score 4.5`.
- **`EXTRACT` action.** Point it at a container and it returns rows from a `<table>`, a `<ul>/<ol>`, or
  the largest repeated child group: text (140 chars), the first link path, and a price when a cell
  matches a currency pattern. Rows land in the **results** pane and never exceed 40, so a long listing
  costs the prompt one summary line, not the payload.
- **State-hash stall detection.** Each reduce hashes the tree. A state seen three times in a row injects
  `NO PROGRESS` into the prompt and memory, which catches A→B→A loops the action signature cannot see;
  six identical states halts the run instead of burning the step budget. `WAIT`/`READ` are exempt.
- **Per-origin memory.** Successful actions, and matches that needed name resolution, are remembered
  per host (`dm:site:<host>`, 80 entries) as `{role|name → id, hits}`. Learned elements carry a `*` in
  the tree so the model prefers them, the count shows in the tree header, and `forget()` wipes the host.
  This is what makes a second visit cheaper: known targets are resolved without exploration.

## Presence (v2.1)

The mission survived a navigation in v2.0 but still needed the bookmarklet to be clicked on the new
page. Presence removes that click on origins that serve `presence-sw.js`.

- **How it works.** `presence-sw.js` intercepts same-origin `navigate` requests, fetches the HTML,
  inserts `<script src="/dom-mind.js" data-dom-mind-presence>` before `</body>`, and returns the page
  with `content-length`, `content-encoding`, `etag` and `last-modified` stripped so nothing is served
  stale. It passes everything non-HTML and cross-origin straight through, never caches, and calls
  `skipWaiting()` + `clients.claim()` so it takes over the tab after one reload.
- **Auto-continue.** The injected payload sees the marker tag, and when the newest mission is still
  `active` (not `paused`, not `halted`) and `dm:auto` is not `"0"`, it resumes at the stored step
  instead of waiting for **Resume**. Every page unload also writes the mission (`pagehide`,
  `visibilitychange`), so the hop lands with an accurate step.
- **Turning it off.** **Disable presence** in the mission panel unregisters only registrations whose
  script is `presence-sw.js` — it never touches a site's own worker — and the next navigation loads
  normally, with no payload.

**The honest limit:** a bookmarklet cannot install a worker on a site it does not serve. `register()`
rejects blob: and data: script URLs and requires the script and scope to be same-origin with the page,
so presence covers origins where you host the file yourself (the bench, localhost, your own site).
For arbitrary third-party sites the payload has to be present before it can run — that is a browser
extension's job, not a bookmarklet's. Everything else still works without presence: the mission is
stored and resumes on the next click.

## Missions (v2.0)

A run is no longer a loop that dies with the page. It is a record that survives it.

- **Stored mission.** `IndexedDB` database `dom-mind`, store `missions`, keyed by mission id, with a
  `localStorage` mirror (`dm:mission:last`) so a blocked IDB still leaves something to restore. The
  record holds goal, status, origin, step, budget, subgoal stack, compacted memory, the last 12 actions,
  the undo log, extracted results and the pages visited.
- **Subgoal stack.** The planner seeds 2–4 subgoals from the page (fill these fields → tick this box →
  click that button); the model works only the `[active]` one and emits `NEXT` to close it or `PLAN`
  with `args.summary = "first | second | third"` to replace the list. Completed items are kept by text,
  so a re-plan does not resurrect finished work.
- **Backtracking.** Every mutating action records what it changed (element, old value/checked, scroll,
  url) in a 12-entry undo log. Two identical page states trigger an automatic undo and a `NO PROGRESS`
  prompt block; four halt the run. `Undo` in the mission panel rolls back the last change by hand, and
  if the recorded url differs it calls `history.back()` instead.
- **Resume after navigation.** The record is saved before every same-tab link click and after every
  step, so a page that unloads mid-run still leaves an accurate mission. On the next page, loading the
  payload restores the goal, subgoals, step count, memory, results and undo log, fills the goal field,
  and shows `resumed m… · step N`. Auto-resume (checkbox) starts the loop immediately instead.

Resume is per-mission, not per-tab. Without presence you click the bookmark on the new page; with
presence (below) the next page loads the payload itself. Neither change touches the record format, so a
mission started before an upgrade still resumes.

## Skills (v2.2)

A finished mission can be compiled into a script that replays with **no inference at all**.

- **Compile.** Every recorded step keeps a semantic target (`role` + accessible name) beside the id, so
  `compile()` turns a mission into `[{action, find:{role,name}, args}]` — TYPE/SELECT/CLICK/KEY/SCROLL/
  NAV/WAIT/READ, with plan and bookkeeping actions dropped. Records live in `IndexedDB`
  `dom-mind-skills`, per host, 20 max (oldest evicted), each tracking `runs` and `ok`.
- **Auto-compile.** A run that ends `done` saves its skill by itself and toasts `Skill saved · N steps`.
- **Replay.** `replay(id)` walks the steps, re-resolving each target by name at the moment it runs, so a
  page that moved its elements still works. It stops at the first failure and reports which step and
  why, rather than clicking blind. `{settle:false}` skips the settle wait for scripted/bench use.

This is the difference between an agent and a macro: the first visit costs inference, every later visit
costs nothing, and the mission record stays the source of truth.

## Extension (any origin)

Presence only covers origins that serve `presence-sw.js`. For third-party sites, load the same payload
as a content script:

1. `chrome://extensions` → enable **Developer mode** → **Load unpacked** → pick the `extension/` folder.
2. Open any page; the payload mounts itself, once per page, and missions resume as usual.

The content script injects a `<script src="…/dom-mind.js" data-dom-mind-presence="extension">`, so the
same CSP limit applies: a page that forbids the payload origin still wins. Change `PAYLOAD` in
`extension/content.js` to your own build (pin a tag rather than `main` once you release).

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

v1.1 reliability layer, same bench:

- **scored re-resolution** — the `Rotate keys` button was moved to a second parent, killing its id. Before the
  move `fuzzy('btn', 'Rotate keys')` returned `263`, after it returned `636` with score `9.5` (role 2.5 +
  exact name 6 + interactive 1). Same element, no id needed.
- **`EXTRACT`** — on the six-row product list: `6 item rows`, first row `"Aurora desk lamp $49.00"` with
  `price=$49.00` and `href=/p/aurora-desk`.
- **state hash** — two reduces of an unchanged page gave the same fingerprint (`1lygm8f`); appending one
  `<li>` changed it (`151wqfi`), and removing the row restored the original.
- **per-origin memory** — one `EXTRACT` recorded `1` affordance for `127.0.0.1:8123`, a repeat read kept it
  at `1` and incremented its hit count, and `forget()` took it to `0`.

v2.0 missions, same bench:

- **mission record** — `missionStart` seeded three subgoals from the page, `plan([...])` replaced them with
  four, and `next()` closed the first: `[done] fill the name field`, `[active] set the country`, two
  pending. `missionRestore()` read the same id (`mmw4xabhbt7js`), step and stack back out of IndexedDB.
- **undo** — `act(TYPE, {settle:false})` typed `"Undo Me"` and verified `value="Undo Me"`; `undo()`
  reported `value back to ""` and the field was empty again.
- **resume** — destroying the instance and loading the payload again (the same path a fresh page takes)
  adopted mission `mmw4xabhbt7js` at step `1`, restored the goal `fill the checkout form and place the
  order`, the four subgoals with `set the country` active, and mounted exactly one HUD.

v2.1 presence, same bench:

- **injection without a bookmark click** — after `presence('on')` on `test.html` reported
  `controlled: true`, navigating to `page2.html` (which contains no payload tag at all) mounted the HUD
  from `<script src="/dom-mind.js" data-dom-mind-presence>`: `presence: injected by the worker`.
- **mission carried across the navigation** — the page2 instance came up on mission `mmw4xy63jxi4t`,
  restored its goal and subgoal stack, and auto-continued instead of waiting for Resume: it ran
  `TYPE [107] → ok (value="test")`, `CLICK [686] → ok (1 mutation)`, `DONE`, finishing at step 3.
  That run also exercises the action loop itself end to end, which earlier attempts never reached.
- **reversible** — `presence('off')` returned `unregistered 1 presence scope`. After the reload the page had
  no controller, no `data-dom-mind-presence` tag, no `__DOMMIND__` and 0 HUD hosts, so the worker is
  genuinely removable and does not outlive the feature.

v2.2 skills, same bench:

- **compile** — two recorded `TYPE` steps became `TYPE "Full name"` and `TYPE "Email"`. Before the label
  fix the target read `"Full name Ada Lovelace fullname text"`, i.e. it embedded the field's *value*, so a
  skill would have been invalidated by its own typing. Targets are now the stable label.
- **replay** — `replay(id, {settle:false})` returned `{ok: true, done: 4, total: 4}` with
  `4 steps replayed with no inference`, refilling `fullname="Skill Bot"` and `email="skill@example.com"`;
  the stored counters went to `runs: 2, ok: 2`. No model was loaded for any of it.

The loop only executed on the presence hop because that renderer ran timers normally; the earlier
bench tab had them frozen. Treat step timings from either as unrepresentative.

Gated checkout, end to end (v2.2):

- **gate** — the run reached step 4, the confirm gate opened on *Place order*, and the click was not
  dispatched until it was allowed. Nothing else could get past it.
- **mission** — after allowing: name, email, country and terms set, `orderResult` visible, mission
  `mmw4yjrupmvzw` stored `done` at step 6.
- **verifier** — that click reports `ok (click dispatched, settle skipped)`. The first attempt reported
  `FAIL (no DOM change after click)` for a click that had in fact placed the order, because a settle-free
  observation zeroes the mutation count; it now reports *unverified* rather than failed.
- **skill** — the finished mission compiled to five steps ending in `CLICK "Place order"`, so a replayed
  skill reaches the risky action and has to clear the gate itself. Skills do not inherit host trust.
- **replay through the gate** — replaying that skill re-ran all five steps with no model loaded, opened
  the gate again on *Place order* and only continued once allowed:
  `{ok: true, done: 5, total: 5}`, `5 steps replayed with no inference`, stored counters `runs: 1, ok: 1`,
  fields refilled to `Dom Mind` / `agent@example.com` / `th` / terms checked.

Not verified in this environment: `EXTRACT`/`PLAN`/`NEXT` as actions inside a running loop, the
stall escalation (three identical states → `NO PROGRESS`, six → halt), auto-compile firing on a real
`done`, the unpacked extension (installing extensions is outside this session's tooling), and any WebGPU
inference. The checkout run above happened in a **hidden** tab, so every step took the settle-free path;
no run here has exercised the 250 ms quiet-window path end to end — Chrome clamps timers to roughly once per second (or freezes
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
- **Navigation destroys the agent.** A reload or route change kills the instance. The mission survives
  it (see Missions): with presence the next page re-injects and continues by itself, without it click
  the bookmark and the run resumes from the stored step. A single-page-app route change that does not
  reload is handled by the next reduce.
- **Presence is per-origin and opt-in.** It only covers origins that serve `presence-sw.js`, requires
  https or localhost, and a page CSP that forbids the payload (or `worker-src`) defeats it. A
  bookmarklet cannot register a worker on somebody else's site; use the `extension/` folder for that.
- **A replayed skill is not self-healing.** It resolves targets by name and stops at the first missing
  one with the step named, but if a site redesigns a flow the skill needs recompiling — there is no
  model in the loop to improvise a new path.
- **A permanently animating page** (carousel, clock) never reaches the quiet window, so every step
  pays the 1.8 s settle cap and observations are marked `unsettled`.
- **A hidden tab skips settle.** Chrome suspends timers in background tabs, which used to stall the loop
  forever mid-step. When `document.visibilityState` is `hidden` the executor now runs settle-free and
  marks the observation `unsettled`, so a background run completes but may act before async content
  arrives. Timings from a background tab mean nothing.
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
window.__DOMMIND__.extract('#products', 20)           // rows out of a container
window.__DOMMIND__.results()                          // last EXTRACT payload
window.__DOMMIND__.fuzzy('btn', 'Place order')        // scored name match, no id needed
window.__DOMMIND__.affordances()                      // what this host has taught it
window.__DOMMIND__.forget()                           // clear that memory for this host
window.__DOMMIND__.fingerprint()                      // tree hash used for stall detection
window.__DOMMIND__.mission()                          // current mission record
window.__DOMMIND__.missionStart('goal')               // create and persist a mission
window.__DOMMIND__.plan(['step one', 'step two'])     // set the subgoal stack
window.__DOMMIND__.next()                             // close the active subgoal
window.__DOMMIND__.undo()                             // roll back the last mutation
window.__DOMMIND__.act({ action: 'TYPE', find: { name: 'Full name' }, args: { text: 'x' } }, { settle: false })
window.__DOMMIND__.missionRestore()                   // read the newest stored mission
window.__DOMMIND__.missionForget()                    // clear stored missions
window.__DOMMIND__.presence()                         // { controlled, injected, script }
window.__DOMMIND__.presence('on')                     // register presence-sw.js on this origin
window.__DOMMIND__.presence('off')                    // unregister only that worker
window.__DOMMIND__.compile('name')                     // turn this mission into a replayable skill
window.__DOMMIND__.skills()                            // every compiled skill for this browser
window.__DOMMIND__.replay(skillId, { settle: false })  // replay it with no model
window.__DOMMIND__.skillForget()                       // clear compiled skills
window.__DOMMIND__.answer(true, false)               // resolve an open confirm gate
window.__DOMMIND__.reveal()
window.__DOMMIND__.destroy()
```
