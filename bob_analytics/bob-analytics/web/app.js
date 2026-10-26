"use strict";
/* Bob Analytics front end. All text is inserted with textContent; charts are SVG built via the DOM. */

const SVGNS = "http://www.w3.org/2000/svg";
const PALETTE = ["#3b82d4", "#7c5cd8", "#2a9d8f", "#e9a23b", "#d1495b", "#5c7a99", "#8a8f98"];
const OUTCOME_COLORS = { one_shot: "#2a9d8f", multi_turn: "#3b82d4", cancelled: "#d1495b" };
const OUTCOME_LABELS = { one_shot: "One-shot", multi_turn: "Multi-turn", cancelled: "Cancelled" };
const QUALITY_COLORS = ["#2a9d8f", "#3b82d4", "#e9a23b", "#d1495b"];
const AXIS = "#57606a";
const GRID = "#e5e7eb";

function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v == null) continue;
    if (k === "class") e.className = v;
    else e.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat()) if (kid != null) e.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return e;
}

function s(tag, attrs, ...kids) {
  const e = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs || {})) if (v != null) e.setAttribute(k, String(v));
  for (const kid of kids.flat()) if (kid != null) e.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return e;
}

const $ = (id) => document.getElementById(id);
const fmt = (n, d = 2) => (Number.isFinite(n) ? n.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d }) : "-");
const pct = (x) => `${Math.round(x * 100)}%`;
const short = (t, n = 28) => (t.length <= n ? t : t.slice(0, 11) + "..." + t.slice(-(n - 14)));
const shortDate = (iso) => {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

function clear(node) { node.replaceChildren(); }
function empty(node, msg) { clear(node); node.append(h("p", { class: "muted empty" }, msg)); }

function niceMax(v) {
  if (!(v > 0)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
}

function legend(items) {
  return h("div", { class: "legend" }, items.map(([label, color]) =>
    h("span", { class: "legend-item" }, h("span", { class: "swatch", "data-c": color }), label)));
}

/* Swatch colors are set through the CSSOM, which the strict CSP allows (inline style attributes are not). */
function paintSwatches(root) {
  root.querySelectorAll(".swatch").forEach((sw) => { sw.style.backgroundColor = sw.dataset.c; });
}

function svgRoot(w, hgt, label) {
  return s("svg", { viewBox: `0 0 ${w} ${hgt}`, role: "img", "aria-label": label, class: "chart" });
}

/* ------------------------------------------------------------------ charts */
function hbar(node, items, color, unitLabel) {
  clear(node);
  if (!items.length) return empty(node, "No data yet.");
  const rowH = 30, left = 150, right = 90, w = 560;
  const max = Math.max(...items.map((i) => i.value), 1e-9);
  const svg = svgRoot(w, items.length * rowH + 8, "Bar chart");
  items.forEach((it, i) => {
    const y = i * rowH + 4;
    const bw = Math.max(2, ((w - left - right) * it.value) / max);
    svg.append(
      s("text", { x: left - 8, y: y + 17, "text-anchor": "end", "font-size": 12, fill: "#1f2328" }, short(it.label, 22), s("title", {}, it.label)),
      s("rect", { x: left, y: y + 3, width: bw, height: rowH - 10, rx: 3, fill: color }, s("title", {}, it.title || `${it.label}: ${it.valueLabel}`)),
      s("text", { x: left + bw + 6, y: y + 17, "font-size": 12, fill: AXIS }, it.valueLabel),
    );
  });
  node.append(svg);
  if (unitLabel) node.append(h("p", { class: "muted axis-note" }, unitLabel));
}

function stackedColumns(node, cats, keys, colorOf, labelOf, yLabel) {
  clear(node);
  const totals = cats.map((c) => keys.reduce((a, k) => a + (c.values[k] || 0), 0));
  if (!cats.length || !totals.some((t) => t > 0)) return empty(node, "No data yet.");
  const w = 560, hgt = 260, l = 46, r = 10, t = 10, b = 36;
  const ymax = niceMax(Math.max(...totals));
  const plotH = hgt - t - b, plotW = w - l - r;
  const slot = plotW / cats.length;
  const bw = Math.min(46, slot * 0.7);
  const svg = svgRoot(w, hgt, "Stacked column chart");
  for (let i = 0; i <= 4; i++) {
    const v = (ymax * i) / 4, y = t + plotH - (plotH * i) / 4;
    svg.append(s("line", { x1: l, x2: w - r, y1: y, y2: y, stroke: GRID }), s("text", { x: l - 6, y: y + 4, "text-anchor": "end", "font-size": 11, fill: AXIS }, fmt(v, v < 10 ? 1 : 0)));
  }
  const every = Math.ceil(cats.length / 12);
  cats.forEach((c, i) => {
    const x = l + slot * i + (slot - bw) / 2;
    let acc = 0;
    for (const k of keys) {
      const v = c.values[k] || 0;
      if (!(v > 0)) continue;
      const hh = (plotH * v) / ymax, y = t + plotH - (plotH * (acc + v)) / ymax;
      svg.append(s("rect", { x, y, width: bw, height: Math.max(hh, 0.5), fill: colorOf(k) }, s("title", {}, `${c.label} - ${labelOf(k)}: ${fmt(v, 2)}`)));
      acc += v;
    }
    if (i % every === 0) svg.append(s("text", { x: x + bw / 2, y: hgt - 16, "text-anchor": "middle", "font-size": 11, fill: AXIS }, c.label));
  });
  node.append(svg);
  node.append(legend(keys.filter((k) => cats.some((c) => c.values[k] > 0)).map((k) => [labelOf(k), colorOf(k)])));
  if (yLabel) node.append(h("p", { class: "muted axis-note" }, yLabel));
  paintSwatches(node);
}

function donut(node, slices, centerTop, centerBottom) {
  clear(node);
  const total = slices.reduce((a, x) => a + x.value, 0);
  if (!(total > 0)) return empty(node, "No data yet.");
  const size = 200, cx = 100, cy = 100, R = 80, r = 52;
  const svg = svgRoot(size, size, "Donut chart");
  let ang = -Math.PI / 2;
  const live = slices.filter((x) => x.value > 0);
  live.forEach((sl) => {
    const frac = sl.value / total;
    const a2 = ang + (live.length === 1 ? Math.PI * 2 - 0.0001 : frac * Math.PI * 2);
    const p = (a, rad) => [cx + rad * Math.cos(a), cy + rad * Math.sin(a)];
    const [x1, y1] = p(ang, R), [x2, y2] = p(a2, R), [x3, y3] = p(a2, r), [x4, y4] = p(ang, r);
    const large = a2 - ang > Math.PI ? 1 : 0;
    svg.append(s("path", { d: `M${x1} ${y1} A${R} ${R} 0 ${large} 1 ${x2} ${y2} L${x3} ${y3} A${r} ${r} 0 ${large} 0 ${x4} ${y4} Z`, fill: sl.color },
      s("title", {}, `${sl.label}: ${sl.value} (${pct(frac)})`)));
    ang = a2;
  });
  svg.append(
    s("text", { x: cx, y: cy + 2, "text-anchor": "middle", "font-size": 24, "font-weight": 600, fill: "#1f2328" }, centerTop),
    s("text", { x: cx, y: cy + 20, "text-anchor": "middle", "font-size": 11, fill: AXIS }, centerBottom),
  );
  node.append(h("div", { class: "donut-wrap" }, svg));
  node.append(legend(slices.map((x) => [`${x.label} (${x.value})`, x.color])));
  paintSwatches(node);
}

function cycleChart(node, cyc) {
  clear(node);
  const w = 760, hgt = 300, l = 52, r = 16, t = 14, b = 34;
  const n = cyc.days_total;
  const candidates = [cyc.spent, cyc.projected, cyc.budget || 0];
  const ymax = niceMax(Math.max(...candidates) * 1.05);
  const plotW = w - l - r, plotH = hgt - t - b;
  const X = (day) => l + (plotW * day) / n;
  const Y = (v) => t + plotH - (plotH * v) / ymax;
  const svg = svgRoot(w, hgt, "Cumulative spend across the credit cycle");
  for (let i = 0; i <= 4; i++) {
    const v = (ymax * i) / 4;
    svg.append(s("line", { x1: l, x2: w - r, y1: Y(v), y2: Y(v), stroke: GRID }), s("text", { x: l - 6, y: Y(v) + 4, "text-anchor": "end", "font-size": 11, fill: AXIS }, fmt(v, v < 10 ? 1 : 0)));
  }
  const start = new Date(cyc.start + "T00:00:00");
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(f * n));
  ticks.forEach((d) => {
    const dt = new Date(start); dt.setDate(dt.getDate() + d);
    svg.append(s("text", { x: X(d), y: hgt - 12, "text-anchor": d === 0 ? "start" : d === n ? "end" : "middle", "font-size": 11, fill: AXIS },
      d === n ? "Reset" : dt.toLocaleDateString(undefined, { month: "short", day: "numeric" })));
  });
  if (cyc.budget) {
    svg.append(
      s("line", { x1: l, x2: w - r, y1: Y(cyc.budget), y2: Y(cyc.budget), stroke: "#d1495b", "stroke-dasharray": "6 4" }),
      s("text", { x: w - r, y: Y(cyc.budget) - 5, "text-anchor": "end", "font-size": 11, fill: "#d1495b" }, `Budget ${fmt(cyc.budget, 0)}`),
      s("line", { x1: X(0), y1: Y(0), x2: X(n), y2: Y(cyc.budget), stroke: "#8a8f98", "stroke-dasharray": "2 4" }),
    );
  }
  const pts = [[0, 0], ...cyc.daily.map((d, i) => [i + 1, d.cumulative])];
  const area = `M${X(0)} ${Y(0)} ` + pts.map(([d, v]) => `L${X(d)} ${Y(v)}`).join(" ") + ` L${X(pts[pts.length - 1][0])} ${Y(0)} Z`;
  svg.append(s("path", { d: area, fill: "#3b82d4", "fill-opacity": 0.12 }));
  svg.append(s("polyline", { points: pts.map(([d, v]) => `${X(d)},${Y(v)}`).join(" "), fill: "none", stroke: "#3b82d4", "stroke-width": 2.5 }));
  const [ld, lv] = pts[pts.length - 1];
  if (ld < n) {
    svg.append(s("line", { x1: X(ld), y1: Y(lv), x2: X(n), y2: Y(cyc.projected), stroke: "#7c5cd8", "stroke-width": 2, "stroke-dasharray": "6 4" }));
  }
  cyc.daily.forEach((d, i) => svg.append(s("circle", { cx: X(i + 1), cy: Y(d.cumulative), r: 3, fill: "#3b82d4" }, s("title", {}, `${shortDate(d.date)}: ${fmt(d.cumulative)} cumulative (+${fmt(d.cost)} that day)`))));
  svg.append(s("circle", { cx: X(ld), cy: Y(lv), r: 5, fill: "#3b82d4" }));
  node.append(svg);
  node.append(legend([["Spent so far", "#3b82d4"], ["Projected to reset", "#7c5cd8"], ...(cyc.budget ? [["Budget", "#d1495b"], ["Even pace", "#8a8f98"]] : [])]));
  paintSwatches(node);
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function heatmap(node, grid) {
  clear(node);
  const max = Math.max(...grid.flat(), 0);
  if (!(max > 0)) return empty(node, "No prompts yet.");
  const cell = 22, left = 40, top = 6, w = left + 24 * cell + 4, hgt = top + 7 * cell + 22;
  const svg = svgRoot(w, hgt, "Prompts by weekday and hour");
  grid.forEach((row, d) => {
    svg.append(s("text", { x: left - 6, y: top + d * cell + 15, "text-anchor": "end", "font-size": 11, fill: AXIS }, DAYS[d]));
    row.forEach((v, hr) => {
      svg.append(s("rect", {
        x: left + hr * cell, y: top + d * cell, width: cell - 2, height: cell - 2, rx: 3,
        fill: v ? "#3b82d4" : GRID, "fill-opacity": v ? 0.2 + 0.8 * (v / max) : 1,
      }, s("title", {}, `${DAYS[d]} ${String(hr).padStart(2, "0")}:00 - ${v} prompt${v === 1 ? "" : "s"}`)));
    });
  });
  [0, 6, 12, 18].forEach((hr) => svg.append(s("text", { x: left + hr * cell, y: hgt - 6, "font-size": 11, fill: AXIS }, `${String(hr).padStart(2, "0")}:00`)));
  node.append(svg);
}

function renderHabits(d) {
  const hb = d.habits, hy = d.hygiene;
  const bits = [`${hb.active_days} active day${hb.active_days === 1 ? "" : "s"}`, `longest streak ${hb.longest_streak}`, `current streak ${hb.current_streak}`];
  if (hb.top20_share != null) bits.push(`top 20% of conversations = ${pct(hb.top20_share)} of spend`);
  if (hb.fixed_overhead_share != null) bits.push(`${pct(hb.fixed_overhead_share)} of context is fixed overhead (rules, tools, system)`);
  if (hy.prompts_with_secrets) bits.push(`${hy.prompts_with_secrets} prompt(s) may contain secrets`);
  $("habit-note").textContent = bits.join(" | ") + ". Hours are in your local time.";
  heatmap($("chart-heat"), hb.heatmap);
}

function copyButton(text) {
  const btn = h("button", { type: "button", class: "secondary" }, "Copy suggestion");
  btn.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(text); btn.textContent = "Copied"; } catch { btn.textContent = "Copy not available"; }
    setTimeout(() => { btn.textContent = "Copy suggestion"; }, 1500);
  });
  return h("div", { class: "copy-row" }, btn);
}

