<!-- @fragment project-timeline -->
```xframe-graph
{
  "type": "timeline",
  "title": "Subsea tieback lifecycles",
  "entity": "project",
  "rowLabel": "name",
  "sort": "timeline",
  "barSize": "budget",
  "rowDetails": ["partners","budget"],
  "events": {
    "path": "milestones",
    "date": "date",
    "category": "milestone_key.phase"
  },
  "categories": ["discovery", "appraisal", "FID", "first_oil", "end_of_life"]
}
```
<!-- @end -->

<!-- @fragment production-timeseries -->
```xframe-graph
{
  "type": "timeseries",
  "title": "Annual oil & gas production",
  "entity": "project",
  "seriesLabel": "name",
  "points": {
    "path": "production",
    "x": "production_key.year",
    "y": [
      { "field": "oil_kbbd", "axis": "primary", "label": "Oil (kbbd)", "style": "bar" },
      { "field": "gas_mmscfd", "axis": "secondary", "label": "Gas (MMscfd)", "style": "line" }
    ]
  },
  "axes": {
    "primary": { "label": "Oil (kbbd)" },
    "secondary": { "label": "Gas (MMscfd)" }
  }
}
```
<!-- @end -->
