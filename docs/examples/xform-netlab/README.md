# xForm netlab example — data-model transformation

This example shows how to use **xForm** to build *data-model transformation
tooling*: take a sparse lab description, normalize and enrich it (IP assignment,
link expansion), then emit concrete artifacts (Containerlab topology + device
configs). The networking domain is borrowed from [netlab](https://netlab.tools/)
so the inputs look familiar; the point of the example is the **transformation
pipeline**, not running a full netlab installation.

## What is netlab?

[netlab](https://netlab.tools/) ([GitHub](https://github.com/ipspace/netlab)) is a
virtual networking lab tool. You describe topology and routing intent in YAML;
netlab expands that into addressing plans, device configs, and lab orchestration
(Vagrant or [Containerlab](https://containerlab.dev/)). See the netlab docs for
what the product does end-to-end.

This repo’s sample mirrors a small eBGP lab inspired by netlab’s
`tests/integration/bgp/01-ebgp-session.yml`. Here, **xForm** plays the role of
the transform/emit layer: sparse author data in, fully addressed lab model and
rendered files out.

## What is xForm (in one paragraph)?

xForm compiles composable `.xp` documents (YAML front matter + templates +
optional JS filters) into a deterministic compile tree and/or finalized files.
Sources are layered: later documents override earlier ones. Capabilities can
declare transforms (`_transform`) and optional shell realization (deploy), with
approval gates. You do not need the full xForm skill guide to follow this
example — the pieces below are the ones that matter for transformation tooling.

## What this example demonstrates

| Concern | How it shows up here |
|---------|----------------------|
| **Sparse authoring** | `topology.xp` lists nodes, links, and address *pools* — not every interface IP. |
| **Reusable transform logic** | `filters/` JS modules (`normalize_links`, `assign_ips`, `ip`) enrich the model at compile time. |
| **Framework vs content** | `netlab-fw.xpt` owns templates, transforms, and capabilities; `topology.xp` owns the lab instance. |
| **Deterministic emission** | `--final clab.yml` renders Containerlab YAML plus per-node FRR configs under `output/`. |
| **Optional realization** | Deploy/destroy via Containerlab is gated (`--approval` / `--no-execute`); CI uses `--no-execute`. |

Authors write pools + sparse `topology`. The framework owns IP assignment through
`containerlab.create._transform`:

```text
topology | normalize_links | assign_ips(addressing)  →  addressed.nodes / addressed.links
```

`topology` (lab data) and `topology_file` (path to the emitted Containerlab YAML)
are separate concepts.

## Layout

| Path | Role |
|------|------|
| `filters/` | Jinja filter modules (`{% include %}` from the framework; may import each other). |
| `netlab-fw.xpt` | Framework: filter includes, template roots, `containerlab.create` / `deploy` / `destroy`, defaults. |
| `index.html` | Browser demo that compiles via HTTP URLs. |
| `topology.xp` | Lab content: `addressing` + sparse `topology`, `_document._target: containerlab.deploy`. |
| `templates/_final/clab.yml.xpt` | Final emission (multi-file segment stream → `output/…`). |
| `templates/devices/frr.xpt` | Device config concept (`devices: frr`). |
| `templates/modules/bgp.xpt` | Protocol module concept (`modules: bgp`). |
| `netlab.test.ts` | Tests for emission / `assign_ips` (used in the xForm package test suite). |

Compose sources in order: **framework → topology** (later overrides earlier).
The framework `{% include %}`s its filter modules.

## Transformation flow

```text
addressing + topology (sparse)
  → create._transform: normalize_links | assign_ips(addressing)
  → addressed model (nodes, links, interface IPs, BGP neighbors…)
  → --final clab.yml  →  output/clab.yml + output/config/*.conf
  → (optional) containerlab.deploy using topology_file
```

## Browser demo

Live page: [exergy-connect.github.io/xFrame.ai/examples/xform-netlab/](https://exergy-connect.github.io/xFrame.ai/examples/xform-netlab/)

Or serve the xFrame.ai repo root over HTTP and open
[`index.html`](./index.html) (loads `../../web/xform/xform.browser.min.js` and
compiles `netlab-fw.xpt` + `topology.xp` as page-relative URLs):

```bash
python3 -m http.server 8765
# open http://127.0.0.1:8765/docs/examples/xform-netlab/
```

Filter modules are declared in the framework via `{% include "file://./filters/….js" %}`.

## Compile

Requires Node.js 24+. From the xFrame.ai repo root (with the xForm skill
present under `skills/xform/`):

```bash
# Compile tree only (no deploy) — create still runs the JS/Jinja transform
node skills/xform/scripts/xform.min.js \
  docs/examples/xform-netlab/netlab-fw.xpt \
  docs/examples/xform-netlab/topology.xp \
  --no-execute

# Emit Containerlab + FRR configs under docs/examples/xform-netlab/output/
node skills/xform/scripts/xform.min.js \
  docs/examples/xform-netlab/netlab-fw.xpt \
  docs/examples/xform-netlab/topology.xp \
  --final clab.yml \
  --no-execute
```

Or via the composite action (as in `.github/workflows/examples-ci.yml`):

```yaml
- uses: ./actions/xform
  with:
    sources: docs/examples/xform-netlab/netlab-fw.xpt docs/examples/xform-netlab/topology.xp
    materialization: clab.yml
    no-execute: "true"
```

Deploy / destroy (local only; needs `containerlab` on `PATH` and an approval hash):

```bash
node skills/xform/scripts/xform.min.js \
  docs/examples/xform-netlab/netlab-fw.xpt \
  docs/examples/xform-netlab/topology.xp \
  --final clab.yml \
  --approval <hash>

node skills/xform/scripts/xform.min.js \
  docs/examples/xform-netlab/netlab-fw.xpt \
  docs/examples/xform-netlab/topology.xp \
  --target containerlab.destroy \
  --approval <hash>
```

## Artifacts

| Path | Content |
|------|---------|
| `output/netlab-fw.json` | Full compile tree (named after the first document source) |
| `output/clab.yml` | Containerlab topology |
| `output/config/dut.conf` | FRR config for `dut` |
| `output/config/x1.conf` | FRR config for `x1` |
| `output/config/x2.conf` | FRR config for `x2` |

## Takeaways for building similar tooling

1. Keep **author data sparse**; put enrichment in named transforms/filters.
2. Split **framework** (reusable transforms + templates + capabilities) from
   **instance** documents.
3. Treat emission (`--final`) as a pure function of the resolved model; gate
   side effects (deploy) behind explicit approval.
4. Prefer small, testable JS filters for algorithmic steps (IP carving, link
   normalization) and templates for textual materialization.