/* Shared by the live optimizer and the past-prompt review. */
function analysisView(a, original) {
  const tone = a.score >= 75 ? "good" : a.score >= 50 ? "mid" : "bad";
  const checks = [["Enough detail", a.checks.length], ["File or error named", a.checks.context], ["Goal or format", a.checks.goal_or_format], ["One task", a.checks.single_objective]];
  const kids = [
    h("div", { class: "opt-top" }, h("div", { class: `opt-score ${tone}` }, String(a.score)), h("div", {}, h("strong", {}, a.bucket), h("div", { class: "muted" }, "prompt quality, out of 100"))),
    h("ul", { class: "opt-checks" }, checks.map(([l, ok]) => h("li", { class: ok ? "ok" : "no" }, `${ok ? "Yes" : "Missing"}: ${l}`))),
  ];
  if (a.issues.length) {
    kids.push(h("ul", { class: "issues" }, a.issues.map((i) => h("li", { class: i.level },
      h("span", {}, i.message + " "),
      h("span", { class: `src src-${i.source}`, title: i.why }, i.source_label),
      h("div", { class: "why muted" }, i.why)))));
  } else {
    kids.push(h("p", {}, "This prompt looks clear. No changes suggested."));
  }
  if (a.stepwise) kids.push(h("p", { class: "muted" }, "Numbered steps toward one goal are treated as a single task."));
  if (a.truncated) kids.push(h("p", { class: "muted" }, "Only the first 8000 characters were analysed."));
  if (original) kids.push(h("div", { class: "sugg-label" }, "Your prompt (redacted)"), h("pre", { class: "prompt-box" }, a.redacted));
  if (a.suggested) kids.push(h("div", { class: "sugg-label" }, "Suggested version"), h("pre", { class: "prompt-box suggested" }, a.suggested), copyButton(a.suggested));
  return kids;
}

