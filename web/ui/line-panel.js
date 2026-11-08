// The Line panel: Amazon Leo vs Starlink as supply chains. DOM only; data logic is in line-model.js.
import { h, link, empty } from "./dom.js";
import { lineModel } from "./line-model.js";

function barChart(series, cls, title) {
  const W = 240, H = 44, n = series.length, bw = W / n;
  const max = Math.max(1, ...series.map((s) => s.count));
  const bars = series.map((s, i) => {
    const bh = s.count ? Math.max(1.5, (s.count / max) * (H - 4)) : 0;
    return h("svg:rect", { x: (i * bw + 0.5).toFixed(1), y: (H - bh).toFixed(1), width: (bw - 1).toFixed(1), height: bh.toFixed(1), rx: 1 },
      h("svg:title", {}, `${s.month}: ${s.count}`));
  });
  const first = series[0]?.month, last = series[n - 1]?.month;
  return h("figure", { class: "chart" },
    h("svg:svg", { class: cls, viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": `${title}, ${first} to ${last}` }, bars),
    h("figcaption", {}, `${title}, ${first} to ${last}`));
}

function column(c) {
  const stageRows = c.funnel.map((r) =>
    h("li", { class: `funnel-row stage-${r.key}` },
      h("span", { class: "funnel-label" }, r.label),
      h("span", { class: "funnel-bar", "aria-hidden": "true" }, h("span", { style: `width:${r.pct}%` })),
      h("span", { class: "funnel-count" }, r.count.toLocaleString("en-US"))));
  return h("section", { class: `line-col ${c.key}`, "aria-label": c.label },
    h("h3", {}, c.label),
    h("p", { class: "factory" }, h("strong", {}, "Factory: "), c.factory.city,
      c.factory.note ? ` (${c.factory.note})` : "", " ",
      c.factory.sources.map((u, i) => [link(u, `source ${i + 1}`), " "])),
    h("ul", { class: "funnel" }, stageRows),
    c.unknown ? h("p", { class: "muted" }, `${c.unknown.toLocaleString("en-US")} not yet classified`) : null,
    h("p", { class: "implied" }, c.implied),
    h("p", {}, c.shells),
    h("p", { class: "muted" }, c.lastLaunch),
    h("h4", {}, "Launch sites"),
    c.sites.length
      ? h("ul", { class: "sites" }, c.sites.map((s) => h("li", {}, `${s.name}: ${s.count.toLocaleString("en-US")}`)))
      : h("p", { class: "muted" }, "No launch site data"),
    barChart(c.launches, "chart-launch", "Launches by month"),
    barChart(c.decays, "chart-decay", "Decays by month"),
    c.fcc ? h("p", { class: "fcc muted" }, c.fcc) : null);
}

const SWATCH = { leo: "#f5a524", starlink: "#9ec5ff", raising: "#7fd6a0", descending: "#ff8a80" };
const LEGENDS = {
  constellation: [["leo", "Amazon Leo"], ["starlink", "Starlink"]],
  stage: [["raising", "Raising"], ["descending", "Descending"], ["leo", "On station (dimmed)"]],
};

/** "Color satellites by" toggle plus legend. Returns { el, setMode(mode) } (mode is applied without notifying). */
export function colorToggle(onColorMode) {
  const legend = h("ul", { class: "legend", "aria-label": "Satellite colors" });
  const buttons = {};
  const setMode = (mode) => {
    for (const [k, b] of Object.entries(buttons)) b.setAttribute("aria-pressed", String(k === mode));
    empty(legend).append(...LEGENDS[mode].map(([key, text]) =>
      h("li", {}, h("span", { class: "swatch", style: `background:${SWATCH[key]}`, "aria-hidden": "true" }), text)));
  };
  const btn = (mode, label) => (buttons[mode] = h("button", { type: "button", class: "btn ghost", "aria-pressed": "false",
    onclick: () => { setMode(mode); onColorMode(mode); } }, label));
  const el = h("div", { class: "color-toggle" }, h("span", { class: "muted" }, "Color satellites by: "),
    btn("constellation", "Constellation"), btn("stage", "Stage"), legend);
  setMode("constellation");
  return { el, setMode };
}

export function renderLinePanel(el, line, { onColorMode = () => {} } = {}) {
  empty(el);
  const toggle = colorToggle(onColorMode);
  const m = lineModel(line);
  el.append(h("h2", {}, "The Line"), toggle.el);
  if (!m) {
    el.append(h("p", { class: "empty" }, "Supply chain data is not available yet. Check back after the next data refresh."));
    return { setColorMode: toggle.setMode };
  }
  el.append(
    h("p", { class: "muted lede" }, "Each constellation as a supply chain: factory, launch site, raising, on station, retired."),
    h("div", { class: "line-cols" }, m.columns.map(column)),
    h("footer", { class: "sources" }, h("span", {}, m.generatedText + ". Sources: "),
      m.sources.map((s) => [link(s.url, s.name), " "])));
  return { setColorMode: toggle.setMode };
}
