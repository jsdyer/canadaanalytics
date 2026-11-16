const get = id => document.getElementById(id);
const ids = ["first","second","from","to","index","cursor","plot","legend","focus","table","filter","catalogue","filter-count","range-note","events","event-month","event-title","load-state"];
const ui = Object.fromEntries(ids.map(id => [id,get(id)]));
const ns = "http://www.w3.org/2000/svg";
const nf = new Intl.NumberFormat("en-CA", {maximumFractionDigits:2});
const monthFormat = new Intl.DateTimeFormat("en-CA",{month:"short",year:"numeric",timeZone:"UTC"});
const monthName = value => monthFormat.format(new Date(value + "-01T00:00:00Z"));
const colors = ["#296549","#9b4a14"];
const chart = {left:76,right:770,top:18,bottom:274};
const numUnits = ["number","percent","seconds"];
let data, range, selection, compare, rowsToShow = 45, chartIndex = false;
let marks = [];

try {
  const prior = JSON.parse(localStorage.getItem("coolcode-pulse-events") || "[]");
  if (Array.isArray(prior)) marks = prior.filter(m => m && typeof m.month === "string" && typeof m.title === "string").slice(0,100);
} catch { /* Optional browser storage. */ }

function node(tag, content, className) {
  const element = document.createElement(tag);
  if (content !== undefined) element.textContent = content;
  if (className) element.className = className;
  return element;
}

function svg(tag, attributes = {}, text) {
  const element = document.createElementNS(ns,tag);
  for (const [key,value] of Object.entries(attributes)) element.setAttribute(key,value);
  if (text !== undefined) element.textContent = text;
  ui.plot.append(element);
  return element;
}

function label(series) {
  return series.group === "Monthly metrics" ? series.label : `${series.label} · ${series.group}`;
}

function format(value, unit) {
  return value === null ? "Unavailable" : nf.format(value) + (unit === "percent" ? "%" : unit === "seconds" ? " s" : "");
}

function dateRange() {
  const start = Number(ui.from.value);
  const last = Number(ui.to.value);
  return Array.from({length: Math.max(0,last-start+1)},(_,i) => i + start);
}

function draw() {
  ui.plot.replaceChildren();
  if (!range.length) {
    svg("text",{x:40,y:100,fill:"#334235"},"Start month must come before end month.");
    return;
  }
  const lines = compare.map(series => {
    const baseIndex = chartIndex ? range.find(i => series.values[i] > 0) : undefined;
    const base = baseIndex === undefined ? null : series.values[baseIndex];
    return range.map(i => series.values[i] === null ? null : chartIndex
      ? (base === null || i < baseIndex ? null : series.values[i] * 100 / base) : series.values[i]);
  });
  const values = lines.flat().filter(v => v !== null);
  if (!values.length) {
    svg("text",{x:40,y:100,fill:"#334235"},"No numeric values in this range. See the monthly values below.");
    return;
  }
  let low = Math.min(...values), high = Math.max(...values);
  if (low === high) { const extra = Math.max(Math.abs(low) * .05, .01); low -= extra; high += extra; }
  else { const extra = (high-low)*.07; low -= extra; high += extra; }
  const x = i => range.length === 1 ? (chart.left + chart.right)/2 : chart.left + i*(chart.right-chart.left)/(range.length-1);
  const y = v => chart.bottom - (v-low)*(chart.bottom-chart.top)/(high-low);
  if (chartIndex) svg("text",{x:chart.left,y:14,fill:"#455544","font-size":10},"INDEX (=100 AT BASELINE)");
  for (let i = 0; i <= 4; i++) {
    const tick = low + (high-low)*i/4;
    svg("line",{x1:chart.left,y1:y(tick),x2:chart.right,y2:y(tick),stroke:"#b7bfaa"});
    const compact = new Intl.NumberFormat("en-CA",{notation: Math.abs(tick) >= 10000 ? "compact" : "standard",maximumFractionDigits:2});
    const unit = !chartIndex && compare[0]?.unit === "percent" ? "%" : !chartIndex && compare[0]?.unit === "seconds" ? " s" : "";
    svg("text",{x:chart.left-7,y:y(tick)+4,"text-anchor":"end",fill:"#455544","font-size":12}, compact.format(tick)+unit);
  }
  const skip = Math.max(1,Math.ceil(range.length/6));
  range.forEach((month,i) => {
    if (i % skip === 0 || (i === range.length-1 && i % skip > skip*.55)) {
      svg("text",{x:x(i),y:298,"text-anchor":"middle",fill:"#455544","font-size":12},monthName(data.months[month]));
    }
    const markers = marks.filter(mark => mark.month === data.months[month]);
    if (markers.length) {
      const line = svg("line",{x1:x(i),y1:chart.top,x2:x(i),y2:chart.bottom,stroke:"#716794","stroke-width":2,"stroke-dasharray":"5 4"});
      const title = document.createElementNS(ns,"title");
      title.textContent = markers.map(mark => mark.title).join("; ");
      line.append(title);
    }
  });
  lines.forEach((line,seriesIndex) => {
    let open = false, path = "";
    line.forEach((value,i) => {
      if (value === null) { open = false; return; }
      path += `${open ? "L" : "M"}${x(i)} ${y(value)}`;
      open = true;
    });
    if (path) svg("path",{d:path,fill:"none",stroke:colors[seriesIndex],"stroke-width":3});
    line.forEach((value,i) => {
      if (value !== null) svg("circle",{cx:x(i),cy:y(value),r:2.8,fill:colors[seriesIndex]});
    });
  });
  const cursor = Number(ui.cursor.value);
  if (cursor < range.length) {
    svg("line",{x1:x(cursor),y1:chart.top,x2:x(cursor),y2:chart.bottom,stroke:"#32463a","stroke-width":1,"pointer-events":"none"});
    lines.forEach((line,i) => {
      if (line[cursor] !== null) svg("circle",{cx:x(cursor),cy:y(line[cursor]),r:5,fill:colors[i],stroke:"#fff","stroke-width":2,"pointer-events":"none"});
    });
  }
}

