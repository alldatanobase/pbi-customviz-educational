# Power BI custom visual learning examples

This repository contains teaching examples for building custom visuals for Microsoft Power BI. The examples progress from a small D3 line chart to coordinated geologic visuals and an interactive Three.js turbine report.

These projects are intended for learning, demonstrations, and presentation material. They are not production-ready visual packages, validated scientific analyses, or operational monitoring systems. The synthetic values, editorial summaries, simplified geometry, and visual designs should be reviewed and adapted before being used for research, safety, maintenance, or business decisions.

## Examples

| Folder | Purpose |
| --- | --- |
| [`teaching-line-chart`](teaching-line-chart/) | A deliberately small D3 line chart that demonstrates Power BI data roles, `capabilities.json`, formatting settings, and visual rendering. |
| [`geologic-report`](geologic-report/) | Three coordinated visuals: a geologic-timescale slicer, a reconstructed paleo-globe, and a marine-fossil occurrence chart. |
| [`machine-report`](machine-report/) | A fleet filter, an interactive low-poly Three.js turbine selector, and an assembly-detail panel with synthetic telemetry. |

## Data sources and provenance

### Temperature line-chart sample

[`teaching-line-chart/sample-data/temperature.csv`](teaching-line-chart/sample-data/temperature.csv) is a small synthetic dataset created specifically for the line-chart lesson. Its dates and temperatures are invented and were not collected from an external weather service or scientific dataset.

### International Chronostratigraphic Chart

[`geologic-report/data/processed/geologic-timescale-units.csv`](geologic-report/data/processed/geologic-timescale-units.csv) is a teaching-oriented transcription and restructuring of Phanerozoic units, boundaries, hierarchy, and standard colors from the International Commission on Stratigraphy's International Chronostratigraphic Chart. The repository's processed table is simplified for the report and should be checked against the current chart before scientific use.

Sources:

- International Commission on Stratigraphy, [current International Chronostratigraphic Chart](https://stratigraphy.org/chart/).
- International Commission on Stratigraphy, [chart downloads and machine-readable chart data](https://stratigraphy.org/supplementary).
- Cohen, K. M., Harper, D. A. T., Gibbard, P. L., and Car, N., “The ICS international chronostratigraphic chart this decade,” *Episodes* 48 (2025), [https://doi.org/10.18814/epiiugs/2025/025001](https://doi.org/10.18814/epiiugs/2025/025001).

The chart is published under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Numerical boundary ages can change as the chart is revised.

### PALEOMAP PaleoAtlas and PaleoDEM

The paleo-globe geometry in [`geologic-report/data/processed/land-snapshots`](geologic-report/data/processed/land-snapshots/) was derived from the 1° longitude/latitude/elevation PALEOMAP PaleoDEM grids by Christopher R. Scotese and Nicky Wright. The build process extracts an interpolated zero-elevation contour, converts the resulting land polygons to GeoJSON, and simplifies them for browser rendering. The processed snapshots are therefore derivatives and do not preserve all information or resolution in the source grids.

[`geologic-report/data/processed/globe-series-snapshots.csv`](geologic-report/data/processed/globe-series-snapshots.csv) associates geologic series with nearby reconstructed ages. Its titles, labels, and narrative summaries were written for this demonstration.

The repository also contains the downloaded PALEOMAP PaleoAtlas GPlates project files used while evaluating the reconstruction workflow.

Sources:

- Scotese, C. R. and Wright, N. (2018), [PALEOMAP Paleodigital Elevation Models for the Phanerozoic](https://www.earthbyte.org/paleodem-resource-scotese-and-wright-2018/).
- Scotese, C. R. and Wright, N. (2018), [PaleoDEM data archive on Zenodo](https://doi.org/10.5281/zenodo.5460860).
- EarthByte, [PALEOMAP PaleoAtlas for GPlates](https://www.earthbyte.org/paleomap-paleoatlas-for-gplates/).
- GPlates Web Service, [published reconstruction-model catalog](https://gwsdoc.gplates.org/models/).

The downloaded PALEOMAP materials include a [CC BY 4.0 license](https://creativecommons.org/licenses/by/4.0/). Attribution and the original explanatory material should accompany redistributed derivatives.

### Paleobiology Database marine fossil occurrences

The following files are derived from Paleobiology Database Data Service 1.2 occurrence-count queries retrieved on September 30, 2026:

- [`marine-fossil-occurrences-by-period.csv`](geologic-report/data/processed/marine-fossil-occurrences-by-period.csv) contains counts for nine selected marine groups by geologic period.
- [`marine-fossil-period-summaries.csv`](geologic-report/data/processed/marine-fossil-period-summaries.csv) contains calculated leader shares and hand-authored period summaries.
- [`marine-fossil-visual-data.csv`](geologic-report/data/processed/marine-fossil-visual-data.csv) joins the occurrence counts and display narratives for Power BI.

Each row in `marine-fossil-occurrences-by-period.csv` retains its exact PBDB request in the `query_url` column. The requests use the occurrence endpoint, a taxonomic base name, a named interval, `timerule=major`, and `envtype=marine`. For example:

`https://paleobiodb.org/data1.2/occs/list.json?base_name=Trilobita&interval=Cambrian&timerule=major&envtype=marine&rowcount=&limit=1`

Sources:

- Paleobiology Database, [Data Service 1.2 documentation](https://paleobiodb.org/data1.2/).
- Peters, S. E. and McClennen, M. (2016), “The Paleobiology Database application programming interface,” *Paleobiology* 42(1), [https://doi.org/10.1017/pab.2015.39](https://doi.org/10.1017/pab.2015.39).
- Paleobiology Database, [main site and contributor information](https://paleobiodb.org/).

The chart reports database occurrence records, not numbers of organisms, population sizes, or unbiased diversity estimates. Preservation, exposure, collection, publication, and database-entry effort vary through time and among fossil groups. The narrative fields are editorial teaching text rather than content returned by PBDB.

### Turbine telemetry

[`machine-report/data/turbine-telemetry.csv`](machine-report/data/turbine-telemetry.csv) is entirely synthetic. It contains invented hourly readings, component descriptions, statuses, and narrative text for six fictional gas turbines. It was created to demonstrate Power BI cross-filtering, Three.js object selection, status cards, and compact metric charts; it is not based on readings from a real turbine, manufacturer, plant, or maintenance system.

No external operational dataset was used. The CSV in this repository is the primary source for the demonstration data.

## Use of the examples

The external datasets remain subject to their publishers' terms, attribution requirements, and revisions. When reusing an example, cite the original source as well as any transformation performed here. Power BI reports and `.pbiviz` packages in this repository may contain cached or embedded copies of the processed teaching data, so refresh or rebuild them when source files change.
