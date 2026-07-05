---
title: xFrame Present — Ukázka
theme: light
author: Exergy LLC
header: xFrame Present
footer: © Exergy ∞ LLC @builddatetime
data: ../consolidate/output/consolidated_data.json
lang: cs
---

# xFrame Present

Převod Markdownu na samostatné HTML snímky.

Použijte `→` / `←` pro navigaci, stiskněte `t` pro přepnutí motivu.

---

## Proč?

- Ve výstupu žádné runtime závislosti
- Jeden samostatný HTML soubor
- Funguje offline, tiskne se do PDF

---

## Markdown naplno

```ts
import { compile } from "xframe-present";

const html = compile("# Hello\n---\n# World");
```

> Cokoli umí Markdown, to může ukázat snímek.

Note: zmínit, že GFM funkce jako tabulky a task listy také fungují.

---

## Obrázky

Vložené SVG data URI (už samostatné):

![xFrame logo](data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4MDAiIGhlaWdodD0iNDUwIj48cmVjdCB3aWR0aD0iODAwIiBoZWlnaHQ9IjQ1MCIgZmlsbD0iIzI1NjNlYiIvPjxjaXJjbGUgY3g9IjQwMCIgY3k9IjIyNSIgcj0iMTIwIiBmaWxsPSIjNThhNmZmIi8+PHRleHQgeD0iNDAwIiB5PSIyNDAiIGZvbnQtZmFtaWx5PSJzYW5zLXNlcmlmIiBmb250LXNpemU9IjU2IiBmaWxsPSIjZmZmZmZmIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIj54RnJhbWU8L3RleHQ+PC9zdmc+ "click_to_zoom")

---

## Obrázky z URL

Běžný PNG odkazovaný URL. Ve výchozím nastavení se vloží jako base64 data URI
(předejte `--no-embed-images`, pokud chcete ponechat původní URL), takže deck
zůstane použitelný offline:

![PNG přes URL](https://placehold.co/800x450/2563eb/ffffff/png?text=PNG+via+URL "click_to_zoom")

Přidejte `"click_to_zoom"` jako title obrázku, aby byl klikací — otevře se
na celou obrazovku v lightboxu. Klikněte kamkoli nebo stiskněte `Esc` pro zavření.

---

## Snímek webu

PNG snímek živého webu uložený v gitu. Kliknutím na obrázek otevřete stránku v
novém panelu. PNG obnovíte příkazem `npm run snapshot` v `ts/present/` (ne při
každém běhu CI).

@include _shared/snapshots.md#poda-home

---

## Pracovní postup Present

Jak se z Markdown decku stane samostatné HTML: sdílené fragmenty a konsolidovaná
data se vyřeší při kompilaci; PNG a SVG v gitu se vloží jako base64. Skripty pro
údržbu obnovují snímky a diagramy lokálně — ne při každém běhu CI.

@include _shared/diagrams.md#present-workflow

---

## Časové osy projektů

Graf typu `timeline` nad konsolidovanými daty `project`: jeden horizontální
skládaný pruh na projekt (osa Y), milníky na ose X a značka pro každou událost
životního cyklu. Najetím na značku nebo segment zobrazíte detail. Kliknutím na
název projektu ho izolujete a přiblížíte jeho časové rozpětí, nebo kliknutím na
segment zaostříte všechny projekty na dané časové okno (`‹ reset` obnoví celý
pohled).

@include _shared/graphs.md#project-timeline

---

## Objemy produkce

Graf typu `timeseries` nad stejnými daty `project`: roční záznamy `production`
každého projektu podle roku. Parametr `style` u metrik kombinuje typy grafů —
ropa (`oil_kbbd`, sloupce) na primární (levé) ose a plyn (`gas_mmscfd`, čára)
na sekundární (pravé) ose — pro všechny tři projekty. Najetím na sloupec nebo
bod zobrazíte přesnou hodnotu.

@include _shared/graphs.md#production-timeseries

---

## Děkujeme

Dotazy?