function focusMonth() {
  const index = range[Number(ui.cursor.value)];
  if (index === undefined) { ui.focus.replaceChildren(node("p","Choose a valid range.")); return; }
  const period = data.months[index];
  const body = [node("strong",monthName(period))];
  for (const series of selection) {
    const raw = series.raw[index];
    const unitEligible = numUnits.includes(series.unit);
    const text = raw || (unitEligible ? format(series.values[index],series.unit) : "Unavailable");
    body.push(node("p", `${series.label}: ${text}`));
  }
  for (const mark of marks.filter(m => m.month === period)) body.push(node("p",`Event: ${mark.title}`, "description"));
  ui.focus.replaceChildren(...body);
  ui.cursor.setAttribute("aria-valuetext",monthName(period));
}

function table() {
  const body = node("tbody");
  for (const i of range) {
    const tr = node("tr");
    tr.append(node("td",monthName(data.months[i])), ...selection.map(row => node("td",row.raw[i] || "—")));
    body.append(tr);
  }
  const header = node("tr");
  header.append(node("th","Month"),...selection.map(row => node("th",label(row))));
  const head = node("thead");
  head.append(header);
  const element = node("table");
  element.append(head,body);
  ui.table.replaceChildren(element);
}

function redraw() {
  range = dateRange();
  const first = data.series.find(row => String(row.id) === ui.first.value);
  const second = data.series.find(row => String(row.id) === ui.second.value);
  selection = [first,second].filter(Boolean).filter((value,i,all) => all.indexOf(value) === i);
  compare = selection.filter(series => numUnits.includes(series.unit));
  const different = compare.length > 1 && compare[0].unit !== compare[1].unit;
  chartIndex = ui.index.checked;
  if (different && !chartIndex) compare = compare.slice(0,1);
  const notes = [];
  if (!range.length) notes.push("Choose an end month at or after the start month.");
  if (different && !chartIndex) notes.push("The metrics use different units. Select indexed comparison to plot both, or inspect the numeric table.");
  if (selection.some(series => !numUnits.includes(series.unit))) notes.push("Text or mixed values appear in the table.");
  if (chartIndex) {
    for (const series of compare) {
      const baseline = range.find(i => series.values[i] > 0);
      notes.push(baseline === undefined ? `${series.label} has no positive baseline in this range.` :
        `${series.label}: ${monthName(data.months[baseline])} = 100.`);
    }
  }
  ui["range-note"].textContent = notes.join(" ");
  ui.legend.replaceChildren(...compare.map((series,i) => node("span",label(series),"legend"+(i ? " two" : ""))));
  ui.cursor.max = Math.max(0,range.length-1);
  ui.cursor.disabled = range.length < 2;
  ui.cursor.value = ui.cursor.max;
  get("export").disabled = !range.length || !selection.length;
  focusMonth();
  draw();
  if (get("values").open) table();
}

function renderCatalogue() {
  const query = ui.filter.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const rows = data.series.filter(item => query.every(word => label(item).toLowerCase().includes(word)));
  ui["filter-count"].textContent = `${nf.format(rows.length)} matching ${rows.length === 1 ? "row" : "rows"}`;
  const items = rows.slice(0,rowsToShow).map(series => {
    const text = node("div");
    text.append(node("strong",series.label),node("p",`${series.group} · ${numUnits.includes(series.unit) ? "Numeric series" : "Text data"}`,"description"));
    const choose = node("button","Inspect");
    choose.type = "button";
    choose.addEventListener("click",() => {
      ui.first.value = String(series.id);
      redraw();
      get("chart-title").scrollIntoView();
    });
    const row = node("li");
    row.append(text,choose);
    return row;
  });
  if (rows.length > rowsToShow) {
    const more = node("button","Show more rows");
    more.type = "button";
    more.addEventListener("click",() => { rowsToShow += 45; renderCatalogue(); });
    const item = node("li");
    item.append(more);
    items.push(item);
  }
  ui.catalogue.replaceChildren(...items);
}