function renderReview(d) {
  const card = $("review-card"), root = $("review");
  card.hidden = !d.prompt_review.enabled;
  clear(root);
  if (!d.prompt_review.enabled) return;
  if (!d.prompt_review.items.length) return empty(root, "No prompts to review yet.");
  d.prompt_review.items.forEach((it) => {
    const a = it;
    root.append(h("article", { class: "review-item" },
      h("div", { class: "review-head" }, h("span", {}, `${shortDate(it.date)} | ${it.folder}`), h("span", {}, `${it.prompts} prompt${it.prompts === 1 ? "" : "s"} | ${fmt(it.cost)} ${d.unit}`)),
      ...analysisView(a, true)));
  });
}

/* ---- live optimizer: debounced, one request in flight, stale replies ignored */
let optTimer = null, optSeq = 0;
function renderOptResult(node, a) { node.replaceChildren(...analysisView(a, false)); }

function setupOptimizer() {
  const input = $("opt-input"), out = $("opt-result"), count = $("opt-count");
  input.addEventListener("input", () => {
    count.textContent = `${input.value.length} / 8000`;
    clearTimeout(optTimer);
    if (!input.value.trim()) { optSeq++; clear(out); return; }
    optTimer = setTimeout(async () => {
      const seq = ++optSeq;
      try {
        const res = await fetch("/api/optimize", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: input.value }) });
        if (res.status === 401) return location.reload();
        if (seq !== optSeq) return;
        if (!res.ok) return empty(out, "Could not analyse that prompt.");
        renderOptResult(out, await res.json());
      } catch {
        if (seq === optSeq) empty(out, "Could not reach the local server.");
      }
    }, 300);
  });
}

