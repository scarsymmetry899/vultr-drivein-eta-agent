const ns = "http://www.w3.org/2000/svg";

function svg(draw) {
  const node = document.createElementNS(ns, "svg");
  node.setAttribute("viewBox", "0 0 80 80");
  node.setAttribute("aria-hidden", "true");
  draw(node);
  return node;
}

function shape(parent, tag, attrs) {
  const node = document.createElementNS(ns, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  parent.append(node);
  return node;
}

function plate(root, tone) {
  shape(root, "rect", { x: "4", y: "4", width: "72", height: "72", rx: "22", fill: tone });
}

export function foodMark(sku) {
  return svg((root) => {
    if (sku.includes("burger")) return burger(root, sku);
    if (sku === "chili-dog") return dog(root);
    if (sku === "fries") return fries(root);
    if (sku === "onion-rings") return rings(root);
    if (sku.includes("shake") || sku === "root-beer-float") return shake(root, sku);
    return cola(root);
  });
}

function burger(root, sku) {
  plate(root, "#f6e7cf");
  shape(root, "ellipse", { cx: "40", cy: "50", rx: "22", ry: "8", fill: "#e2b15a" });
  shape(root, "rect", { x: "18", y: "40", width: "44", height: "8", rx: "3", fill: "#6b3a2a" });
  if (sku !== "veggie-burger") {
    shape(root, "rect", { x: "20", y: "36", width: "40", height: "5", rx: "2", fill: sku === "classic-burger" ? "#c45a3a" : "#f0c14a" });
  } else {
    shape(root, "rect", { x: "20", y: "36", width: "40", height: "5", rx: "2", fill: "#7d9a62" });
  }
  shape(root, "path", { d: "M18 36c0-10 10-16 22-16s22 6 22 16", fill: "#f3d28a" });
  if (sku === "bacon-cheeseburger") {
    shape(root, "rect", { x: "24", y: "44", width: "32", height: "3", rx: "1", fill: "#a34732" });
  }
}

function dog(root) {
  plate(root, "#f8ead8");
  shape(root, "path", { d: "M14 44c0-8 8-12 26-12s26 4 26 12v4c0 8-8 12-26 12S14 56 14 48z", fill: "#e2b15a" });
  shape(root, "rect", { x: "22", y: "38", width: "36", height: "8", rx: "4", fill: "#c45c3a" });
  shape(root, "path", { d: "M24 36c6 4 26 4 32 0", fill: "none", stroke: "#8d3b28", "stroke-width": "2" });
}

function fries(root) {
  plate(root, "#f7ecd4");
  shape(root, "path", { d: "M22 46h36l-4 18H26z", fill: "#c0392b" });
  for (const x of [28, 36, 44]) {
    shape(root, "rect", { x: String(x), y: "18", width: "6", height: "30", rx: "2", fill: "#e6b15a", transform: `rotate(${x - 36} 40 32)` });
  }
}

function rings(root) {
  plate(root, "#f6e7cf");
  shape(root, "circle", { cx: "32", cy: "36", r: "12", fill: "none", stroke: "#c9842a", "stroke-width": "6" });
  shape(root, "circle", { cx: "48", cy: "46", r: "12", fill: "none", stroke: "#e2b15a", "stroke-width": "6" });
}

function shake(root, sku) {
  const fill = sku.includes("chocolate") ? "#5c3a2e" : sku.includes("strawberry") ? "#d46a7e" : sku === "root-beer-float" ? "#6b3a2a" : "#f3e6cf";
  plate(root, "#f3efe8");
  shape(root, "path", { d: "M28 28h24l-3 34H31z", fill });
  shape(root, "rect", { x: "26", y: "24", width: "28", height: "6", rx: "2", fill: "#f7f1e8" });
  shape(root, "path", { d: "M30 22c2-8 18-8 20 0", fill: "none", stroke: "#e7e1d8", "stroke-width": "3" });
  if (sku === "root-beer-float") {
    shape(root, "circle", { cx: "40", cy: "26", r: "6", fill: "#f3e6cf" });
  }
}

function cola(root) {
  plate(root, "#f6ece3");
  shape(root, "path", { d: "M30 22h20l-2 40H32z", fill: "#7a2e2e" });
  shape(root, "rect", { x: "34", y: "30", width: "12", height: "16", rx: "2", fill: "#f4d2d2", opacity: "0.8" });
}
