// Satellite card (sheet) and the identify list. DOM only; logic is in card-model.js.
import { h, empty } from "./dom.js";
import { cardModel, identifyModel } from "./card-model.js";

export function mountCard({ satIndex, categories, getSatInfo, getSatState, onShowInSky }) {
  const byId = new Map((satIndex || []).map((s) => [s.noradId, s]));
  const el = h("section", { class: "card", id: "sat-card", role: "dialog", "aria-label": "Satellite details", hidden: true });
  let token = 0, timer = null;
  const stopTimer = () => { if (timer) clearInterval(timer); timer = null; };
  const close = () => { token++; stopTimer(); el.hidden = true; empty(el); };
  const head = (m) => h("div", { class: "card-head" },
    h("div", {}, h("h2", {}, m.name), h("span", { class: "chip", style: m.color ? `color:${m.color}` : null }, m.chip),
      m.intlDes ? h("span", { class: "muted" }, ` ${m.intlDes}`) : null),
    h("button", { type: "button", class: "btn ghost small", "aria-label": "Close satellite card", onclick: close }, "Close"));
  const draw = (entry, info, failed) => {
    const m = cardModel(entry, info, categories);
    const ok = !failed && !!info;
    empty(el).append(...[head(m),
      ok ? null : h("p", { class: "stale" }, "Could not load details for this satellite."),
      h("dl", { class: "facts" }, (ok ? m.rows : []).map(([k, v]) => [h("dt", {}, k), h("dd", {}, v)])),
      ok && m.sky ? h("button", { type: "button", class: "btn", onclick: () => onShowInSky(m.sky.az, m.sky.el) }, "Show in sky") : null].filter(Boolean));
  };

  async function show(noradId) {
    if (!getSatInfo) return;
    const my = ++token;
    stopTimer();
    const entry = byId.get(noradId) || { noradId, name: `NORAD ${noradId}`, category: "other" };
    el.hidden = false;
    empty(el).append(head(cardModel(entry, null, categories)), h("p", { class: "muted", role: "status" }, "Loading details"));
    let info = null, failed = false;
    try { info = await getSatInfo(noradId); } catch (err) { console.warn("getSatInfo failed", err); failed = true; }
    if (my !== token) return; // a newer card or a close won
    draw(entry, info, failed);
    if (getSatState && info && !failed) {
      // Keep the live numbers moving; the next pass is not refetched.
      timer = setInterval(async () => {
        try {
          const st = await getSatState(noradId);
          if (my !== token || !st) return;
          info = { ...info, state: st };
          draw(entry, info, false);
        } catch (err) { console.warn("getSatState failed", err); }
      }, 2000);
    }
  }
  return { el, show, close, isOpen: () => !el.hidden };
}

export function mountIdentify({ onIdentify, nameOf, categoryOf, categories, onPick }) {
  const out = h("div", { class: "identify-out", role: "status" });
  const btn = h("button", { type: "button", class: "btn", onclick: async () => {
    btn.disabled = true;
    try {
      const m = identifyModel(await onIdentify(), nameOf, categoryOf, categories);
      empty(out);
      if (m.empty) out.append(h("p", { class: "muted" }, m.empty));
      else out.append(h("ul", { class: "ident" }, m.rows.map((r) => h("li", {}, h("button", { type: "button", class: "pass", onclick: () => onPick(r.noradId) },
        h("span", { class: "pass-name" }, r.name), h("span", { class: "chip", style: r.color ? `color:${r.color}` : null }, r.chip),
        h("span", { class: "pass-dir" }, `${r.sep}, ${r.light}`))))));
    } catch (err) {
      console.warn("identify failed", err);
      empty(out).append(h("p", { class: "stale" }, "Could not check the sky right now."));
    } finally { btn.disabled = false; }
  } }, "What's that light?");
  return h("div", { class: "identify" }, btn, out);
}