/* ------------------------------------------------------------------ sections */
function kpi(label, value, sub, tone) {
  return h("div", { class: "kpi" + (tone ? " " + tone : "") }, h("div", { class: "kpi-label" }, label), h("div", { class: "kpi-value" }, value), h("div", { class: "kpi-sub muted" }, sub || ""));
}

function renderKpis(d) {
  const c = d.cycle, e = d.efficiency, m = e.metrics;
  const tone = c.status === "exceeded" || c.status === "over_pace" ? "bad" : c.status === "on_track" ? "good" : "";
  const projSub = c.budget
    ? c.status === "exceeded" ? "Budget used" : `${c.status === "over_pace" ? "Over" : "Under"} budget of ${fmt(c.budget, 0)}${c.run_out_date ? ` - runs out ~${shortDate(c.run_out_date)}` : ""}`
    : "Set a budget in settings";
  $("kpis").replaceChildren(
    kpi("Spent this cycle", fmt(c.spent), c.remaining != null ? `${fmt(Math.max(c.remaining, 0))} remaining` : `${d.unit}`),
    kpi("Projected by reset", fmt(c.projected), projSub, tone),
    kpi("Days until reset", String(c.days_left), `Resets ${shortDate(c.end)}`),
    kpi("Efficiency score", e.score == null ? "-" : `${e.score}/100`, e.score == null ? "Not enough data" : "See breakdown below", e.score == null ? "" : e.score >= 75 ? "good" : e.score >= 50 ? "" : "bad"),
    kpi("Avg per conversation", fmt(m.avg_cost_per_conversation), `${m.conversations_with_prompts} conversations`),
    kpi("One-shot rate", pct(m.one_shot_rate), `${pct(m.follow_up_rate)} follow-ups (cost signal, not a flaw)`),
    kpi("Vs last cycle", d.comparison.delta_pct == null ? "-" : `${d.comparison.delta_pct > 0 ? "+" : ""}${pct(d.comparison.delta_pct)}`,
      d.comparison.delta_pct == null ? `No spend at this point in ${d.comparison.prev_label}` : `${fmt(d.comparison.same_point)} at this point in ${d.comparison.prev_label}`,
      d.comparison.delta_pct == null ? "" : d.comparison.delta_pct > 0.25 ? "bad" : d.comparison.delta_pct < 0 ? "good" : ""),
    kpi("Usage streak", `${d.habits.current_streak} day${d.habits.current_streak === 1 ? "" : "s"}`, `Longest ${d.habits.longest_streak}; ${d.habits.active_days} active days`),
  );
}

