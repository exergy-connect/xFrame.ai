---
title: xFrame Present — Démo
author: Exergy LLC
header: xFrame Present
lang: fr
---

# xFrame Present

Compilez du Markdown en diapositives HTML autonomes.

Utilisez `→` / `←` pour naviguer, appuyez sur `t` pour changer de thème.

---

## Pourquoi ?

- Aucune dépendance d'exécution dans le résultat
- Un seul fichier HTML autonome
- Fonctionne hors ligne, s'imprime en PDF

---

## Markdown, intégralement

```ts
import { compile } from "xframe-present";

const html = compile("# Hello\n---\n# World");
```

> Tout ce que Markdown peut exprimer, une diapositive peut l'afficher.

Note: mentionner que les fonctionnalités GFM comme les tableaux et les listes de tâches fonctionnent aussi.

---

## Images

Un URI de données SVG intégré (déjà autonome) :

![xFrame logo](data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4MDAiIGhlaWdodD0iNDUwIj48cmVjdCB3aWR0aD0iODAwIiBoZWlnaHQ9IjQ1MCIgZmlsbD0iIzI1NjNlYiIvPjxjaXJjbGUgY3g9IjQwMCIgY3k9IjIyNSIgcj0iMTIwIiBmaWxsPSIjNThhNmZmIi8+PHRleHQgeD0iNDAwIiB5PSIyNDAiIGZvbnQtZmFtaWx5PSJzYW5zLXNlcmlmIiBmb250LXNpemU9IjU2IiBmaWxsPSIjZmZmZmZmIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIj54RnJhbWU8L3RleHQ+PC9zdmc+ "click_to_zoom")

---

## Images depuis une URL

Un PNG classique référencé par URL. Il est intégré par défaut en URI de données base64
(passez `--no-embed-images` pour conserver l'URL d'origine), afin que le deck
reste utilisable hors ligne :

![PNG via URL](https://placehold.co/800x450/2563eb/ffffff/png?text=PNG+via+URL "click_to_zoom")

Ajoutez `"click_to_zoom"` comme titre de l'image pour la rendre cliquable — elle
s'ouvre en plein écran dans une lightbox. Cliquez n'importe où ou appuyez sur `Esc` pour fermer.

---

## Capture d'écran de site web

Une capture PNG versionnée dans git d'un site en ligne. Cliquez sur l'image pour ouvrir la page dans
un nouvel onglet. Actualisez la PNG avec `npm run snapshot` dans `ts/present/` (pas à chaque
exécution CI).

@include _shared/snapshots.md#poda-home

---

## Flux de travail Present

Comment un deck Markdown devient du HTML autonome : les fragments partagés et les données
consolidées sont résolus à la compilation ; les ressources PNG et SVG versionnées dans git sont intégrées
en base64. Les scripts de maintenance actualisent les captures et les diagrammes localement — pas à chaque
exécution CI.

@include _shared/diagrams.md#present-workflow

---

## Chronologies de projet

Un graphique `timeline` sur les données consolidées `project` : une barre horizontale empilée
par projet (axe Y), les dates des jalons sur l'axe X, avec un marqueur pour chaque
événement du cycle de vie. Survolez un marqueur ou un segment pour voir les détails. Cliquez sur le nom d'un projet pour
l'isoler et zoomer sur sa période, ou cliquez sur un segment pour focaliser tous les projets sur
cette fenêtre temporelle (`‹ reset` rétablit la vue complète).

@include _shared/graphs.md#project-timeline

---

## Volumes de production

Une `timeseries` sur les mêmes données `project` : les enregistrements annuels de `production`
de chaque projet, tracés par année. Le `style` par métrique combine les types de graphiques — pétrole
(`oil_kbbd`, barres) sur l'axe primaire (gauche) et gaz (`gas_mmscfd`, courbe)
sur l'axe secondaire (droite) — pour les trois projets. Survolez une barre ou un
point pour obtenir sa valeur exacte.

@include _shared/graphs.md#production-timeseries

---

## Merci

Des questions ?
