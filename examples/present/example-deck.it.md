---
title: xFrame Present — Demo
theme: light
author: Exergy LLC
header: xFrame Present
footer: © Exergy ∞ LLC @builddatetime
data: ../consolidate/output/consolidated_data.json
lang: it
---

# xFrame Present

Compila Markdown in slide HTML autonome.

Usa `→` / `←` per navigare, premi `t` per cambiare tema.

---

## Perché?

- Nessuna dipendenza runtime nell'output
- Un unico file HTML autonomo
- Funziona offline, stampabile in PDF

---

## Markdown al completo

```ts
import { compile } from "xframe-present";

const html = compile("# Hello\n---\n# World");
```

> Tutto ciò che Markdown può esprimere, una slide può mostrarlo.

Note: ricorda che le funzionalità GFM come tabelle e task list funzionano anche qui.

---

## Immagini

Un data URI SVG inline (già autonomo):

![xFrame logo](data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4MDAiIGhlaWdodD0iNDUwIj48cmVjdCB3aWR0aD0iODAwIiBoZWlnaHQ9IjQ1MCIgZmlsbD0iIzI1NjNlYiIvPjxjaXJjbGUgY3g9IjQwMCIgY3k9IjIyNSIgcj0iMTIwIiBmaWxsPSIjNThhNmZmIi8+PHRleHQgeD0iNDAwIiB5PSIyNDAiIGZvbnQtZmFtaWx5PSJzYW5zLXNlcmlmIiBmb250LXNpemU9IjU2IiBmaWxsPSIjZmZmZmZmIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIj54RnJhbWU8L3RleHQ+PC9zdmc+ "click_to_zoom")

---

## Immagini da URL

Un PNG normale referenziato via URL. Per impostazione predefinita viene incorporato
come data URI base64 (passa `--no-embed-images` per mantenere l'URL originale),
così il deck resta utilizzabile offline:

![PNG via URL](https://placehold.co/800x450/2563eb/ffffff/png?text=PNG+via+URL "click_to_zoom")

Aggiungi `"click_to_zoom"` come titolo dell'immagine per renderla cliccabile — si
apre a schermo intero in un lightbox. Clicca ovunque o premi `Esc` per chiudere.

---

## Snapshot del sito web

Una PNG tracciata in git di un sito live. Clicca l'immagine per aprire la pagina
in una nuova scheda. Aggiorna la PNG con `npm run snapshot` in `ts/present/` (non
a ogni run CI).

@include _shared/snapshots.md#poda-home

---

## Flusso di lavoro Present

Come un deck Markdown diventa HTML autonomo: frammenti condivisi e dati
consolidati vengono risolti in compilazione; PNG e SVG tracciati in git sono
incorporati in base64. Gli script di manutenzione aggiornano snapshot e diagrammi
in locale — non a ogni run CI.

@include _shared/diagrams.md#present-workflow

---

## Timeline di progetto

Un grafico `timeline` sui dati consolidati `project`: una barra orizzontale
impilata per progetto (asse Y), date delle milestone sull'asse X e un indicatore
per ogni evento del ciclo di vita. Passa il mouse su un indicatore o un segmento
per i dettagli. Clicca sul nome di un progetto per isolarlo e zoomare sul suo
intervallo temporale, oppure clicca su un segmento per mettere a fuoco tutti i
progetti su quella finestra (`‹ reset` ripristina la vista completa).

@include _shared/graphs.md#project-timeline

---

## Volumi di produzione

Un `timeseries` sugli stessi dati `project`: i record annuali di `production` di
ogni progetto, tracciati per anno. Lo `style` per metrica combina tipi di grafico
— petrolio (`oil_kbbd`, barre) sull'asse primario (sinistro) e gas (`gas_mmscfd`,
linea) sull'asse secondario (destro) — per tutti e tre i progetti. Passa il mouse
su una barra o un punto per il valore esatto.

@include _shared/graphs.md#production-timeseries

---

## Grazie

Domande?