function renderCycle(d) {
  const c = d.cycle;
  $("cycle-note").textContent = `Cycle ${shortDate(c.start)} to ${shortDate(c.end)}. Day ${c.days_elapsed} of ${c.days_total}; average ${fmt(c.avg_daily)} per day.`;
  cycleChart($("chart-cycle"), c);
}

function folderPalette(d) {
  const top = d.folders.filter((f) => f.cost > 0).slice(0, 6).map((f) => f.folder);
  const colors = {};
  top.forEach((f, i) => { colors[f] = PALETTE[i]; });
  colors.Other = PALETTE[6];
  return { top, colors, key: (f) => (top.includes(f) ? f : "Other") };
}

function renderFolders(d) {
  const fp = folderPalette(d);
  const keys = [...fp.top, ...(d.folders.some((f) => f.cost > 0 && !fp.top.includes(f.folder)) ? ["Other"] : [])];

  const dailyCats = d.cycle.daily.map((x) => {
    const values = {};
    for (const [f, v] of Object.entries(x.by_folder)) values[fp.key(f)] = (values[fp.key(f)] || 0) + v;
    return { label: shortDate(x.date).replace(/ /g, "\u00a0"), values };
  });
  stackedColumns($("chart-daily"), dailyCats, keys, (k) => fp.colors[k], (k) => short(k, 30), `${d.unit} per day`);

  hbar($("chart-folders"), d.folders.filter((f) => f.cost > 0).slice(0, 10).map((f) => ({
    label: f.folder, value: f.cost, valueLabel: fmt(f.cost),
    title: `${f.folder}: ${fmt(f.cost)} across ${f.conversations} conversations, ${f.prompts} prompts`,
  })), "#3b82d4", `${d.unit} by working folder`);

  const cycCats = d.cycles.map((cy) => {
    const values = {};
    for (const [f, v] of Object.entries(cy.by_folder)) values[fp.key(f)] = (values[fp.key(f)] || 0) + v;
    return { label: cy.label, values };
  });
  stackedColumns($("chart-cycles"), cycCats, keys, (k) => fp.colors[k], (k) => short(k, 30), `${d.unit} per credit cycle (resets on day ${d.settings.reset_day})`);
}

