// Tonight panel: pass list and share card. DOM only; logic is in tonight-model.js.
import { h, empty } from "./dom.js";
import { tonightModel } from "./tonight-model.js";

export async function copyText(text, nav = globalThis.navigator, doc = globalThis.document) {
  try {
    if (nav?.clipboard?.writeText) { await nav.clipboard.writeText(text); return true; }
  } catch (err) {
    console.warn("clipboard API failed, using fallback", err);
  }
  try {
    const ta = h("textarea", { readonly: true, style: "position:fixed;opacity:0;top:0" });
    ta.value = text;
    doc.body.append(ta);
    ta.select();
    const ok = doc.execCommand("copy");
    ta.remove();
    return !!ok;
  } catch (err) {
    console.warn("copy fallback failed", err);
    return false;
  }
}

export function renderTonightPanel(el, passes, { onHighlight, state }) {
  empty(el);
  el.append(h("h2", {}, "Tonight"));
  const m = tonightModel(passes, { showAll: state.showAll });
  if (!m) {
    el.append(h("p", { class: "empty" }, "Pass predictions are not available yet. Check back after the next data refresh."));
    return;
  }
  const rerender = () => renderTonightPanel(el, passes, { onHighlight, state });
  const status = h("span", { class: "copy-status", role: "status" });
  const copy = h("button", { type: "button", class: "btn", onclick: async () => {
    status.textContent = (await copyText(m.share)) ? "Copied" : "Copy failed, select the text and copy it";
  } }, "Copy");
  const toggle = h("label", { class: "toggle" },
    h("input", { type: "checkbox", checked: !state.showAll, onchange: (e) => { state.showAll = !e.target.checked; rerender(); } }),
    " Visible only");
  const rows = m.rows.map((r) =>
    h("li", {}, h("button", { type: "button", class: `pass ${r.constellation}${r.past ? " past" : ""}`, onclick: () => onHighlight(r.noradId) },
      h("span", { class: "pass-time" }, r.time),
      h("span", { class: `chip ${r.constellation}` }, r.chip),
      h("span", { class: "pass-name" }, r.name),
      h("span", { class: "pass-dir" }, r.direction),
      h("span", { class: "pass-el" }, `peak ${r.peakEl}`),
      !r.visible ? h("span", { class: "muted" }, "not visible") : null)));
  el.append(
    h("div", { class: "tonight-head" }, toggle, h("span", { class: "muted" }, m.window)),
    m.empty ? h("p", { class: "empty" }, m.empty) : h("ul", { class: "passes" }, rows),
    m.stale ? h("p", { class: "stale" }, m.stale) : null,
    h("p", { class: "muted" }, m.note),
    h("div", { class: "share" }, h("p", { class: "share-text" }, m.share), copy, status));
}
