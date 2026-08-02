# xForm semantic lab — data-model transformation

This example shows how to use **xForm** to build *data-model transformation
tooling*: take a sparse lab topology, normalize and enrich it (IP assignment,
link expansion), then emit concrete artifacts (Containerlab topology + FRR device
configs). The point is the **transformation pipeline** — sparse author data in,
fully addressed lab model and rendered files out.

## What is xForm (in one paragraph)?

xForm is a semantic compiler. It transforms composable documents that describe concepts and relationships into one or more deterministic materializations, such as HTML, network topologies, configuration files, or deployment artifacts. Rather than treating representations as the source of truth, xForm preserves semantic intent throughout the compilation process, allowing the same conceptual model to be realized in different forms while maintaining consistency and agency.

xForm source documents (.xp) use layered YAML front matter, templates, and optional JavaScript transformations. During compilation, sources are merged into a deterministic semantic model (the compile tree), which can then be materialized into one or more target artifacts. Later documents override earlier ones, and capabilities may define transformations and optional deployment steps with approval gates.

## What this example demonstrates

| Concern | How it shows up here |
|---------|----------------------|
| **Sparse authoring** | `topology.xp` lists nodes, links, and address *pools* — not every interface IP. |
| **Reusable transform logic** | `filters/` JS modules (`normalize_links`, `assign_ips`, `ip`) enrich the model at compile time. |
| **Framework vs content** | `semantic-lab-fw.xpt` owns templates, transforms, and capabilities; `topology.xp` owns the lab instance. |
| **Deterministic emission** | `--final clab.yml` renders Containerlab YAML plus per-node FRR configs under `output/`. |
| **Optional realization** | Deploy/destroy via Containerlab is gated (`--approval` / `--no-execute`); CI uses `--no-execute`. |

Authors write pools + sparse `topology`. The framework owns IP assignment through
`containerlab.create._transform`:

```text
`_input` | normalize_links | assign_ips(addressing)  →  addressed.nodes / addressed.links
```

`topology` (lab data) and `topology_file` (path to the emitted Containerlab YAML)
are separate concepts.

## Layout

| Path | Role |
|------|------|
| `filters/` | Jinja filter modules (`{% include %}` from the framework; may import each other). |
| `semantic-lab-fw.xpt` | Framework: filter includes, template roots, `containerlab.create` / `deploy` / `destroy`, defaults. |
| `index.html` | Browser demo that compiles via HTTP URLs. |
| `topology.xp` | Lab content: `addressing` + sparse `topology`, `_document._final: containerlab.create`. |
| `templates/_final/clab.yml.xpt` | Final emission (multi-file segment stream → `output/…`). |
| `templates/devices/frr.xpt` | Device concept (`devices: frr`) — conf `#1`, initialize `#2`. |
| `templates/modules/bgp.xpt` | Module concept (`modules: bgp`) — conf `#1`, `bgpd=yes` `#2`. |
| `semantic-lab.test.ts` | Tests for emission / `assign_ips` (used in the xForm package test suite). |

Compose sources in order: **framework → topology** (later overrides earlier).
The framework `{% include %}`s its filter modules.

## Transformation flow

```text
addressing + topology (sparse)
  → create._transform: _input | normalize_links | assign_ips(addressing)
  → addressed model (nodes, links, interface IPs, BGP neighbors…)
  → --final clab.yml  →  output/clab.yml + config/*.conf + *-initialize.sh + lab.sh
  → (optional) containerlab.deploy using topology_file
```

`normalize_links` folds author `loopback:` into a typed entry on `node.interfaces`.
`assign_ips` only assigns addresses. Device templates iterate `node.interfaces`
without special-casing loopback.

## Template concepts

| Concept | Templates |
|---------|-----------|
| `_final` | `templates/_final/clab.yml.xpt` — Containerlab + per-node configs + `lab.sh` |
| `devices` | `templates/devices/frr.xpt` — `#1` FRR conf, `#2` self-starting `initialize.sh` |
| `modules` | `templates/modules/bgp.xpt` — `#1` BGP stanza, `#2` enables `bgpd` in daemons |

