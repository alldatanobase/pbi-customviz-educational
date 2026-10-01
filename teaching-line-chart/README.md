# Simple D3 line chart for Power BI

One date field, one numeric value, and controls for line color, width, and points.

## Build

From this folder, run `npm ci`, then `npm run package`.
Import the resulting `.pbiviz` from `dist/` into Power BI Desktop.

Load `sample-data/temperature.csv` (simulated readings), set Date to the Date type,
then bind Date (not Date hierarchy) and TemperatureC to the visual. Use Average
for TemperatureC. Formatting controls are under **Line → Appearance**.

## Files

- `src/visual.ts` — Power BI lifecycle.
- `src/data.ts` — read the data supplied by Power BI.
- `src/chart.ts` — draw the line with D3.
- `src/settings.ts` — formatting controls.
- `style/visual.css` — plain CSS.
- `capabilities.json` — data roles and formatting properties.
- `pbiviz.json` — visual package metadata.

`npm start` runs the Power BI developer server if you use developer mode.

## How capabilities.json works

[`capabilities.json`](capabilities.json) describes the visual's contract with Power BI: which fields the report author can supply, how Power BI delivers their data, which formatting properties can be saved, and which special permissions the visual requests. It does not draw the chart. [`pbiviz.json`](pbiviz.json) points to this file through its `capabilities` property and separately defines package metadata.

This visual uses four top-level sections: `dataRoles`, `dataViewMappings`, `objects`, and `privileges`.

### 1. dataRoles: the Date and Value field wells

```json
"dataRoles": [
  { "name": "date", "displayName": "Date", "kind": "Grouping" },
  {
    "name": "value",
    "displayName": "Value",
    "kind": "Measure",
    "requiredTypes": [{ "numeric": true }]
  }
]
```

These entries create the two field wells where you drag columns or measures in Power BI.

| Property | Meaning in this visual |
|---|---|
| `name` | Internal identifier. `date` and `value` are referenced by the mapping and by `source.roles` in `src/data.ts`. They are not dataset column names. |
| `displayName` | The label shown to the report author: **Date** or **Value**. |
| `kind: "Grouping"` | Groups the data by the distinct values of the supplied field. Here, each date provides an x-axis position. |
| `kind: "Measure"` | Supplies a measure evaluated for each category. For the sample, use the average of TemperatureC for each date. |
| `requiredTypes` | Declares numeric input for Value. It does not convert a text column into numbers; set the column's data type in the model. |

The `date` role has no type restriction in this file. Its name and label alone do not enforce a date type. The chart's data reader expects Date values or parseable date strings, so bind a real Date column and select **Date**, not **Date hierarchy**. A hierarchy introduces levels that this single-category example is not designed to handle.

The `value` role is reusable: it can receive TemperatureC, another numeric column summarized in Power BI, or an explicit DAX measure. The JSON does not select Average versus Sum; that choice belongs to the report field or measure definition.

### 2. dataViewMappings: the shape of the supplied data

```json
"dataViewMappings": [{
  "conditions": [{ "date": { "max": 1 }, "value": { "max": 1 } }],
  "categorical": {
    "categories": {
      "for": { "in": "date" },
      "dataReductionAlgorithm": { "top": { "count": 1000 } }
    },
    "values": {
      "select": [{ "bind": { "to": "value" } }]
    }
  }
}]
```

There is one mapping, using the `categorical` shape. The chart receives category values and corresponding numeric values rather than raw CSV rows.

#### conditions: allow one field per role

`max: 1` limits each field well to one bound field. This counts fields, not rows: a single Date column can contain many dates. Both role limits apply together within this condition.

There is deliberately no `min: 1`. The original configuration required both Date and Value simultaneously, which blocked adding the first field. Allowing partial bindings lets the author fill either field well first. `readData()` in `src/data.ts` separately checks whether both columns are available before rendering and supplies an instructional message when they are not.

