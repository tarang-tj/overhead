// Search box, location button and category legend (filter). DOM only; logic is in explore-model.js.
import { h, empty } from "./dom.js";
import { searchSats, notableChips, legendModel, toggleFilter, locationErrorText, observerFromPosition, COUNTS_CAPTION } from "./explore-model.js";

export function mountSearch({ satIndex, onSelect }) {
  const input = h("input", { type: "search", class: "search", placeholder: "Name or NORAD number", autocomplete: "off",
    spellcheck: "false", role: "combobox", "aria-label": "Search satellites", "aria-expanded": "false", "aria-controls": "search-list" });
  const list = h("div", { class: "suggest", id: "search-list", role: "listbox", hidden: true });
  const chips = notableChips(satIndex);
  const pick = (id) => { input.value = ""; close(); input.blur(); onSelect(id); };
  const close = () => { list.hidden = true; input.setAttribute("aria-expanded", "false"); };
  const row = (s) => h("button", { type: "button", class: "suggest-row", role: "option", onmousedown: (e) => e.preventDefault(), onclick: () => pick(s.noradId) },
    h("span", { class: "suggest-name" }, s.name), h("span", { class: "muted" }, String(s.noradId)));
  const render = () => {
    const q = input.value.trim();
    const hits = searchSats(satIndex, q);
    empty(list);
    if (!q) list.append(h("div", { class: "chips" }, chips.map((c) => h("button", { type: "button", class: "chip-btn", onmousedown: (e) => e.preventDefault(), onclick: () => pick(c.noradId) }, c.label))));
    else if (hits.length) list.append(...hits.map(row));
    else list.append(h("p", { class: "muted pad" }, "No satellite matches that."));
    list.hidden = !q && !chips.length;
    input.setAttribute("aria-expanded", String(!list.hidden));
  };
  input.addEventListener("input", render);
  input.addEventListener("focus", render);
  input.addEventListener("blur", close);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { input.value = ""; close(); input.blur(); }
    if (e.key === "Enter") { const first = searchSats(satIndex, input.value)[0]; if (first) pick(first.noradId); }
  });
  return h("div", { class: "search-wrap" }, input, list);
}

/** Location control. geo is injectable for tests; gesture rule: getCurrentPosition runs inside the click. */
export function mountLocation({ onLocation, onState, geo = globalThis.navigator?.geolocation }) {
  const msg = h("p", { class: "loc-msg stale", role: "status", hidden: true });
  const use = h("button", { type: "button", class: "btn small", onclick: () => ask() }, "Use my location");
  const back = h("button", { type: "button", class: "btn small ghost", hidden: true, onclick: () => { msg.hidden = true; swap(false); onLocation(null); } }, "Back to UW Bothell");
  const swap = (isYou) => { use.hidden = isYou; back.hidden = !isYou; onState?.(isYou); };
  const fail = (why) => {
    console.warn("geolocation unavailable", why);
    use.disabled = false; use.textContent = "Use my location";
    msg.textContent = locationErrorText(); msg.hidden = false;
    swap(false); onLocation(null);
  };
  function ask() {
    if (!geo) { fail("unsupported"); return; }
    use.disabled = true; use.textContent = "Finding you"; msg.hidden = true;
    geo.getCurrentPosition((pos) => {
      const obs = observerFromPosition(pos);
      if (!obs) { fail("bad coordinates"); return; }
      use.disabled = false; use.textContent = "Use my location";
      swap(true); onLocation(obs);
    }, (err) => fail(err?.message || err?.code), { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 });
  }
  return { el: h("div", { class: "loc" }, use, back), msg };
}

export function mountLegend({ categories, onFilter }) {
  const el = h("div", { class: "legend-filter", role: "group", "aria-label": "Filter by satellite type, counts are above the horizon", title: COUNTS_CAPTION });
  const keys = categories.map((c) => c.key);
  let active = null, counts = {}, last = "";
  // Chips are built once; updates touch only count text and aria-pressed so taps, scroll and focus survive.
  const all = h("button", { type: "button", class: "lchip", onclick: () => { active = null; paint(); onFilter(null); } }, "All");
  const chips = categories.map((c) => {
    const n = h("span", { class: "n" }, "0");
    const b = h("button", { type: "button", class: "lchip", style: `--c:${c.color}`, onclick: () => { active = toggleFilter(active, c.key, keys); paint(); onFilter(active); } },
      h("span", { class: "swatch" }), `${c.label} `, n);
    return { key: c.key, b, n };
  });
  el.append(all, ...chips.map((c) => c.b), h("span", { class: "legend-cap muted" }, "above the horizon"));
  function paint() {
    const m = legendModel(categories, counts, active);
    const sig = JSON.stringify([m.allPressed, m.chips.map((c) => [c.pressed, c.count])]);
    if (sig === last) return;
    last = sig;
    all.setAttribute("aria-pressed", String(m.allPressed));
    m.chips.forEach((c, i) => {
      chips[i].b.setAttribute("aria-pressed", String(c.pressed));
      const t = c.count.toLocaleString("en-US");
      if (chips[i].n.textContent !== t) chips[i].n.textContent = t;
    });
  }
  paint();
  return { el, setCounts(c) { counts = c || {}; paint(); } };
}