Each FRR node bind-mounts `frr.conf` and `initialize.sh`. The container entrypoint
runs `initialize.sh`, which writes `/etc/frr/daemons` (module `#2` fragments such as
`bgpd=yes`), waits for Containerlab data interfaces, starts FRR, and applies initial
vtysh config.

## Browser demo

Live page: [exergy-connect.github.io/xFrame.ai/examples/xform-semantic-lab/](https://exergy-connect.github.io/xFrame.ai/examples/xform-semantic-lab/)

Or serve the xFrame.ai repo root over HTTP and open
[`index.html`](./index.html) (loads `../../web/xform/xform.browser.min.js` and
compiles `semantic-lab-fw.xpt` + `topology.xp` as page-relative URLs):

```bash
python3 -m http.server 8765
# open http://127.0.0.1:8765/docs/examples/xform-semantic-lab/
```

Filter modules are declared in the framework via `{% include "file://./filters/….js" %}`.

## Compile

Requires Node.js 24+. From the xFrame.ai repo root (with the xForm skill
present under `skills/xform/`):

```bash
# Compile tree only (no deploy) — create still runs the JS/Jinja transform
node skills/xform/scripts/xform.min.js \
  docs/examples/xform-semantic-lab/semantic-lab-fw.xpt \
  docs/examples/xform-semantic-lab/topology.xp \
  --no-execute

# Emit Containerlab + FRR configs under docs/examples/xform-semantic-lab/output/
node skills/xform/scripts/xform.min.js \
  docs/examples/xform-semantic-lab/semantic-lab-fw.xpt \
  docs/examples/xform-semantic-lab/topology.xp \
  --final clab.yml \
  --no-execute
```

Or via the composite action (as in `.github/workflows/examples-ci.yml`):

```yaml
- uses: ./actions/xform
  with:
    sources: docs/examples/xform-semantic-lab/semantic-lab-fw.xpt docs/examples/xform-semantic-lab/topology.xp
    materialization: clab.yml
    no-execute: "true"
```

Deploy / destroy (local only; needs `containerlab` on `PATH` and an approval hash):

```bash
node skills/xform/scripts/xform.min.js \
  docs/examples/xform-semantic-lab/semantic-lab-fw.xpt \
  docs/examples/xform-semantic-lab/topology.xp \
  --final clab.yml \
  --approval <hash>

node skills/xform/scripts/xform.min.js \
  docs/examples/xform-semantic-lab/semantic-lab-fw.xpt \
  docs/examples/xform-semantic-lab/topology.xp \
  --target containerlab.destroy \
  --approval <hash>
```

## Lab CLI

After deploy, from `docs/examples/xform-semantic-lab/output/`:

```bash
./lab.sh          # new bash with lab helpers (or: bash lab.sh)
# — or —
source lab.sh     # load helpers into the current shell
```

Then:

```text
dut                     # interactive vtysh on dut
dut show bgp summary    # one-shot command
x1 shell                # bash inside x1
nodes                   # list node names
status                  # containerlab inspect
```

Node names are functions with tab-completion for `show` / `configure` / `shell`.
Inside vtysh, FRR's own completion still applies.

## Artifacts

| Path | Content |
|------|---------|
| `output/semantic-lab-fw.json` | Full compile tree (named after the first document source) |
| `output/clab.yml` | Containerlab topology (binds conf + initialize.sh; entrypoint runs init) |
| `output/config/dut.conf` | FRR config for `dut` |
| `output/config/x1.conf` | FRR config for `x1` |
| `output/config/x2.conf` | FRR config for `x2` |
| `output/config/*-initialize.sh` | Per-node FRR entrypoint (daemons + host prep + vtysh) |
| `output/lab.sh` | Sourceable / executable bash CLI with node helpers + completion |

## Takeaways for building similar tooling

1. Keep **author data sparse**; put enrichment in named transforms/filters.
2. Split **framework** (reusable transforms + templates + capabilities) from
   **instance** documents.
3. Treat emission (`--final`) as a pure function of the resolved model; gate
   side effects (deploy) behind explicit approval.
4. Prefer small, testable JS filters for algorithmic steps (IP carving, link
   normalization) and templates for textual materialization.
