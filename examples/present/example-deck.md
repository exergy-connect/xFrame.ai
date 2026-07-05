---
title: xFrame Present — Demo
theme: light
author: Exergy LLC
header: xFrame Present
footer: © Exergy ∞ LLC @builddatetime
data: ../consolidate/output/consolidated_data.json
lang: en
---

# xFrame Present

Compile Markdown into standalone HTML slides.

Use `→` / `←` to navigate, press `t` to toggle the theme.

---

## Why?

- Zero runtime dependencies in the output
- Self-contained single HTML file
- Works offline, prints to PDF

---

## Markdown, fully

```ts
import { compile } from "xframe-present";

const html = compile("# Hello\n---\n# World");
```

> Anything Markdown can express, a slide can show.

Note: mention that GFM features like tables and task lists work too.

---

## Images

An inline SVG data URI (already self-contained):

![xFrame logo](data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4MDAiIGhlaWdodD0iNDUwIj48cmVjdCB3aWR0aD0iODAwIiBoZWlnaHQ9IjQ1MCIgZmlsbD0iIzI1NjNlYiIvPjxjaXJjbGUgY3g9IjQwMCIgY3k9IjIyNSIgcj0iMTIwIiBmaWxsPSIjNThhNmZmIi8+PHRleHQgeD0iNDAwIiB5PSIyNDAiIGZvbnQtZmFtaWx5PSJzYW5zLXNlcmlmIiBmb250LXNpemU9IjU2IiBmaWxsPSIjZmZmZmZmIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIj54RnJhbWU8L3RleHQ+PC9zdmc+ "click_to_zoom")

---

## Images from a URL

A regular PNG referenced by URL. It's inlined as a base64 data URI by default
(pass `--no-embed-images` to keep the original URL) so the deck stays
offline-capable:

![PNG via URL](https://placehold.co/800x450/2563eb/ffffff/png?text=PNG+via+URL "click_to_zoom")

Add `"click_to_zoom"` as the image title to make any image clickable — it opens
in a full-screen lightbox. Click anywhere or press `Esc` to close.

---

## Website snapshot

A git-tracked PNG snapshot of a live site. Click the image to open the page in a
new tab. Refresh the PNG with `npm run snapshot` in `ts/present/` (not on every
CI run).

@include _shared/snapshots.md#poda-home

---

## Present workflow

How a Markdown deck becomes standalone HTML: shared fragments and consolidated
data are resolved at compile time; git-tracked PNG and SVG assets are embedded
as base64. Maintainer scripts refresh snapshots and diagrams locally — not on
every CI run.

@include _shared/diagrams.md#present-workflow

---

## Project timelines

A `timeline` graph over the consolidated `project` data: one horizontal stacked
bar per project (Y axis), milestone dates on the X axis, with a marker for each
lifecycle event. Hover a marker or segment for details. Click a project name to
isolate and zoom to that project, or click a segment to focus every project on
that time window (`‹ reset` restores the full view).

@include _shared/graphs.md#project-timeline

---

## Production volumes

A `timeseries` over the same `project` data: each project's annual `production`
records plotted by year. The per-metric `style` mixes chart types — oil
(`oil_kbbd`, bars) against the primary (left) axis and gas (`gas_mmscfd`, line)
against the secondary (right) axis — for all three projects. Hover any bar or
point for its exact value.

@include _shared/graphs.md#production-timeseries

---

## Thanks

Questions?
