# Canada.ca Pulse

<!-- coolcode:guide -->
Choose series and a date range, inspect monthly values, and optionally index each series to its first positive observation. Locally saved annotations can mark a service change; matching timing does not establish why traffic changed.
<!-- /coolcode:guide -->

A browser-only dashboard for Employment and Social Development Canada's [Canada.ca analytics monthly report](https://open.canada.ca/data/en/dataset/477da0bc-a3f8-4054-b7be-3a27a575f413), published at <https://coolcode.ca/canadaanalytics/> when GitHub Pages deployment succeeds.

Compare published numeric series over any portion of the rolling window, inspect the exact source values for each month, or export the comparison as a CSV. An optional index uses the first positive value in range as the baseline (100) for each series. Text and mixed-type source rows are available as monthly values. The app leaves gaps for missing values. Mark service changes on the chart using annotations saved locally in your browser. A marker shows timing and does not establish causation.

## Build

```sh
python3 scripts/build.py
python3 -m http.server -d dist 8080
```

Use `python3 scripts/build.py --csv /path/to/canada_ca_key_metrics_monthly_report-english.csv` to build from a saved official file. The import detects the changing month columns and packs values into `dist/data/pulse.json`, with coverage and source timestamps when supplied. GitHub Actions fetches the official source daily or on manual dispatch and publishes `dist/` to GitHub Pages. A failed build keeps the previous live snapshot.

Contains information licensed under the [Open Government Licence – Canada](https://open.canada.ca/en/open-government-licence-canada).
