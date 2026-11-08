// Tiny DOM helper. Text always goes through textContent, never innerHTML.
const SVG_NS = "http://www.w3.org/2000/svg";

export function h(tag, attrs = {}, ...kids) {
  const el = tag.startsWith("svg:") ? document.createElementNS(SVG_NS, tag.slice(4)) : document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") el.setAttribute("class", v);
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? "" : String(v));
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid === null || kid === undefined || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

export const link = (url, text) => h("a", { href: url, target: "_blank", rel: "noopener noreferrer" }, text);
export const empty = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };
