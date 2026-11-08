// Time bar: scrub +/-24 h, play at 1x/60x/600x, Now. DOM only; logic is in time-model.js.
import { h } from "./dom.js";
import { SLIDER_MIN, SLIDER_MAX, SPEEDS, offsetToDate, dateToOffset, timeLabel, accuracyWarning } from "./time-model.js";

export function mountTimeBar({ gpMeta, onTime, onSpeed }) {
  let speed = 1, dragging = false, sent = null; // sent: last scrubbed date, so a paused sim does not drag the slider
  const label = h("span", { class: "tlabel", role: "status" }, "Live");
  const warn = h("p", { class: "twarn", role: "status", hidden: true });
  const slider = h("input", { type: "range", class: "tslider", min: SLIDER_MIN, max: SLIDER_MAX, step: 1, value: 0, "aria-label": "Time offset in minutes" });
  const now = h("button", { type: "button", class: "btn small", onclick: () => { speed = 1; slider.value = 0; sent = null; paintSpeed(); onSpeed?.(1); onTime(null); show(new Date()); } }, "Now");
  const speedBtns = SPEEDS.map((x) => h("button", { type: "button", class: "btn small", "aria-pressed": "false", onclick: () => { speed = x; paintSpeed(); onSpeed?.(x); } }, `${x}x`));
  const paintSpeed = () => speedBtns.forEach((b, i) => b.setAttribute("aria-pressed", String(SPEEDS[i] === speed)));
  paintSpeed();

  function show(date) {
    label.textContent = timeLabel(date);
    const w = accuracyWarning(date, gpMeta);
    warn.hidden = !w; warn.textContent = w || "";
  }
  slider.addEventListener("input", () => {
    dragging = true;
    const m = Number(slider.value);
    if (m === 0) { sent = null; if (speed !== 1) { speed = 1; paintSpeed(); onSpeed?.(1); } onTime(null); show(new Date()); } else { const d = offsetToDate(m); sent = d; onTime(d); show(d); }
  });
  const stop = () => { dragging = false; };
  slider.addEventListener("change", stop);
  slider.addEventListener("pointerup", stop);
  show(new Date());

  return {
    el: h("div", { class: "timebar", role: "group", "aria-label": "Time" }, warn,
      h("div", { class: "trow" }, label, now), h("div", { class: "trow" }, slider, speedBtns)),
    /** Called about once a second with the renderer's sim time. */
    setSimTime(date) {
      if (!date) return;
      show(date);
      if (!dragging && !(sent && Math.abs(date - sent) < 2000)) slider.value = String(Math.max(SLIDER_MIN, Math.min(SLIDER_MAX, dateToOffset(date))));
    },
  };
}
