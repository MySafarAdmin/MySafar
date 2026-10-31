// Glass surfaces: a refracting glass edge for a few floating parts of the site, after React Bits' GlassSurface,
// rebuilt without React. Any element with data-glass gets an SVG displacement filter as its backdrop-filter, so
// whatever sits behind it bends at the edges and splits slightly into colour, like a pane of real glass.
//
// Only Chromium (Chrome, Edge, Samsung Internet) can use an SVG filter as a backdrop-filter. Safari and Firefox
// keep the element's ordinary frosted look from the CSS, so nothing breaks there; html gets "glass-flat".
// The map is drawn as a small SVG data: image (img-src must allow data:).
//
// Options, as data attributes on the element (all optional):
//   data-glass-scale   how strongly the edge bends what is behind it (default -180; negative pulls inward)
//   data-glass-edge    width of the bending edge, as a fraction of the shorter side (default .07)
//   data-glass-soft    softness of the edge's inner fade, px (default 11)
//   data-glass-frost   blur of the light coming through, px (default 0)
//   data-glass-split   red, green and blue offsets for the colour fringe (default "0 10 20")
(function () {
  var NS = "http://www.w3.org/2000/svg", count = 0, holder = null;

  function supported() {
    var ua = navigator.userAgent;
    if ((/Safari/.test(ua) && !/Chrome|Chromium|Edg/.test(ua)) || /Firefox/.test(ua)) return false;
    try { return CSS.supports("backdrop-filter", "url(#g)"); } catch (e) { return false; }
  }

  function num(el, name, fallback) {
    var v = parseFloat(el.getAttribute("data-glass-" + name));
    return isFinite(v) ? v : fallback;
  }

  function node(tag, attrs, parent) {
    var n = document.createElementNS(NS, tag);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }

  // The displacement map: red runs left to right and blue top to bottom, so pixels near each edge are pushed
  // towards the middle; a soft grey panel inside keeps the centre still.
  function map(w, h, r, edge, soft) {
    var e = Math.min(w, h) * edge * 0.5;
    var svg = '<svg xmlns="' + NS + '" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + " " + h + '">' +
      '<defs><linearGradient id="r" x1="100%" y1="0%" x2="0%" y2="0%"><stop offset="0%" stop-color="#0000"/><stop offset="100%" stop-color="red"/></linearGradient>' +
      '<linearGradient id="b" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="#0000"/><stop offset="100%" stop-color="blue"/></linearGradient>' +
      '<filter id="s" filterUnits="userSpaceOnUse" x="0" y="0" width="' + w + '" height="' + h + '" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="' + soft + '"/></filter></defs>' +
      '<rect width="' + w + '" height="' + h + '" fill="black"/>' +
      '<rect width="' + w + '" height="' + h + '" rx="' + r + '" fill="url(#r)"/>' +
      '<rect width="' + w + '" height="' + h + '" rx="' + r + '" fill="url(#b)" style="mix-blend-mode:difference"/>' +
      '<rect x="' + e + '" y="' + e + '" width="' + Math.max(0, w - e * 2) + '" height="' + Math.max(0, h - e * 2) + '" rx="' + r + '" fill="hsl(0 0% 50% / .93)" filter="url(#s)"/></svg>';
    return "data:image/svg+xml," + encodeURIComponent(svg);
  }

  function glass(el) {
    if (el.glassDone) return;
    el.glassDone = true;
    if (!holder) {
      holder = node("svg", {width: "0", height: "0", "aria-hidden": "true", focusable: "false"});
      holder.style.position = "absolute";
      holder.style.width = holder.style.height = "0";
      holder.style.overflow = "hidden";
      document.body.appendChild(holder);
    }
    var id = "glass-" + (++count);
    var split = (el.getAttribute("data-glass-split") || "0 10 20").split(/\s+/).map(Number);
    var scale = num(el, "scale", -180);
    var filter = node("filter", {id: id, "color-interpolation-filters": "sRGB", x: "0%", y: "0%", width: "100%", height: "100%"}, holder);
    var image = node("feImage", {x: "0", y: "0", width: "100%", height: "100%", preserveAspectRatio: "none", result: "map"}, filter);
    var keep = ["1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0", "0 0 0 0 0 0 1 0 0 0 0 0 0 0 0 0 0 0 1 0", "0 0 0 0 0 0 0 0 0 0 0 0 1 0 0 0 0 0 1 0"];
    ["red", "green", "blue"].forEach(function (c, i) {
      node("feDisplacementMap", {"in": "SourceGraphic", in2: "map", scale: String(scale + (split[i] || 0)), xChannelSelector: "R", yChannelSelector: "G", result: "d" + c}, filter);
      node("feColorMatrix", {"in": "d" + c, type: "matrix", values: keep[i], result: c}, filter);
    });
    node("feBlend", {"in": "red", in2: "green", mode: "screen", result: "rg"}, filter);
    node("feBlend", {"in": "rg", in2: "blue", mode: "screen", result: "out"}, filter);
    node("feGaussianBlur", {"in": "out", stdDeviation: String(num(el, "frost", 0.7))}, filter);

    var last = "";
    function draw() {
      var w = Math.round(el.offsetWidth), h = Math.round(el.offsetHeight);
      if (!w || !h) return;
      var r = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0, key = w + "x" + h + "x" + r;
      if (key === last) return;
      last = key;
      image.setAttribute("href", map(w, h, r, num(el, "edge", 0.07), num(el, "soft", 11)));
    }
    draw();
    if (window.ResizeObserver) new ResizeObserver(draw).observe(el);
    el.style.setProperty("--glass-filter", "url(#" + id + ")");
    el.classList.add("glass-on");
  }

  function scan(root) {
    if (root.matches && root.matches("[data-glass]")) glass(root);
    if (root.querySelectorAll) Array.prototype.forEach.call(root.querySelectorAll("[data-glass]"), glass);
  }

  function start() {
    if (!supported()) { document.documentElement.classList.add("glass-flat"); return; }
    document.documentElement.classList.add("glass-live");
    scan(document);
    // The dashboard draws its pop-ups as it goes, so look again whenever something new is added.
    new MutationObserver(function (list) {
      list.forEach(function (m) { Array.prototype.forEach.call(m.addedNodes, function (n) { if (n.nodeType === 1) scan(n); }); });
    }).observe(document.body, {childList: true, subtree: true});
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