function renderQuality(d) {
  const pq = d.prompt_quality;
  const total = pq.buckets.reduce((a, b) => a + b.count, 0);
  donut($("chart-quality"), pq.buckets.map((b, i) => ({ label: b.label, value: b.count, color: QUALITY_COLORS[i] })),
    pq.average == null ? "-" : pct(pq.average), total ? "avg quality" : "");
  const o = d.outcomes.totals;
  const sl = ["one_shot", "multi_turn", "cancelled"].map((k) => ({ label: OUTCOME_LABELS[k], value: o[k], color: OUTCOME_COLORS[k] }));
  const tot = sl.reduce((a, x) => a + x.value, 0);
  donut($("chart-outcomes-donut"), sl, tot ? pct(o.one_shot / tot) : "-", tot ? "one-shot" : "");
  hbar($("chart-tools"), d.tools.slice(0, 8).map((t) => ({
    label: t.tool, value: t.calls, valueLabel: `${t.calls}${t.errors ? ` (${t.errors} failed)` : ""}`,
  })), "#7c5cd8", "Tool calls");
  const keys = ["one_shot", "multi_turn", "cancelled"];
  stackedColumns($("chart-weekly"), d.outcomes.weekly.map((w) => ({ label: shortDate(w.week).replace(/ /g, "\u00a0"), values: w })), keys,
    (k) => OUTCOME_COLORS[k], (k) => OUTCOME_LABELS[k], "Conversations per week (week starting)");
  hbar($("chart-modes"), d.modes.filter((x) => x.cost > 0 || x.prompts > 0).map((x) => ({
    label: x.mode, value: x.cost, valueLabel: `${fmt(x.cost)} (${x.prompts} prompts)`,
  })), "#2a9d8f", `${d.unit} by Bob mode`);
}

function renderEfficiency(d) {
  const e = d.efficiency, root = $("efficiency");
  clear(root);
  if (e.score == null) return empty(root, "Not enough conversations yet.");
  const rows = e.components.map((c) => {
    const svg = svgRoot(300, 14, `${c.label} ${c.value}%`);
    svg.append(s("rect", { x: 0, y: 2, width: 300, height: 10, rx: 5, fill: GRID }), s("rect", { x: 0, y: 2, width: Math.max(3, 3 * c.value), height: 10, rx: 5, fill: c.value >= 75 ? "#2a9d8f" : c.value >= 50 ? "#e9a23b" : "#d1495b" }));
    return h("div", { class: "comp" }, h("div", { class: "comp-head" }, h("strong", {}, c.label), h("span", {}, `${c.value}% (weight ${Math.round(c.weight * 100)}%)`)), svg, h("div", { class: "muted" }, c.detail));
  });
  root.append(h("div", { class: "eff" }, h("div", { class: "eff-score" }, h("div", { class: "big" }, String(e.score)), h("div", { class: "muted" }, "out of 100")), h("div", { class: "eff-rows" }, rows)));
}

