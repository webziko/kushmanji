/** Build an element: h("button", { class: "primary", onclick: go }, "Create"). Text children are never HTML. */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === false || value == null) continue;
    if (key.startsWith("on")) el.addEventListener(key.slice(2), value);
    else if (key === "class") el.className = value;
    else el.setAttribute(key, value === true ? "" : String(value));
  }
  el.append(...children.flat().filter((child) => child != null && child !== false));
  return el;
}