#### categorical.categories: use Date as the category

`"for": { "in": "date" }` maps fields assigned to the internal `date` role into `dataView.categorical.categories`. Because the condition permits at most one field, this example expects one category column.

The `top` data-reduction rule requests up to 1,000 category entries. It is a data-volume limit, not a ranking by temperature and not a guarantee of the latest 1,000 dates. This example does not fetch further batches. The renderer sorts the dates it receives; that cannot recover dates omitted by data reduction.

#### categorical.values: use Value as the measure

`"select": [{ "bind": { "to": "value" } }]` maps the single field assigned to the `value` role into `dataView.categorical.values`. `bind` refers to one field; the role names connect this mapping to `dataRoles`.

For example, after Power BI applies report filters and evaluates the measure, the relevant arrays might look like this:

```text
category.values:       [Jan 1, Jan 2, Jan 3]
measure.values:        [64.0,  64.8,  null]
```

Entries at the same index belong together. `readData()` finds the columns by their role metadata and converts these arrays into points:

```text
{ date: Jan 1, value: 64.0 }
{ date: Jan 2, value: 64.8 }
{ date: Jan 3, value: null }
```

`src/chart.ts` then uses D3 scales and a line generator to draw them. A supplied null value creates a gap. A date omitted entirely from the incoming data does not automatically create a gap.

### 3. objects: saved formatting properties

```json
"objects": {
  "line": {
    "displayName": "Line",
    "properties": {
      "color": {
        "displayName": "Color",
        "type": { "fill": { "solid": { "color": true } } }
      },
      "width": { "displayName": "Width", "type": { "numeric": true } },
      "showPoints": { "displayName": "Show points", "type": { "bool": true } }
    }
  }
}
```

`line` is the internal formatting object name. Its three properties declare the types Power BI can store for this visual:

| Property | Declared type | Control supplied by `src/settings.ts` | Default |
|---|---|---|---|
| `line.color` | Solid color fill | Color picker | Teal (`#147D73`) |
| `line.width` | Number | Numeric input | 2.5 pixels |
| `line.showPoints` | Boolean | Toggle | On |

The nested `fill.solid.color` declaration identifies a color property; it does not set the actual color. Similarly, `numeric: true` and `bool: true` declare types, not initial values.

The defaults and the width clamp of 1–8 pixels live in `src/settings.ts`, not in this JSON. The renderer keeps isolated readings visible even when ordinary point markers are turned off, because those readings have no line segment to show.

Declaring an object alone does not construct the modern Format pane. The code completes the connection:

1. `Visual.getFormattingModel()` returns the **Line → Appearance** card/group and its controls.
2. Each control has a descriptor matching the JSON names, such as `{ objectName: "line", propertyName: "color" }`.
3. Power BI supplies saved property values through `dataView.metadata.objects.line`.
4. `readSettings()` reads those values, applies defaults where needed, and passes the settings to the D3 renderer.

If you rename a property here, update its control descriptor, settings reader, and reset-to-default descriptor in `src/settings.ts` too. The internal names must agree.

### 4. privileges: no special permissions

```json
"privileges": []
```

The visual requests no special privileges such as external web access, local storage, or exporting files. Its data arrives from Power BI, and D3 is bundled with the visual. Loading the sample CSV is a report/model operation, not a request made by the visual.

This declaration does not configure the development server or its HTTPS certificate.

### When changing this file

For the Developer Visual, restart the development server and reload/re-add the visual if Power BI retains the old field definitions. For an imported visual, run `npm run package` and import the updated `.pbiviz`. Editing the local JSON does not update an already imported package.

Microsoft references: [capabilities](https://learn.microsoft.com/en-us/power-bi/developer/visuals/capabilities), [data-view mappings](https://learn.microsoft.com/en-us/power-bi/developer/visuals/dataview-mappings), and [Format pane](https://learn.microsoft.com/en-us/power-bi/developer/visuals/format-pane-general).