function renderRecs(d) {
  const root = $("recs");
  clear(root);
  const labels = { warn: "Act on this", tip: "Tip", good: "Looking good" };
  d.recommendations.forEach((r) => root.append(h("article", { class: `rec ${r.level}` },
    h("div", { class: "rec-tag" }, labels[r.level] || "Tip"), h("h3", {}, r.title),
    h("p", {}, r.evidence), h("p", { class: "rec-action" }, h("strong", {}, "Try: "), r.action))));
}

function renderTable(d) {
  const root = $("top-table");
  clear(root);
  if (!d.top_conversations.length) return empty(root, "No conversations yet.");
  const snip = d.top_conversations.some((c) => c.snippet);
  const head = ["Date", "Folder", "Mode", "Prompts", "Cost", "Context tokens", "Outcome", ...(snip ? ["Opening prompt"] : [])];
  const table = h("table", {}, h("thead", {}, h("tr", {}, head.map((x) => h("th", { scope: "col" }, x)))),
    h("tbody", {}, d.top_conversations.map((c) => h("tr", {},
      h("td", {}, shortDate(c.date)), h("td", { title: c.folder }, short(c.folder, 34)), h("td", {}, c.mode), h("td", {}, String(c.prompts)),
      h("td", {}, fmt(c.cost)), h("td", {}, c.context_tokens.toLocaleString()), h("td", {}, OUTCOME_LABELS[c.outcome] || c.outcome),
      ...(snip ? [h("td", {}, c.snippet || "")] : [])))));
  root.append(table);
}

function renderPractices(d) {
  $("practices").replaceChildren(...d.best_practices.map((p) => h("li", {}, h("strong", {}, p.title), h("span", { class: "muted" }, " - " + p.detail))));
}

function render(d) {
  $("subtitle").textContent = `Reading ${d.totals.conversations} conversations across ${d.totals.folders} folders` +
    (d.data_range.first ? ` (${shortDate(d.data_range.first)} to ${shortDate(d.data_range.last)})` : "") + ". Everything stays on this computer.";
  renderKpis(d); renderCycle(d); renderFolders(d); renderQuality(d); renderEfficiency(d); renderRecs(d); renderReview(d); renderHabits(d); renderTable(d); renderPractices(d);
  $("footnote").textContent = `Costs come from Bob's local database and are shown in ${d.unit}. If they differ from Bobalytics or the budget gauge, adjust the cost multiplier in settings. Prompt-quality and efficiency scores are heuristics, not measurements of outcomes. Each prompt check is tagged with its source: Bob docs, the IBM prompt engineering article, or my own heuristic. Numeric cut-offs and the efficiency weights are adjustable defaults, not documented values. Several follow-up turns can be deliberate (prompt chaining), so multi-turn is a cost signal, not a failure.`;
  $("content").hidden = false;
}

/* ------------------------------------------------------------------ data + settings */
async function load() {
  $("error").hidden = true;
  try {
    const res = await fetch("/api/data", { credentials: "same-origin" });
    if (res.status === 401) return location.reload();
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || "Request failed");
    render(body);
  } catch (err) {
    $("content").hidden = true;
    $("error").textContent = err.message === "Failed to fetch" ? "Could not reach the local server." : err.message;
    $("error").hidden = false;
    $("subtitle").textContent = "";
  }
}

async function loadSettings() {
  const res = await fetch("/api/settings", { credentials: "same-origin" });
  if (!res.ok) return;
  const c = await res.json();
  $("s-reset").value = c.reset_day;
  $("s-budget").value = c.monthly_budget == null ? "" : c.monthly_budget;
  $("s-mult").value = c.cost_multiplier;
  $("s-snip").checked = !!c.show_prompt_snippets;
  $("s-prompts").checked = !!c.show_prompts;
}

$("settings-toggle").addEventListener("click", () => { $("settings").hidden = !$("settings").hidden; });
$("settings-form").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const b = $("s-budget").value.trim();
  const payload = {
    reset_day: parseInt($("s-reset").value, 10),
    monthly_budget: b === "" ? null : Number(b),
    cost_multiplier: Number($("s-mult").value),
    show_prompt_snippets: $("s-snip").checked,
    show_prompts: $("s-prompts").checked,
  };
  const msg = $("settings-msg");
  const res = await fetch("/api/settings", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  msg.textContent = res.ok ? "Saved." : "Those values are not valid.";
  if (res.ok) load();
});

setupOptimizer();
loadSettings();
load();
