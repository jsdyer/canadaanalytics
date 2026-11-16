#!/usr/bin/env python3
"""Build the Canada.ca Pulse from the monthly report with English labels."""
import argparse
import csv
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
import io
import json
from pathlib import Path
import re
import shutil
from tempfile import TemporaryDirectory
from time import sleep
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
CATALOG = "https://open.canada.ca/data/en/dataset/477da0bc-a3f8-4054-b7be-3a27a575f413"
SOURCE = "https://open.canada.ca/data/dataset/477da0bc-a3f8-4054-b7be-3a27a575f413/resource/1ef8bae8-7657-4c6e-be68-d5b37517d2ee/download/canada_ca_key_metrics_monthly_report-english.csv"


def download():
    for attempt in range(3):
        try:
            req = Request(SOURCE, headers={"User-Agent": "CoolCode Canada.ca Pulse"})
            with urlopen(req, timeout=40) as response:
                if response.headers.get_content_type() == "text/html":
                    raise ValueError("Expected CSV, received an HTML page.")
                value = response.headers.get("Last-Modified")
                try:
                    modified = parsedate_to_datetime(value).date().isoformat() if value else ""
                except (TypeError, ValueError, OverflowError):
                    modified = ""
                return response.read(), modified
        except (OSError, ValueError) as error:
            if attempt == 2:
                raise RuntimeError(f"Canada.ca analytics download failed: {error}") from error
            sleep(2 ** attempt)


def date_label(value):
    match = re.fullmatch(r"(\d{4})[-/](\d{1,2})[-/]01", value.strip())
    if not match:
        return ""
    year, month = map(int, match.groups())
    return f"{year:04d}-{month:02d}" if 1900 <= year <= 2200 and 1 <= month <= 12 else ""


def parse_metric(value):
    text = value.strip()
    if not text or text.lower() in {"n/a", "na", "null", "-", "—", "--"}:
        return None, ""
    unsigned = text.replace(",", "").replace(" ", "").replace("\u00a0", "")
    unit = "percent" if unsigned.endswith("%") else "number"
    clean = unsigned.removesuffix("%")
    if re.fullmatch(r"[+−-]?(?:\d+(?:\.\d*)?|\.\d+)", clean):
        return float(clean.replace("−", "-")), unit
    if re.fullmatch(r"\d{1,5}:\d{2}:\d{2}", text):
        hours, minutes, seconds = map(int, text.split(":"))
        return hours * 3600 + minutes * 60 + seconds, "seconds"
    return None, "text"


def read_metrics(content):
    reader = csv.reader(io.StringIO(content.decode("utf-8-sig"), newline=""))
    columns = {}
    current_group = "Monthly metrics"
    pending_group = ""
    expects_labels = False
    unavailable = []
    entries = []
    month_labels = set()
    for row in reader:
        if not row:
            continue
        date_columns = {i: date_label(cell) for i, cell in enumerate(row) if i > 0 and date_label(cell)}
        if len(date_columns) >= 6:
            columns = date_columns
            month_labels.update(date_columns.values())
            current_group = pending_group or "Monthly metrics"
            pending_group = ""
            expects_labels = True
            continue
        if not columns:
            continue
        label = " · ".join(cell.strip() for cell in row[:min(columns)] if cell.strip())
        values = {month: row[i].strip() for i, month in columns.items() if i < len(row) and row[i].strip()}
        if not label:
            continue
        if label.startswith("#ERROR:"):
            unavailable.append([pending_group or current_group, label])
            pending_group = ""
            continue
        if not values:
            pending_group = label
            continue
        parsed = {month: parse_metric(value) for month, value in values.items()}
        units = {unit for _, unit in parsed.values() if unit}
        if expects_labels and units == {"text"} and len(set(values.values())) == 1 and len(values) >= 6:
            # Adobe repeats the measure name across a section's header row.
            measure = next(iter(values.values()))
            current_group = f"{label if current_group == 'Monthly metrics' else current_group} · {measure}"
            expects_labels = False
            continue
        expects_labels = False
        if label.casefold() == "average time spent on site":
            # The report labels the first cell '(seconds)' in place of a monthly observation.
            # Treat that cell as unavailable rather than moving the subsequent month values.
            for month, value in tuple(values.items()):
                if value.casefold() == "average time spent on site (seconds)":
                    del values[month]
                    del parsed[month]
            if parsed and all(unit in {"number", "seconds", ""} for _, unit in parsed.values()):
                parsed = {month: (value, "seconds") for month, (value, _) in parsed.items()}
                units = {"seconds"}
        if any(value for value in values.values()):
            unit = next(iter(units)) if len(units) == 1 else "mixed"
            entries.append((label, current_group, unit, values, parsed))
    if not month_labels or not entries:
        raise ValueError("Could not find monthly data columns and metric rows in the report.")
    months = sorted(month_labels)
    series = [
        {"id": i + 1, "label": label, "group": group, "unit": unit,
         "raw": [values.get(month, "") for month in months],
         "values": [parsed.get(month, (None,))[0] if unit in {"number", "percent", "seconds"} else None for month in months]}
        for i, (label, group, unit, values, parsed) in enumerate(entries)
    ]
    return months, series, unavailable


def build(content, modified, output):
    months, series, unavailable = read_metrics(content)
    if len(months) < 6 or not any(any(v is not None for v in row["values"]) for row in series):
        raise ValueError("The report has no usable monthly numeric series.")
    with TemporaryDirectory(prefix="canada-pulse-", dir=output.parent) as temporary:
        stage = Path(temporary) / "site"
        shutil.copytree(ROOT / "web", stage)
        asset = stage / "data"
        asset.mkdir()
        payload = {"version": 1, "months": months, "series": series, "sourceUpdated": modified,
                   "built": datetime.now(timezone.utc).isoformat(), "source": SOURCE, "catalog": CATALOG, "unavailable": unavailable}
        (asset / "pulse.json").write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        if output.exists():
            shutil.rmtree(output)
        stage.replace(output)
    print(f"{len(months)} monthly observations · {len(series)} series · {months[0]} to {months[-1]}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--csv", type=Path, help="Use a local copy of the official CSV.")
    parser.add_argument("--output", type=Path, default=ROOT / "dist")
    args = parser.parse_args()
    output = args.output.resolve()
    if output in (ROOT, ROOT / "web", ROOT / ".git") or output in ROOT.parents:
        parser.error("Choose a dedicated output folder.")
    output.parent.mkdir(parents=True, exist_ok=True)
    try:
        content, modified = (args.csv.read_bytes(), "") if args.csv else download()
        build(content, modified, output)
    except (RuntimeError, ValueError, OSError, UnicodeError, csv.Error) as error:
        parser.exit(1, f"Build failed: {error}\n")


if __name__ == "__main__":
    main()
