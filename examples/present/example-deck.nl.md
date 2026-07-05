---
title: xFrame Present — Demo
theme: light
author: Exergy LLC
header: xFrame Present
lang: nl
---

# xFrame Present

Markdown omzetten naar zelfstandige HTML-slides.

Gebruik `→` / `←` om te navigeren, druk op `t` om het thema te wisselen.

---

## Waarom?

- Geen runtime-afhankelijkheden in de output
- Eén zelfstandig HTML-bestand
- Werkt offline, print naar PDF

---

## Markdown, volledig

```ts
import { compile } from "xframe-present";

const html = compile("# Hello\n---\n# World");
```

> Alles wat Markdown kan, kan een slide tonen.

Note: vermeld dat GFM-functies zoals tabellen en task lists ook werken.

---

## Afbeeldingen

Een inline SVG data-URI (al zelfstandig):

![xFrame logo](data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4MDAiIGhlaWdodD0iNDUwIj48cmVjdCB3aWR0aD0iODAwIiBoZWlnaHQ9IjQ1MCIgZmlsbD0iIzI1NjNlYiIvPjxjaXJjbGUgY3g9IjQwMCIgY3k9IjIyNSIgcj0iMTIwIiBmaWxsPSIjNThhNmZmIi8+PHRleHQgeD0iNDAwIiB5PSIyNDAiIGZvbnQtZmFtaWx5PSJzYW5zLXNlcmlmIiBmb250LXNpemU9IjU2IiBmaWxsPSIjZmZmZmZmIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIj54RnJhbWU8L3RleHQ+PC9zdmc+ "click_to_zoom")

---

## Afbeeldingen via een URL

Een gewone PNG via URL. Standaard wordt deze ingebed als base64 data-URI
(geef `--no-embed-images` door om de oorspronkelijke URL te behouden), zodat de
deck offline bruikbaar blijft:

![PNG via URL](https://placehold.co/800x450/2563eb/ffffff/png?text=PNG+via+URL "click_to_zoom")

Voeg `"click_to_zoom"` toe als afbeeldingstitel om klikbaar te maken — opent
in een lightbox op volledig scherm. Klik ergens of druk op `Esc` om te sluiten.

---

## Website-snapshot

Een in git bewaarde PNG-snapshot van een live site. Klik op de afbeelding om de
pagina in een nieuw tabblad te openen. Vernieuw de PNG met `npm run snapshot` in
`ts/present/` (niet bij elke CI-run).

@include _shared/snapshots.md#poda-home

---

## Present-workflow

Hoe een Markdown-deck standalone HTML wordt: gedeelde fragmenten en
geconsolideerde data worden bij compilatie opgelost; PNG- en SVG-bestanden in git
worden als base64 ingebed. Maintainer-scripts vernieuwen snapshots en diagrammen
lokaal — niet bij elke CI-run.

@include _shared/diagrams.md#present-workflow

---

## Projecttijdlijnen

Een `timeline`-grafiek over de geconsolideerde `project`-data: één horizontale
gestapelde balk per project (Y-as), mijlpaaldata op de X-as en een markering voor
elke gebeurtenis in de levenscyclus. Beweeg over een markering of segment voor
details. Klik op een projectnaam om te isoleren en in te zoomen, of klik op een
segment om alle projecten op dat tijdvenster te focussen (`‹ reset` herstelt het
volledige overzicht).

@include _shared/graphs.md#project-timeline

---

## Productievolumes

Een `timeseries` over dezelfde `project`-data: jaarlijkse `production`-records
per project uitgezet per jaar. De `style` per metriek combineert grafiektypes —
olie (`oil_kbbd`, balken) op de primaire (linker) as en gas (`gas_mmscfd`, lijn)
op de secundaire (rechter) as — voor alle drie de projecten. Beweeg over een
balk of punt voor de exacte waarde.

@include _shared/graphs.md#production-timeseries

---

## Bedankt

Vragen?
