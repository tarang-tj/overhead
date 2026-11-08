// Look Up controls: phone orientation (with iOS permission gesture) or drag/arrow keys on desktop.
import { h, empty } from "./dom.js";
import { isTap, pointingFromOrientation, alphaFromCompassHeading, uncertaintyFrom, readoutText, ACCURACY_NOTE, clampLook, throttle } from "./look-model.js";

/** surface: full-screen element that takes drag input. panel: small controls box. */
export function mountLookControls({ surface, panel, onLook, onSkyTap }) {
  let look = { az: 0, el: 35 }, unc = null, sensorOn = false, active = false;
  const readout = h("p", { class: "readout", role: "status", "aria-live": "off" });
  const note = h("p", { class: "muted" });
  const emit = throttle(() => onLook(look.az, look.el, unc), 30);
  const apply = (az, el, u = unc) => { look = clampLook(az, el); unc = u; readout.textContent = readoutText(look.az, look.el, unc); emit(); };

  // Drag to look (mouse, touch, pen). Dragging right turns the view left, like grabbing the sky.
  let drag = null;
  let tapStart = null;
  const down = (e) => {
    if (!active) return;
    tapStart = { x: e.clientX, y: e.clientY, t: Date.now() };
    if (sensorOn) return;
    drag = { x: e.clientX, y: e.clientY }; surface.setPointerCapture?.(e.pointerId);
  };
  const move = (e) => {
    if (!drag) return;
    const k = 0.25;
    apply(look.az - (e.clientX - drag.x) * k, look.el + (e.clientY - drag.y) * k, null);
    drag = { x: e.clientX, y: e.clientY };
  };
  const up = (e) => {
    drag = null;
    const start = tapStart; tapStart = null;
    if (e?.type === "pointerup" && onSkyTap && isTap(start, { x: e.clientX, y: e.clientY, t: Date.now() })) onSkyTap(e.clientX, e.clientY);
  };
  const key = (e) => {
    if (!active || sensorOn || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || "")) return;
    const step = e.shiftKey ? 15 : 5;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[e.key];
    if (!d) return;
    e.preventDefault();
    apply(look.az + d[0], look.el + d[1], null);
  };
  surface.addEventListener("pointerdown", down);
  surface.addEventListener("pointermove", move);
  surface.addEventListener("pointerup", up);
  surface.addEventListener("pointercancel", up);
  window.addEventListener("keydown", key);

  // Phone sensors.
  const onOrient = (e) => {
    if (e.beta === null || e.beta === undefined || e.gamma === null || e.gamma === undefined) return;
    let alpha;
    if (Number.isFinite(e.webkitCompassHeading)) alpha = alphaFromCompassHeading(e.webkitCompassHeading);
    else if (e.absolute === true && Number.isFinite(e.alpha)) alpha = e.alpha;
    else return; // relative alpha has no north reference; ignore rather than point wrongly
    const p = pointingFromOrientation(alpha, e.beta, e.gamma);
    apply(p.az, p.el, uncertaintyFrom(e.webkitCompassAccuracy));
  };
  const startSensors = async () => {
    try {
      if (typeof DeviceOrientationEvent !== "undefined" && typeof DeviceOrientationEvent.requestPermission === "function") {
        const res = await DeviceOrientationEvent.requestPermission(); // iOS: must be inside a user gesture
        if (res !== "granted") throw new Error("permission " + res);
        window.addEventListener("deviceorientation", onOrient);
      } else {
        window.addEventListener("deviceorientationabsolute", onOrient);
        window.addEventListener("deviceorientation", onOrient);
      }
      sensorOn = true;
      note.textContent = ACCURACY_NOTE;
      btn.textContent = "Use drag instead";
    } catch (err) {
      console.warn("orientation sensors unavailable", err);
      note.textContent = "Could not read the phone compass. Drag the sky or use arrow keys instead.";
    }
  };
  const stopSensors = () => {
    window.removeEventListener("deviceorientation", onOrient);
    window.removeEventListener("deviceorientationabsolute", onOrient);
    sensorOn = false;
    btn.textContent = "Use phone compass";
    note.textContent = "Drag to look around, or use the arrow keys (Shift for bigger steps).";
  };
  const hasSensor = typeof window !== "undefined" && "DeviceOrientationEvent" in window;
  const btn = h("button", { type: "button", class: "btn", onclick: () => (sensorOn ? stopSensors() : startSensors()) }, "Use phone compass");

  empty(panel).append(...[h("h2", {}, "Look Up"), readout, hasSensor ? btn : null, note].filter(Boolean));
  note.textContent = "Drag to look around, or use the arrow keys (Shift for bigger steps).";
  readout.textContent = readoutText(look.az, look.el, null);

  return {
    /** Point the view at an az/el (used by "Show in sky"); reports through onLook like a drag. */
    lookAt(az, el) { apply(az, el, null); },
    setActive(on) { active = on; surface.classList.toggle("on", on); if (on) emit(); },
    dispose() {
      stopSensors();
      surface.removeEventListener("pointerdown", down);
      surface.removeEventListener("pointermove", move);
      surface.removeEventListener("pointerup", up);
      surface.removeEventListener("pointercancel", up);
      window.removeEventListener("keydown", key);
    },
  };
}