function saveEvents() {
  try { localStorage.setItem("coolcode-pulse-events",JSON.stringify(marks)); } catch { /* Storage is optional. */ }
  ui.events.replaceChildren(...marks.map((event,i) => {
    const item = node("li");
    const remove = node("button","Remove");
    remove.type = "button";
    remove.setAttribute("aria-label",`Remove ${event.title}`);
    remove.addEventListener("click",() => { marks.splice(i,1); saveEvents(); draw(); focusMonth(); });
    item.append(node("span",`${monthName(event.month)} · ${event.title}`),remove);
    return item;
  }));
}

function download() {
  const quote = value => '"' + value.replaceAll('"','""') + '"';
  // The downloaded data is from the publisher. Prevent spreadsheet formula execution.
  const safe = value => /^[=+@\t\r]|^-(?!\d)/.test(value) ? "'" + value : value;
  const lines = [["Month",...selection.map(label)],...range.map(i => [data.months[i],...selection.map(row => row.raw[i])])];
  const output = lines.map(row => row.map(value => quote(safe(value))).join(",")).join("\r\n");
  const object = URL.createObjectURL(new Blob([output],{type:"text/csv;charset=utf-8"}));
  const link = document.createElement("a");
  link.href = object;
  link.download = "canada-ca-pulse-comparison.csv";
  link.click();
  setTimeout(() => URL.revokeObjectURL(object),1000);
}

async function load() {
  const response = await fetch(new URL("./data/pulse.json",import.meta.url),{signal:AbortSignal.timeout(15_000)});
  if (!response.ok) throw new Error("Published snapshot unavailable");
  data = await response.json();
  if (data.version !== 1 || !data.months.length || !data.series.length) throw new Error("Snapshot schema mismatch");
  for (const series of data.series) {
    ui.first.add(new Option(label(series),series.id));
    ui.second.add(new Option(label(series),series.id));
  }
  data.months.forEach((month,i) => {
    ui.from.add(new Option(monthName(month),i));
    ui.to.add(new Option(monthName(month),i));
    ui["event-month"].add(new Option(monthName(month),month));
  });
  const eligible = data.series.filter(series => numUnits.includes(series.unit) && series.values.some(v => v !== null));
  const primary = eligible.find(series => /^(?:total )?visits$/i.test(series.label)) || eligible[0];
  if (primary) ui.first.value = String(primary.id);
  ui.to.value = String(data.months.length-1);
  ui["event-month"].value = data.months.at(-1);
  get("latest").textContent = monthName(data.months.at(-1));
  get("months").textContent = nf.format(data.months.length);
  get("series").textContent = nf.format(data.series.length);
  get("source-dates").textContent = `Reporting coverage: ${monthName(data.months[0])}–${monthName(data.months.at(-1))}. ` +
    (data.sourceUpdated ? `Source file modified: ${data.sourceUpdated}. ` : "") +
    `Snapshot built: ${data.built.slice(0,10)}.`;
  if (data.unavailable?.length) {
    const warning = node("p", "The source reports unavailable data for " +
      data.unavailable.map(row => row[0]).join(", ") + ".", "description");
    get("source-dates").after(warning);
  }
  ui["load-state"].hidden = true;
  get("workspace").hidden = false;
  redraw();
  renderCatalogue();
  saveEvents();
}
for (const key of ["first","second","from","to","index"]) ui[key].addEventListener("change",redraw);
ui.filter.addEventListener("input",() => { rowsToShow = 45; renderCatalogue(); });
ui.cursor.addEventListener("input",() => { focusMonth(); draw(); });
ui.plot.addEventListener("click",event => {
  if (range.length < 2) return;
  const box = ui.plot.getBoundingClientRect();
  const x = (event.clientX-box.left) * 800 / box.width;
  ui.cursor.value = Math.round(Math.max(0,Math.min(1,(x-chart.left)/(chart.right-chart.left))) * (range.length-1));
  focusMonth();
  draw();
});
get("values").addEventListener("toggle",() => { if (data && get("values").open) table(); });
get("event-form").addEventListener("submit",event => {
  event.preventDefault();
  const title = ui["event-title"].value.trim();
  if (!title || marks.length >= 100) return;
  marks.push({month:ui["event-month"].value,title});
  ui["event-title"].value = "";
  saveEvents(); focusMonth(); draw();
});
get("export").addEventListener("click",download);
load().catch(() => {
  ui["load-state"].textContent = "The published snapshot could not load. Reload the page or use the official dataset link.";
});
