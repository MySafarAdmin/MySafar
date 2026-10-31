// The sign-in page's opening film. Everything is drawn here on a canvas, frame by frame, so there is no video to
// download: the camera falls from space towards a night-side planet, down through moonlit clouds, to an old stone
// well in the desert, and tilts to look into it. The moon lies reflected in the still water; a drop falls, the
// ripples break the reflection into glints of light, and the glints gather into the white of the logo, while the
// water itself turns the logo's navy. The logo (a real element from then on) moves aside for "MySafar", then, on a
// computer, the stage folds into the navy welcome panel as the logo lands on the panel's own; on a phone it lifts
// away. Skip, Escape, or a tap anywhere goes straight to the form.
//
// Sound is drawn too (Web Audio): off by default, as browsers expect, until the speaker button is pressed; the
// choice is remembered on this device. The form's fields stay disabled while the film plays (a fieldset in
// login.html), so browsers, Safari included, can't offer saved passwords over it; when it ends they're enabled and
// the email field takes focus, which is when the saved-password suggestions appear. Under reduced motion there
// is no film at all (auth.css hides it) and the form is ready at once.
(function () {
  "use strict";
  var hold = document.querySelector("fieldset.hold");
  var stage = document.querySelector(".intro");
  var body = document.body;

  function ready() {
    if (!hold) return;
    hold.disabled = false;
    var field = hold.querySelector("input[name=email]");
    if (field) field.focus({preventScroll: true});
    hold = null;
  }

  var still = false;
  try { still = matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}
  // Without a stage, under reduced motion, or if this script arrived so late that the stage's own fallback has
  // already dissolved it (auth.css), there is nothing to play.
  if (!stage || still || performance.now() > 2500) {
    if (stage) stage.remove();
    ready();
    return;
  }
  var canvas = stage.querySelector(".ifilm");
  var ctx = canvas.getContext("2d");
  if (!ctx) { stage.remove(); ready(); return; }
  stage.classList.add("live");
  body.classList.add("filming");

  // --- Timeline (seconds of film) -------------------------------------------------------------------------------
  var T = {cloudsIn: 1.55, wellIn: 3.45, drip: 5.75, gather: 6.0, fill: 6.95, navy: 7.4, domLogo: 7.6,
           lock: 8.05, out: 9.25, end: 10.4};

  // --- Small helpers --------------------------------------------------------------------------------------------
  function clamp(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
  function mix(a, b, p) { return a + (b - a) * p; }
  function smooth(x) { x = clamp(x); return x * x * (3 - 2 * x); }
  function outCubic(x) { x = clamp(x); return 1 - Math.pow(1 - x, 3); }
  function inOut(x) { x = clamp(x); return x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; }
  function seeded(s) { return function () { s |= 0; s = s + 0x6D2B79F5 | 0; var t = Math.imul(s ^ s >>> 15, 1 | s);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function radial(x, y, r0, r1, stops) {
    var g = ctx.createRadialGradient(x, y, r0, x, y, Math.max(r1, r0 + .01));
    for (var i = 0; i < stops.length; i += 2) g.addColorStop(stops[i], stops[i + 1]);
    return g;
  }
  function linear(x0, y0, x1, y1, stops) {
    var g = ctx.createLinearGradient(x0, y0, x1, y1);
    for (var i = 0; i < stops.length; i += 2) g.addColorStop(stops[i], stops[i + 1]);
    return g;
  }
  function offscreen(w, h) { var c = document.createElement("canvas"); c.width = w; c.height = h; return c; }
  // Smooth value noise and its fractal sum, for the clouds, the stone and the water.
  function noise2(seed) {
    var r = seeded(seed), v = new Float32Array(256 * 256);
    for (var i = 0; i < v.length; i++) v[i] = r();
    return function (x, y) {
      var xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
      var u = xf * xf * (3 - 2 * xf), w = yf * yf * (3 - 2 * yf);
      var x0 = xi & 255, x1 = (xi + 1) & 255, y0 = (yi & 255) << 8, y1 = ((yi + 1) & 255) << 8;
      var a = v[y0 + x0], b = v[y0 + x1], c = v[y1 + x0], d = v[y1 + x1];
      return a + (b - a) * u + (c - a) * w + (a - b - c + d) * u * w;
    };
  }
  var N = noise2(91);
  function fbm(x, y, oct) {
    var s = 0, a = .5, f = 1;
    for (var o = 0; o < oct; o++) { s += a * N(x * f, y * f); f *= 2.03; a *= .5; }
    return s;
  }

  // --- Canvas size ----------------------------------------------------------------------------------------------
  var W = 0, H = 0, S = 0, D = 0, cx = 0, cy = 0, dpr = 1;
  function resize() {
    W = innerWidth; H = innerHeight; S = Math.min(W, H); D = Math.max(W, H); cx = W / 2; cy = H / 2;
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    if (W * H * dpr * dpr > 2600000) dpr = 1;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  }
  resize();
  addEventListener("resize", resize);

  // --- Prepared pieces ------------------------------------------------------------------------------------------
  var rnd = seeded(7);
  var small = W < 700;
  var warp = [], i;
  for (i = 0; i < (small ? 260 : 440); i++) warp.push(newStar(true));
  function newStar(any) { return {x: rnd() * 2 - 1, y: rnd() * 2 - 1, z: any ? .05 + rnd() * .95 : 1, b: .4 + rnd() * .6}; }
  var sky = [];
  for (i = 0; i < 130; i++) sky.push({x: rnd(), y: rnd() * .62, r: .4 + rnd() * 1.1, ph: rnd() * 6.3});
  var cityGlow = [];
  for (i = 0; i < 90; i++) cityGlow.push({a: -1.35 + rnd() * .9, r: .86 + rnd() * .13, s: rnd()});
  var dunes = [dune(11, .055), dune(23, .035)];
  function dune(seed, h) {
    var r = seeded(seed), pts = [], p = [r() * 6, r() * 6, r() * 6];
    for (var k = 0; k <= 80; k++) {
      var x = k / 80;
      pts.push(h * (.55 + .32 * Math.sin(x * 4.2 + p[0]) + .15 * Math.sin(x * 9.7 + p[1]) + .04 * Math.sin(x * 23 + p[2])));
    }
    return pts;
  }

  // Clouds: textured cumulus, built from fractal noise and lit from the moon (up and to the right): each point is
  // as bright as the air between it and the moon is clear, so the tops and edges catch a silver light and the
  // undersides fall into shadow. A few are built per frame while the film opens, so nothing stalls.
  var CW = 480, CH = 264, cloudSpr = [], cloudTodo = 6;
  function buildCloud(seed) {
    var c = offscreen(CW, CH), g = c.getContext("2d"), img = g.createImageData(CW, CH), d = new Float32Array(CW * CH);
    var r = seeded(seed), ox = r() * 200, oy = r() * 200, lobes = [];
    for (var k = 0; k < 5; k++) lobes.push({x: .2 + r() * .6, y: .45 + r() * .2, r: .16 + r() * .16});
    var x, y, j;
    for (y = 0; y < CH; y++) for (x = 0; x < CW; x++) {
      var nx = x / CW, ny = y / CH, m = 0;
      for (j = 0; j < lobes.length; j++) {
        var L = lobes[j], dx = (nx - L.x) / (L.r * 1.25), dy = (ny - L.y) / L.r;
        m = Math.max(m, 1 - dx * dx - dy * dy);
      }
      m *= smooth((.86 - ny) / .16);   // flat-ish base
      var edge = smooth(nx / .14) * smooth((1 - nx) / .14) * smooth(ny / .2) * smooth((1 - ny) / .1);
      var n = fbm(nx * 6 + ox, ny * 3.4 + oy, 6), fine = fbm(nx * 22 + oy, ny * 13 + ox, 3);
      var dd = m * 1.05 + (n - .5) * 1.7 - .1;
      dd += (fine - .5) * .5 * clamp(1 - dd * 2);   // wispy, torn edges
      d[y * CW + x] = Math.max(0, dd * edge - (1 - edge) * .3);
    }
    var lx = 7, ly = -9;
    for (y = 0; y < CH; y++) for (x = 0; x < CW; x++) {
      var i0 = y * CW + x, dv = d[i0];
      var a = smooth(dv / .28);
      if (a <= 0) continue;
      var s = 0, q;
      for (q = 1; q <= 3; q++) { var sx = x + lx * q, sy = y + ly * q; if (sx >= 0 && sx < CW && sy >= 0 && sy < CH) s += d[sy * CW + sx]; }
      var lit = Math.exp(-s * 2.2), b = .1 + .9 * lit * (1 - Math.min(.55, dv * .35));
      b += (1 - a) * .25 * lit;   // silver lining on thin edges
      img.data[i0 * 4] = 16 + b * 156; img.data[i0 * 4 + 1] = 28 + b * 168; img.data[i0 * 4 + 2] = 58 + b * 178;
      img.data[i0 * 4 + 3] = Math.min(255, a * 245);
    }
    g.putImageData(img, 0, 0);
    return c;
  }
  var clouds = [];
  for (i = 0; i < 30; i++) clouds.push({x: (rnd() * 2 - 1) * 2, y: rnd() * 1.4 - .25, z: .5 + rnd() * 2.7, s: .8 + rnd() * .9,
                                        k: i % 6, f: rnd() < .5});
  for (i = 0; i < 5; i++) clouds.push({x: (rnd() - .5) * .5, y: (rnd() - .4) * .3, z: 1.1 + i * .34, s: 1.5, k: (i + 2) % 6, f: i % 2 === 1});
  clouds.sort(function (a, b) { return b.z - a.z; });
  // Film grain, a small tile laid over everything at low strength.
  var grain = offscreen(128, 128), gg = grain.getContext("2d"), gd = gg.createImageData(128, 128);
  for (i = 0; i < gd.data.length; i += 4) { var v = rnd() * 255; gd.data[i] = gd.data[i + 1] = gd.data[i + 2] = v; gd.data[i + 3] = 255; }
  gg.putImageData(gd, 0, 0);
  var grainFill = ctx.createPattern(grain, "repeat");
  // The water's surface: a soft, slowly moving shimmer.
  var ripTex = offscreen(256, 256);
  (function () {
    var g = ripTex.getContext("2d"), im = g.createImageData(256, 256);
    var P = 6.2832 / 256;
    for (var y = 0; y < 256; y++) for (var x = 0; x < 256; x++) {
      var ph = y * P * 14 + 1.7 * Math.sin(x * P * 3 + y * P * 2) + .8 * Math.sin(x * P * 7 - y * P * 5);
      var m = .5 + .5 * Math.sin(x * P * 2 + 1.3 * Math.sin(y * P * 3)) * Math.sin(y * P * 4 + x * P);
      var h = Math.pow(Math.max(0, Math.sin(ph)), 10) * m, k = (y * 256 + x) * 4;
      im.data[k] = 175; im.data[k + 1] = 208; im.data[k + 2] = 255; im.data[k + 3] = Math.min(255, h * 200);
    }
    g.putImageData(im, 0, 0);
  })();
  var ripFill = ctx.createPattern(ripTex, "repeat");
  // The moon, for the sky and for its reflection.
  var SPR = 256;
  var moonSpr = offscreen(SPR, SPR);
  (function () {
    var g = moonSpr.getContext("2d"), c = SPR / 2;
    var gr = g.createRadialGradient(c - 30, c - 34, 10, c, c, c);
    gr.addColorStop(0, "#ffffff"); gr.addColorStop(.7, "#e6eefb"); gr.addColorStop(1, "#c7d6ee");
    g.fillStyle = gr; g.beginPath(); g.arc(c, c, c - 2, 0, 6.283); g.fill();
    g.fillStyle = "rgba(150,170,205,.26)";
    [[-30, -20, 22], [34, 18, 16], [6, 46, 12], [-40, 40, 9], [40, -40, 10]].forEach(function (m) {
      g.beginPath(); g.arc(c + m[0], c + m[1], m[2], 0, 6.283); g.fill();
    });
  })();
  // The moon as the water shows it: a soft bright disc, no craters at that distance.
  var glowSpr = offscreen(SPR, SPR);
  (function () {
    var g = glowSpr.getContext("2d"), c = SPR / 2, gr = g.createRadialGradient(c, c, 0, c, c, c);
    gr.addColorStop(0, "#ffffff"); gr.addColorStop(.72, "#eef4ff"); gr.addColorStop(.9, "rgba(220,232,255,.75)"); gr.addColorStop(1, "rgba(200,220,255,0)");
    g.fillStyle = gr; g.fillRect(0, 0, SPR, SPR);
  })();
  // The logo's white is where its picture is clear: that shape is what the glints gather into.
  var logoImg = stage.querySelector(".ilogo img"), whiteSpr = null, targets = null;
  var R = 56, glints = [];
  function makeLogo() {
    if (whiteSpr || !logoImg || !logoImg.complete || !logoImg.naturalWidth) return;
    whiteSpr = offscreen(SPR, SPR);
    var g = whiteSpr.getContext("2d"), c = SPR / 2, r = 97 / 112 * c;
    g.fillStyle = "#fff"; g.beginPath(); g.arc(c, c, c - 1, 0, 6.283); g.fill();
    g.globalCompositeOperation = "destination-out";
    g.save(); g.beginPath(); g.arc(c, c, r, 0, 6.283); g.clip(); g.drawImage(logoImg, c - r, c - r, r * 2, r * 2); g.restore();
    g.globalCompositeOperation = "source-over";
    try {
      var px = g.getImageData(0, 0, SPR, SPR).data, pts = [], tries = 0, rr = seeded(5);
      while (pts.length < 900 && tries++ < 40000) {
        var x = Math.floor(rr() * SPR), y = Math.floor(rr() * SPR);
        if (px[(y * SPR + x) * 4 + 3] > 200) pts.push([(x / SPR - .5) * 2 * R, (y / SPR - .5) * 2 * R]);
      }
      targets = pts;
    } catch (e) { targets = []; }
    var gr = seeded(17);
    for (var k = 0; k < targets.length; k++) {
      var ang = gr() * 6.283, rad = Math.sqrt(gr()) * 30;
      glints.push({hx: Math.cos(ang) * rad, hy: Math.sin(ang) * rad, tx: targets[k][0], ty: targets[k][1],
                   out: 20 + Math.pow(gr(), 1.5) * 120, dir: ang + (gr() - .5) * .6, del: gr(), ph: gr() * 6.3, len: 2 + gr() * 4, b: .5 + gr() * .5});
    }
  }

  // --- Scenes ---------------------------------------------------------------------------------------------------
  function moonX() { return W * .76; }
  function moonY() { return H * .19; }
  function moon(alpha, x, y) {
    x = x == null ? moonX() : x; y = y == null ? moonY() : y;
    var r = S * .042;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = radial(x, y, r * .8, r * 9, [0, "rgba(160,195,255,.30)", .35, "rgba(110,150,230,.10)", 1, "rgba(80,120,200,0)"]);
    ctx.fillRect(x - r * 9, y - r * 9, r * 18, r * 18);
    ctx.drawImage(moonSpr, x - r, y - r, r * 2, r * 2);
    ctx.globalAlpha = 1;
  }
  function stars(alpha, t, maxY) {
    ctx.fillStyle = "#e8f0ff";
    for (var k = 0; k < sky.length; k++) {
      var s = sky[k]; if (s.y * H > maxY) continue;
      ctx.globalAlpha = alpha * (.35 + .45 * (.5 + .5 * Math.sin(t * 2.2 + s.ph)));
      ctx.fillRect(s.x * W, s.y * H, s.r, s.r);
    }
    ctx.globalAlpha = 1;
  }

  // 1. Space: a warp through the stars as a night-side planet rises, its cities glittering, its air glowing.
  function space(t, dt) {
    var p = clamp(t / 2.05);
    ctx.fillStyle = linear(0, 0, 0, H, [0, "#01030b", 1, "#040f28"]); ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = radial(W * .3, H * .35, 0, D * .55, [0, "rgba(46,74,150,.26)", 1, "rgba(46,74,150,0)"]); ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = radial(W * .72, H * .62, 0, D * .45, [0, "rgba(30,96,160,.20)", 1, "rgba(30,96,160,0)"]); ctx.fillRect(0, 0, W, H);
    var v = .1 + 2.4 * p * p * p, F = D * .5;
    ctx.lineCap = "round";
    for (var k = 0; k < warp.length; k++) {
      var s = warp[k];
      s.z -= v * dt;
      var x = cx + s.x / s.z * F, y = cy + s.y / s.z * F;
      if (s.z < .03 || x < -50 || x > W + 50 || y < -50 || y > H + 50) { warp[k] = newStar(false); continue; }
      var z0 = s.z + v * .05, x0 = cx + s.x / z0 * F, y0 = cy + s.y / z0 * F;
      ctx.strokeStyle = "rgba(205,224,255," + Math.min(1, s.b * (.3 + (1 - s.z) * 1.1)).toFixed(3) + ")";
      ctx.lineWidth = .4 + (1 - s.z) * 2;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x + .1, y + .1); ctx.stroke();
    }
    var q = inOut((p - .3) / .7);
    if (q > 0) {
      var PR = D * 1.35, py = H + PR - H * .55 * q, px = cx;
      ctx.fillStyle = radial(px, py, PR * .96, PR * 1.14, [0, "rgba(90,160,255,.0)", .2, "rgba(110,175,255,.55)", .45, "rgba(60,120,220,.22)", 1, "rgba(40,90,200,0)"]);
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = radial(px, py - PR * .2, PR * .7, PR, [0, "#020816", .85, "#04102a", 1, "#0b2a5c"]);
      ctx.beginPath(); ctx.arc(px, py, PR, 0, 6.283); ctx.fill();
      for (k = 0; k < cityGlow.length; k++) {
        var c = cityGlow[k], ang = c.a + p * .05, rr = PR * c.r;
        var gx = px + Math.sin(ang) * rr, gy = py - Math.cos(ang) * rr;
        if (gy > H || gx < 0 || gx > W) continue;
        ctx.globalAlpha = q * (.4 + .6 * c.s);
        ctx.fillStyle = "#ffd28a"; ctx.fillRect(gx, gy, 1.6, 1.6);
      }
      ctx.globalAlpha = 1;
      ctx.strokeStyle = "rgba(170,210,255," + (.75 * q).toFixed(3) + ")"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(px, py, PR, 0, 6.283); ctx.stroke();
    }
    var haze = smooth((p - .78) / .22);
    if (haze > 0) { ctx.fillStyle = "rgba(42,86,160," + (haze * .55).toFixed(3) + ")"; ctx.fillRect(0, 0, W, H); }
  }

  // 2. Inside the air, under the moon: the clouds rush up past us as we fall through them.
  function cloudSky(t, alpha) {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = linear(0, 0, 0, H, [0, "#040d28", .55, "#0f2c5e", 1, "#1f4a82"]); ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
    stars(alpha * .8, t, H * .5);
    moon(alpha);
  }
  function cloudLayer(t) {
    var p = (t - T.cloudsIn) / 2.3, fade = smooth((t - T.cloudsIn) / .45) * (1 - smooth((t - 3.55) / .4));
    if (fade <= 0 || !cloudSpr.length) return;
    var F = D * .5, cz = p * 2.9;
    for (var k = 0; k < clouds.length; k++) {
      var c = clouds[k], z = c.z - cz, spr = cloudSpr[c.k % cloudSpr.length];
      if (z < .06) continue;
      var a = clamp((3.3 - z) / 1.1) * clamp((z - .06) / .45) * fade;
      if (a <= .01) continue;
      var w = D * .6 * c.s / z, h = w * CH / CW;
      var x = cx + c.x * F / z, y = cy + (c.y - p * .6) * F / z;
      if (x + w / 2 < 0 || x - w / 2 > W || y + h / 2 < 0 || y - h / 2 > H) continue;
      ctx.globalAlpha = a;
      if (c.f) { ctx.save(); ctx.translate(x, y); ctx.scale(-1, 1); ctx.drawImage(spr, -w / 2, -h / 2, w, h); ctx.restore(); }
      else ctx.drawImage(spr, x - w / 2, y - h / 2, w, h);
    }
    // The mist of being inside a cloud, thickest as the nearest ones pass.
    var mist = Math.sin(clamp((t - 2.2) / 1.5) * Math.PI) * .45 * fade;
    if (mist > 0) { ctx.globalAlpha = mist; ctx.fillStyle = radial(cx, cy, 0, D * .7, [0, "rgba(120,148,196,.9)", 1, "rgba(60,90,150,.5)"]); ctx.fillRect(0, 0, W, H); }
    ctx.globalAlpha = 1;
  }

  // 3. The well: below the clouds, desert dunes under the moon, an old stone well with a lantern by it. We glide
  // down to it and tilt to look straight in.
  function well(t, alpha) {
    var p = clamp((t - T.wellIn) / 1.95), tilt = inOut((p - .1) / .8), grow = inOut(p);
    var k = mix(.75, 7.6, Math.pow(grow, 1.9));
    var hz = H * (.5 - tilt * .95 + (1 - grow) * .04);
    ctx.globalAlpha = alpha;
    if (hz > 0) {
      ctx.fillStyle = linear(0, 0, 0, hz, [0, "#030a22", .75, "#11305f", 1, "#24497e"]); ctx.fillRect(0, 0, W, hz);
      ctx.globalAlpha = 1; stars(alpha * .7, t, hz * .9); moon(alpha * clamp(hz / (H * .3))); ctx.globalAlpha = alpha;
      for (var L = 0; L < 2; L++) {
        var dp = dunes[L], sp = 1 + grow * (L ? .9 : .4), base = hz + (L ? H * .03 : 2);
        ctx.beginPath(); ctx.moveTo(-10, H);
        for (var q = 0; q <= 80; q++) ctx.lineTo(cx + (q / 80 - .5) * W * 1.3 * sp, base - dp[q] * H * (L ? 1.4 : 1));
        ctx.lineTo(W + 10, H); ctx.closePath();
        ctx.fillStyle = linear(0, base - H * .06, 0, base + H * .25, L ? [0, "#18366a", 1, "#071229"] : [0, "#112a58", 1, "#0a1a3c"]);
        ctx.fill();
        ctx.strokeStyle = L ? "rgba(170,200,250,.42)" : "rgba(150,185,245,.3)"; ctx.lineWidth = 1.2; ctx.stroke();
      }
    }
    var gtop = Math.max(0, hz + H * .03);
    ctx.fillStyle = linear(0, gtop, 0, H, [0, "#102650", .3, "#0a1a3c", 1, "#030916"]); ctx.fillRect(0, gtop, W, H - gtop + 1);
    var wy = mix(H * .66, cy, tilt);
    var rx = S * .17 * k, ry = rx * mix(.3, 1, tilt), hw = rx * .72 * (1 - tilt);
    var lamp = 1 - smooth(tilt * 1.5);
    // The moon's long light on the sand and the well's shadow, away from the moon.
    ctx.globalAlpha = alpha * (1 - tilt);
    ctx.fillStyle = radial(cx - rx * .7, wy + hw + ry * .4, 0, rx * 2, [0, "rgba(0,4,14,.55)", 1, "rgba(0,4,14,0)"]);
    ctx.save(); ctx.translate(cx - rx * .7, wy + hw + ry * .4); ctx.scale(1.6, .32); ctx.beginPath(); ctx.arc(0, 0, rx * 1.4, 0, 6.283); ctx.restore(); ctx.fill();
    ctx.globalAlpha = alpha;
    var top = wy - rx * 1.3, pw = Math.max(2, rx * .075), lx = cx - rx * .64, ly = top + pw * 2.4;
    if (lamp > 0) {
      ctx.globalAlpha = alpha * lamp;
      ctx.fillStyle = radial(lx, ly + rx * .6, 0, rx * 2.4, [0, "rgba(255,186,110,.16)", 1, "rgba(255,186,110,0)"]);
      ctx.fillRect(lx - rx * 2.4, ly + rx * .6 - rx * 2.4, rx * 4.8, rx * 4.8);
      // posts and crossbar, with the moon's edge light
      ctx.fillStyle = linear(0, top, 0, wy, [0, "#0a1630", 1, "#0d1c3a"]);
      ctx.fillRect(cx - rx * .92 - pw / 2, top, pw, wy - top + ry * .15);
      ctx.fillRect(cx + rx * .92 - pw / 2, top, pw, wy - top + ry * .15);
      ctx.fillRect(cx - rx * 1.08, top - pw * .3, rx * 2.16, pw);
      ctx.fillStyle = "rgba(160,195,245,.35)";
      ctx.fillRect(cx + rx * .92 + pw * .2, top, pw * .3, wy - top);
      ctx.fillRect(cx - rx * 1.08, top - pw * .3, rx * 2.16, Math.max(.8, pw * .18));
      ctx.strokeStyle = "rgba(200,180,140,.55)"; ctx.lineWidth = Math.max(.8, rx * .012);
      ctx.beginPath(); ctx.moveTo(cx + rx * .1, top + pw * .7); ctx.quadraticCurveTo(cx + rx * .12, wy - ry * 1.3, cx + rx * .1, wy - ry * .9); ctx.stroke();
      ctx.fillStyle = linear(cx, 0, cx + rx * .2, 0, [0, "#0d1a36", 1, "#2a4370"]);
      ctx.beginPath(); ctx.moveTo(cx + rx * .01, wy - ry * .95); ctx.lineTo(cx + rx * .19, wy - ry * .95); ctx.lineTo(cx + rx * .16, wy - ry * .95 + rx * .15); ctx.lineTo(cx + rx * .04, wy - ry * .95 + rx * .15); ctx.closePath(); ctx.fill();
      // the lantern hanging from the bar
      ctx.strokeStyle = "rgba(20,30,60,.9)"; ctx.lineWidth = Math.max(.6, rx * .006);
      ctx.beginPath(); ctx.moveTo(lx, top + pw * .7); ctx.lineTo(lx, ly - rx * .05); ctx.stroke();
      ctx.fillStyle = radial(lx, ly, 0, rx * .9, [0, "rgba(255,206,130,.55)", .25, "rgba(255,170,90,.16)", 1, "rgba(255,170,90,0)"]);
      ctx.fillRect(lx - rx * .9, ly - rx * .9, rx * 1.8, rx * 1.8);
      ctx.fillStyle = "#ffe0a8"; ctx.beginPath(); ctx.ellipse(lx, ly, Math.max(1.4, rx * .03), Math.max(2, rx * .045), 0, 0, 6.283); ctx.fill();
      ctx.globalAlpha = alpha;
    }
    // The stone body: courses of blocks, each a slightly different stone, lit from the moon and warmed by the lamp.
    if (hw > 1) {
      ctx.save();
      ctx.beginPath(); ctx.moveTo(cx - rx, wy); ctx.lineTo(cx - rx, wy + hw);
      ctx.ellipse(cx, wy + hw, rx, ry, 0, Math.PI, 0, true); ctx.lineTo(cx + rx, wy);
      ctx.ellipse(cx, wy, rx, ry, 0, 0, Math.PI, false); ctx.closePath();
      ctx.fillStyle = linear(cx - rx, 0, cx + rx, 0, [0, "#16244a", .4, "#0f1c3a", .8, "#253c66", 1, "#3a5888"]); ctx.fill();
      ctx.clip();
      var rows = 5, cols = 9, br = seeded(3);
      for (var j = 0; j < rows; j++) for (q = 0; q < cols; q++) {
        var a0 = Math.PI * (q + (j % 2 ? .5 : 0)) / cols, a1 = a0 + Math.PI / cols;
        var shade = br() * .1 - .05, x0 = cx + Math.cos(a0) * rx, x1 = cx + Math.cos(a1) * rx;
        var yb = wy + hw * j / rows, h1 = hw / rows;
        ctx.fillStyle = shade > 0 ? "rgba(170,200,255," + shade.toFixed(3) + ")" : "rgba(0,4,16," + (-shade * 2).toFixed(3) + ")";
        ctx.beginPath();
        ctx.moveTo(x0, yb + Math.sin(a0) * ry); ctx.lineTo(x1, yb + Math.sin(a1) * ry);
        ctx.lineTo(x1, yb + Math.sin(a1) * ry + h1); ctx.lineTo(x0, yb + Math.sin(a0) * ry + h1); ctx.closePath(); ctx.fill();
      }
      ctx.strokeStyle = "rgba(2,8,22,.6)"; ctx.lineWidth = Math.max(.6, rx * .012);
      for (j = 1; j < rows; j++) { ctx.beginPath(); ctx.ellipse(cx, wy + hw * j / rows, rx, ry, 0, 0, Math.PI); ctx.stroke(); }
      for (j = 0; j < rows; j++) for (q = 0; q <= cols; q++) {
        var an = Math.PI * (q + (j % 2 ? .5 : 0)) / cols, jx = cx + Math.cos(an) * rx, jy = wy + hw * j / rows + Math.sin(an) * ry;
        ctx.beginPath(); ctx.moveTo(jx, jy); ctx.lineTo(jx, jy + hw / rows); ctx.stroke();
      }
      ctx.fillStyle = radial(lx, ly, 0, rx * 1.6, [0, "rgba(255,180,100," + (.22 * lamp).toFixed(3) + ")", 1, "rgba(255,180,100,0)"]);
      ctx.fillRect(cx - rx, wy - ry, rx * 2, hw + ry * 2);
      ctx.restore();
    }
    // The rim: a ring of capstones.
    var irx = rx * .8, iry = ry * .8;
    ctx.fillStyle = linear(cx - rx, wy - ry, cx + rx, wy + ry, [0, "#1d2f55", .6, "#2c4675", 1, "#46649a"]);
    ctx.beginPath(); ctx.ellipse(cx, wy, rx, ry, 0, 0, 6.283); ctx.fill();
    var cr = seeded(9);
    for (j = 0; j < 16; j++) {
      var b0 = j / 16 * 6.283 + .02, b1 = (j + 1) / 16 * 6.283 - .02, sh = cr() * .14 - .07;
      ctx.fillStyle = sh > 0 ? "rgba(190,215,255," + sh.toFixed(3) + ")" : "rgba(0,6,20," + (-sh * 2.2).toFixed(3) + ")";
      ctx.beginPath(); ctx.ellipse(cx, wy, rx, ry, 0, b0, b1); ctx.ellipse(cx, wy, irx, iry, 0, b1, b0, true); ctx.closePath(); ctx.fill();
    }
    ctx.strokeStyle = "rgba(4,10,26,.65)"; ctx.lineWidth = Math.max(.6, rx * .008);
    for (j = 0; j < 16; j++) {
      var c1 = j / 16 * 6.283;
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(c1) * irx, wy + Math.sin(c1) * iry); ctx.lineTo(cx + Math.cos(c1) * rx, wy + Math.sin(c1) * ry); ctx.stroke();
    }
    ctx.strokeStyle = "rgba(200,220,255,.25)"; ctx.lineWidth = Math.max(.8, rx * .01);
    ctx.beginPath(); ctx.ellipse(cx, wy, rx, ry, 0, -1.6, .2); ctx.stroke();
    // The shaft: a dark inner wall with its courses, then the water further down.
    ctx.fillStyle = linear(0, wy - iry, 0, wy + iry, [0, "#01050f", 1, "#081631"]);
    ctx.beginPath(); ctx.ellipse(cx, wy, irx, iry, 0, 0, 6.283); ctx.fill();
    ctx.strokeStyle = "rgba(90,120,180,.10)"; ctx.lineWidth = Math.max(.6, rx * .006);
    for (j = 1; j < 5; j++) { var f = 1 - j * .028; ctx.beginPath(); ctx.ellipse(cx, wy + (1 - tilt) * iry * .08 * j, irx * f, iry * f, 0, 0, 6.283); ctx.stroke(); }
    var depth = (1 - tilt) * iry * .35, wf = mix(.88, .84, tilt);
    water(t, cx, wy + depth, irx * wf, iry * wf, alpha);
  }

  // The water, and in it the moon's reflection: broken by the drop into glints that gather into the logo's white,
  // while the water turns to the logo's navy.
  function water(t, x, y, rx, ry, alpha) {
    var sq = ry / Math.max(rx, 1), navyIn = smooth((t - T.gather - .2) / 1.1);
    ctx.save();
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, 6.283); ctx.clip();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = radial(x, y, 0, Math.max(rx, ry), [0, "#123c74", .6, "#09224d", 1, "#020a1d"]);
    ctx.fillRect(x - rx, y - ry, rx * 2, ry * 2);
    if (navyIn > 0) {
      ctx.globalAlpha = alpha * navyIn;
      ctx.fillStyle = radial(x, y, 0, Math.max(rx, ry), [0, "#003b6b", .5, "#003b6b", 1, "rgba(0,59,107,.6)"]);
      ctx.fillRect(x - rx, y - ry, rx * 2, ry * 2);
    }
    // the surface shimmer, and the contact shadow where the water meets the stone
    [[1.7, 14, 3, .13], [2.6, -9, 5, .09]].forEach(function (L) {
      ctx.globalAlpha = alpha * L[3] * (1 - navyIn);
      ctx.save(); ctx.translate(x + t * L[1], y + t * L[2]); ctx.rotate(L[1] < 0 ? .25 : -.08);
      ctx.scale(L[0] * Math.max(1, rx / 400), sq * L[0] * .7 * Math.max(1, rx / 400));
      ctx.fillStyle = ripFill; ctx.fillRect(-rx * 2, -rx * 2, rx * 4, rx * 4); ctx.restore();
    });
    ctx.globalAlpha = alpha;
    ctx.fillStyle = radial(x, y, Math.max(rx, ry) * .82, Math.max(rx, ry), [0, "rgba(0,4,14,0)", 1, "rgba(0,4,14,.55)"]);
    ctx.fillRect(x - rx, y - ry, rx * 2, ry * 2);
    // reflected stars
    ctx.fillStyle = "#dfe9ff";
    for (var j = 0; j < 46; j++) {
      var st = sky[j], sx = x + (st.x - .5) * rx * 1.8, sy = y + (st.y / .62 - .5) * ry * 1.8;
      ctx.globalAlpha = alpha * .45 * (.5 + .5 * Math.sin(t * 2 + st.ph)) * (1 - navyIn);
      ctx.fillRect(sx, sy, st.r, st.r);
    }
    // the ripples
    if (t > T.drip) {
      for (j = 0; j < 5; j++) {
        var age = t - T.drip - j * .13; if (age <= 0) continue;
        var rr = age * S * .32, ra = Math.max(0, .5 - age * .32);
        if (ra <= 0) continue;
        ctx.lineWidth = Math.max(1, S * .0035);
        ctx.globalAlpha = alpha * ra; ctx.strokeStyle = "#a9c6ff";
        ctx.beginPath(); ctx.ellipse(x, y, rr, rr * sq, 0, 0, 6.283); ctx.stroke();
        ctx.globalAlpha = alpha * ra * .8; ctx.strokeStyle = "#010817";
        ctx.beginPath(); ctx.ellipse(x, y, rr + 3.5, (rr + 3.5) * sq, 0, 0, 6.283); ctx.stroke();
      }
    }
    // the moon's reflection, until the drop breaks it
    var mr = Math.min(30, Math.max(rx, 1) * .2), broke = smooth((t - T.drip) / .12);
    ctx.save(); ctx.translate(x, y); ctx.scale(1, sq);
    var halo = mix(mr * 4, R * 2.6, navyIn), hA = mix(.5, .4, navyIn);
    ctx.globalAlpha = alpha * hA;
    ctx.fillStyle = radial(0, 0, mr * .6, halo, [0, "rgba(160,200,255,.42)", 1, "rgba(120,160,240,0)"]);
    ctx.fillRect(-halo, -halo, halo * 2, halo * 2);
    if (broke < 1) wavy(glowSpr, 0, 0, mr, alpha * (1 - broke) * .95, 1.4, t);
    makeLogo();
    if (t > T.drip && glints.length) drawGlints(t, alpha, mr);
    ctx.restore();
    ctx.restore();
    // the falling drop, catching the light
    if (t > T.drip - .3 && t < T.drip) {
      var dp = (t - (T.drip - .3)) / .3, dy = mix(y - H * .55, y, dp * dp);
      ctx.globalAlpha = alpha * .9; ctx.fillStyle = radial(x, dy, 0, 6, [0, "#ffffff", 1, "rgba(200,220,255,0)"]);
      ctx.fillRect(x - 6, dy - 6, 12, 12);
    }
    ctx.globalAlpha = 1;
  }
  // Each glint starts as a point of the broken moon, is thrown out on the ripple, then drifts to its place in the
  // logo's white, shrinking from a moonlit streak to a point; the white then fills in under them and they fade.
  function drawGlints(t, alpha, mr) {
    var thrown = outCubic((t - T.drip) / .45), fill = smooth((t - T.fill) / .45), sc = mr / 30;
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = "#d6e4ff";
    for (var j = 0; j < glints.length; j++) {
      var g = glints[j], c = inOut((t - T.gather - g.del * .4) / .9);
      // where the ripple threw it, then swirled in along a curve to its place
      var sx = g.hx * sc + Math.cos(g.dir) * g.out * thrown, sy = g.hy * sc + Math.sin(g.dir) * g.out * thrown * .85;
      var dx = sx - g.tx, dy = sy - g.ty, turn = (1 - c) * 1.1, ct = Math.cos(turn), st = Math.sin(turn);
      var px = g.tx + (dx * ct - dy * st) * (1 - c) + (1 - c) * 2 * Math.sin(t * 7 + g.ph), py = g.ty + (dx * st + dy * ct) * (1 - c);
      var tw = .5 + .5 * Math.sin(t * 14 + g.ph * 3);
      var a = (1 - fill * .85) * mix(tw * g.b, 1, c) * (.5 + .5 * thrown);
      if (a <= .01) continue;
      var len = mix(g.len * 1.5, 1.8, c), th = mix(1.1, 1.8, c);
      ctx.globalAlpha = alpha * a * .85;
      ctx.fillRect(px - len / 2, py - th / 2, len, th);
    }
    ctx.globalCompositeOperation = "source-over";
    if (whiteSpr && fill > 0) wavy(whiteSpr, 0, 0, R, alpha * fill, 1.6 * (1 - smooth((t - T.fill - .1) / .5)), t);
  }
  // A sprite drawn in thin horizontal slices, each nudged sideways: the classic water-reflection shimmer.
  function wavy(img, x, y, r, alpha, amp, t) {
    if (alpha <= .005) return;
    ctx.globalAlpha = alpha;
    if (amp < .05) { ctx.drawImage(img, x - r, y - r, r * 2, r * 2); return; }
    var n = Math.max(12, Math.round(r)), sh = SPR / n, dh = r * 2 / n;
    for (var j = 0; j < n; j++) {
      var off = Math.sin(j * .55 + t * 9) * amp + Math.sin(j * .21 - t * 5) * amp * .4;
      ctx.drawImage(img, 0, j * sh, SPR, sh + .5, x - r + off, y - r + j * dh, r * 2, dh + .6);
    }
  }

  // 4. The stage turns to the welcome panel's navy, keeping a few stars, for the logo and the name.
  function navy(t, alpha) {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "#003b6b"; ctx.fillRect(0, 0, W, H);
    var glow = 1 - smooth((t - T.out) / .5);
    ctx.globalAlpha = alpha * glow;
    ctx.fillStyle = radial(cx, cy, 0, D * .6, [0, "rgba(40,110,185,.5)", 1, "rgba(0,40,80,0)"]); ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
    stars(alpha * .4 * glow, t, H);
  }

  // --- The film -------------------------------------------------------------------------------------------------
  var t = 0, last = 0, raf = 0, over = false;
  function frame(now) {
    raf = 0;
    if (over) return;
    var dt = last ? Math.min((now - last) / 1000, 1 / 20) : 1 / 60;
    last = now;
    // Build the clouds one at a time while space plays; the film waits for the first.
    if (cloudTodo > 0) { cloudSpr.push(buildCloud(101 + cloudTodo * 37)); cloudTodo--; dt = Math.min(dt, 1 / 30); }
    t += dt;
    try { draw(t, dt); cues(t); }
    catch (e) { finish(true); return; }
    if (t < T.end) raf = requestAnimationFrame(frame);
  }
  function draw(t, dt) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1;
    if (t < T.navy + .6) {
      if (t < 2.1) space(t, dt);
      if (t > T.cloudsIn && t < 4) cloudSky(t, smooth((t - T.cloudsIn) / .5));
      if (t > T.wellIn) well(t, smooth((t - T.wellIn) / .5));
      if (t > T.cloudsIn && t < 4) cloudLayer(t);
    }
    if (t > T.navy) navy(t, smooth((t - T.navy) / .45));
    // the water's logo stays on top of the navy until the real one takes over
    if (t > T.navy && t < T.domLogo + .45 && whiteSpr) {
      ctx.globalAlpha = 1 - smooth((t - T.domLogo - .25) / .2);
      ctx.fillStyle = radial(cx, cy, 50, R * 2.6, [0, "rgba(160,200,255,.3)", 1, "rgba(120,160,240,0)"]);
      ctx.fillRect(cx - 150, cy - 150, 300, 300);
      ctx.drawImage(whiteSpr, cx - R, cy - R, R * 2, R * 2);
    }
    var vig = 1 - smooth((t - T.navy) / .5);
    if (vig > 0) {
      ctx.globalAlpha = vig;
      ctx.fillStyle = radial(cx, cy, S * .35, D * .78, [0, "rgba(0,0,0,0)", 1, "rgba(0,3,12,.6)"]); ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = .05 * vig; ctx.fillStyle = grainFill;
      ctx.save(); ctx.translate((t * 977) % 128, (t * 613) % 128); ctx.fillRect(-128, -128, W + 256, H + 256); ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  // --- The logo, the name, and the hand-over to the sign-in page --------------------------------------------------
  var lock = stage.querySelector(".ilock"), logoEl = stage.querySelector(".ilogo"), name = stage.querySelector(".iname");
  var chars = [];
  (function split(el) {
    Array.prototype.slice.call(el.childNodes).forEach(function (n) {
      if (n.nodeType === 3) {
        var frag = document.createDocumentFragment();
        n.textContent.split("").forEach(function (ch) { var s = document.createElement("span"); s.className = "ch"; s.textContent = ch; frag.appendChild(s); chars.push(s); });
        n.parentNode.replaceChild(frag, n);
      } else split(n);
    });
  })(name);
  var lockScale = 1;
  function place(x, y, sc, el) { (el || lock).style.transform = "translate(" + x + "px," + y + "px) scale(" + sc + ")"; }
  function centredLogo() {
    lock.style.transformOrigin = "56px 56px";
    lockScale = Math.min(1, (W - 48) / lock.offsetWidth);
    return {x: cx - 56, y: cy - 56};
  }
  var said = {};
  function once(key, at, fn) { if (!said[key] && t >= at) { said[key] = true; fn(); } }
  function cues(t) {
    once("logo", T.domLogo, function () {
      var c = centredLogo();
      place(c.x, c.y, 1);
      lock.style.opacity = "1";
      if (lock.animate) logoEl.animate([{opacity: 0}, {opacity: 1}], {duration: 300, easing: "ease", fill: "both"});
    });
    once("lock", T.lock, function () {
      var c = centredLogo(), wl = lock.offsetWidth * lockScale, x = cx - wl / 2 - 56 + 56 * lockScale, from = "translate(" + c.x + "px," + c.y + "px) scale(1)";
      var to = "translate(" + x + "px," + c.y + "px) scale(" + lockScale + ")";
      if (lock.animate) lock.animate([{transform: from}, {transform: to}], {duration: 950, easing: "cubic-bezier(.65,0,.35,1)", fill: "forwards"});
      place(x, c.y, lockScale);
      chars.forEach(function (ch, j) {
        if (!ch.animate) { ch.style.opacity = "1"; return; }
        ch.animate([{opacity: 0, transform: "translateY(22px) scale(.55)", filter: "blur(8px)"},
                    {opacity: 1, transform: "translateY(-3px) scale(1.04)", filter: "blur(0)", offset: .65},
                    {opacity: 1, transform: "none", filter: "blur(0)"}],
                   {duration: 700, delay: 260 + j * 62, easing: "cubic-bezier(.2,.9,.3,1)", fill: "both"});
      });
    });
    once("out", T.out, function () { finish(false); });
  }

  var finished = false;
  function finish(skipped) {
    if (finished) return;
    finished = true;
    stage.classList.add("done");
    sound.leave(skipped);
    var wide = innerWidth >= 880, panel = document.querySelector(".welcome"), badge = panel && panel.querySelector(".wmark .badge");
    body.classList.add("reveal");
    if (skipped || !wide || !badge || !stage.animate) {
      // A quick lift away: straight to the form.
      var dur = skipped ? 380 : 750;
      if (stage.animate) {
        if (!skipped) lock.animate([{opacity: 1}, {opacity: 0, transform: lock.style.transform + " translateY(-30px)", filter: "blur(6px)"}], {duration: 600, easing: "ease-in", fill: "forwards"});
        stage.animate([{opacity: 1}, {opacity: 0}], {duration: dur, easing: "ease", fill: "forwards"}).onfinish = end;
      } else end();
      body.classList.remove("filming");
      ready();
      return;
    }
    // On a computer the stage folds into the welcome panel and the film's logo lands on the panel's own.
    over = true;  // stop drawing: the canvas holds the navy frame
    var pr = panel.getBoundingClientRect(), br = badge.getBoundingClientRect();
    var sc = br.width / 112;
    var from = lock.style.transform;
    var tx = br.left + br.width / 2 - 56, ty = br.top + br.height / 2 - 56;
    var to = "translate(" + tx + "px," + ty + "px) scale(" + sc + ")";
    var ease = "cubic-bezier(.7,0,.2,1)";
    lock.animate([{transform: from}, {transform: to}], {duration: 1050, easing: ease, fill: "forwards"});
    logoEl.animate([{boxShadow: "0 0 0 1px rgba(255,255,255,.4),0 0 60px 8px rgba(150,190,255,.28)"}, {boxShadow: "0 0 0 0 rgba(255,255,255,0),0 0 0 0 rgba(150,190,255,0)"}],
                   {duration: 900, easing: "ease", fill: "forwards"});
    var clipTo = "inset(" + Math.max(0, pr.top) + "px " + Math.max(0, innerWidth - pr.right) + "px " + Math.max(0, innerHeight - pr.bottom) + "px " + pr.left + "px)";
    stage.animate([{clipPath: "inset(0px 0px 0px 0px)"}, {clipPath: clipTo}], {duration: 1050, easing: ease, fill: "forwards"}).onfinish = function () {
      body.classList.remove("filming");
      stage.animate([{opacity: 1}, {opacity: 0}], {duration: 350, easing: "ease", fill: "forwards"}).onfinish = end;
      ready();
    };
  }
  function end() {
    over = true;
    if (raf) cancelAnimationFrame(raf);
    removeEventListener("resize", resize);
    removeEventListener("keydown", onKey);
    stage.remove();
  }

  // --- Sound ------------------------------------------------------------------------------------------------------
  // All synthesised: a low pad under the whole film, a rising rush through space, wind in the clouds, a high
  // shimmer over the desert, the drop and its ripple, glints as the light gathers, a bell as the logo fills in, soft ticks for the letters, and a
  // last breath of air with a chord as the page arrives.
  var sound = (function () {
    var KEY = "mysafar-film-sound", ac = null, master = null, verb = null, noise = null, on = false;
    var button = stage.querySelector(".isnd");
    function pref() { try { return localStorage.getItem(KEY) === "on"; } catch (e) { return false; } }
    function remember(v) { try { localStorage.setItem(KEY, v ? "on" : "off"); } catch (e) {} }
    function setup() {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ac = new AC();
      var comp = ac.createDynamicsCompressor();
      comp.connect(ac.destination);
      master = ac.createGain(); master.gain.value = 0; master.connect(comp);
      verb = ac.createConvolver();
      var len = ac.sampleRate * 2.8, ir = ac.createBuffer(2, len, ac.sampleRate);
      for (var ch = 0; ch < 2; ch++) { var d = ir.getChannelData(ch); for (var j = 0; j < len; j++) d[j] = (Math.random() * 2 - 1) * Math.pow(1 - j / len, 3.2); }
      verb.buffer = ir;
      var wet = ac.createGain(); wet.gain.value = .5; verb.connect(wet); wet.connect(master);
      noise = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
      var nd = noise.getChannelData(0); for (j = 0; j < nd.length; j++) nd[j] = Math.random() * 2 - 1;
      return true;
    }
    function env(g, pts, base) {   // pts: [filmTime, value, ...], placed against the film clock
      var now = ac.currentTime;
      g.gain.setValueAtTime(0, now);
      for (var j = 0; j < pts.length; j += 2) {
        var at = base + pts[j];
        if (at > now) g.gain.linearRampToValueAtTime(pts[j + 1], at);
      }
    }
    function out(node, dry, wet) {
      var g = ac.createGain(); node.connect(g);
      var d = ac.createGain(); d.gain.value = dry; g.connect(d); d.connect(master);
      if (wet) { var w = ac.createGain(); w.gain.value = wet; g.connect(w); w.connect(verb); }
      return g;
    }
    function tone(type, f, base, pts, dry, wet, stopAt) {
      var o = ac.createOscillator(); o.type = type; o.frequency.value = f;
      var g = out(o, dry, wet); env(g, pts, base);
      o.start(); o.stop(base + stopAt);
      return o;
    }
    function hiss(base, filter, f0, f1, t0, t1, pts, dry, wet, q) {
      var s = ac.createBufferSource(); s.buffer = noise; s.loop = true;
      var f = ac.createBiquadFilter(); f.type = filter; f.Q.value = q || 1;
      var now = ac.currentTime, a0 = Math.max(now, base + t0);
      f.frequency.setValueAtTime(f0, a0); f.frequency.exponentialRampToValueAtTime(f1, Math.max(a0 + .05, base + t1));
      s.connect(f); var g = out(f, dry, wet); env(g, pts, base);
      s.start(); s.stop(base + t1 + .2);
    }
    function ping(at, f0, f1, len, level, wet, type) {
      if (at < ac.currentTime) return;
      var o = ac.createOscillator(); o.type = type || "sine";
      o.frequency.setValueAtTime(f0, at); o.frequency.exponentialRampToValueAtTime(f1, at + len * .7);
      var g = out(o, 1, wet);
      g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(level, at + .006); g.gain.exponentialRampToValueAtTime(.0001, at + len);
      o.start(at); o.stop(at + len + .05);
    }
    function bell(at, f, level) {
      [[1, 1], [2, .35], [2.76, .3], [5.4, .12], [8.9, .05]].forEach(function (p) {
        ping(at, f * p[0], f * p[0] * .999, 3.2 / Math.sqrt(p[0]), level * p[1], .7);
      });
    }
    function score() {
      var base = ac.currentTime - t, E = T.end + 2;
      if (t < T.out) {
        tone("sine", 73.42, base, [Math.max(t, 0), 0, 1.5, .11, 6.6, .14, 7.2, .19, T.out + .5, .13, E, 0], 1, .2, E);
        tone("sine", 110.3, base, [Math.max(t, 0), 0, 2, .09, 7.2, .14, T.out + .5, .1, E, 0], 1, .3, E);
        var o = tone("triangle", 146.83, base, [Math.max(t, 0), 0, 3, .05, 7.2, .07, E, 0], .7, .4, E); o.detune.value = 6;
      }
      if (t < 2.4) hiss(base, "bandpass", 180, 1500, Math.max(t, 0), 2.4, [Math.max(t, 0), 0, 1.7, .32, 2.4, 0], 1, .2, 1.3);
      if (t < 3.95) hiss(base, "lowpass", 900, 380, Math.max(t, 1.5), 3.95, [Math.max(t, 1.5), 0, 2.5, .26, 3.95, 0], 1, .3, .8);
      if (t < 5.6) tone("sine", 587.33, base, [Math.max(t, 3.4), 0, 4.6, .02, 5.6, 0], .5, 1, 5.7);
      if (t < 5.6) tone("sine", 880, base, [Math.max(t, 3.4), 0, 4.8, .013, 5.6, 0], .4, 1, 5.7);
      ping(base + T.drip, 1900, 620, .16, .22, .6);
      ping(base + T.drip + .05, 340, 170, .32, .12, .5);
      ping(base + T.drip + .42, 2300, 900, .1, .05, .8);
      // the glints: a scatter of tiny high notes, thinning as they settle
      var gr = seeded(77);
      for (var k = 0; k < 26; k++) {
        var at = T.drip + .1 + Math.pow(gr(), 1.3) * 1.4, f = [1174.7, 1318.5, 1480, 1760, 1975.5, 2349.3][Math.floor(gr() * 6)];
        ping(base + at, f, f, .5, .018 + gr() * .02, .9);
      }
      bell(base + T.fill + .15, 587.33, .16);
      chars.forEach(function (c, j) { ping(base + T.lock + .26 + j * .062 + .1, 1150 + j * 70, 1050 + j * 70, .09, .045, .5, "triangle"); });
      if (t < T.out + 1) {
        hiss(base, "lowpass", 2400, 260, Math.max(t, T.out - .1), T.out + 1.2, [Math.max(t, T.out - .1), 0, T.out + .3, .12, T.out + 1.2, 0], 1, .4, .7);
        [293.66, 369.99, 440, 587.33].forEach(function (f, j) { ping(base + T.out + .25 + j * .07, f, f, 2.8, .045, .8); });
      }
    }
    function start() {
      if (!ac && !setup()) return false;
      if (ac.state === "suspended" && ac.resume) ac.resume();
      if (!on) {
        on = true;
        master.gain.cancelScheduledValues(ac.currentTime);
        master.gain.setValueAtTime(master.gain.value, ac.currentTime);
        master.gain.linearRampToValueAtTime(.9, ac.currentTime + .4);
        score();
      }
      return true;
    }
    function stop() {
      if (!ac) return;
      on = false;
      master.gain.cancelScheduledValues(ac.currentTime);
      master.gain.setValueAtTime(master.gain.value, ac.currentTime);
      master.gain.linearRampToValueAtTime(0, ac.currentTime + .25);
      var old = ac; ac = null; setTimeout(function () { old.close && old.close(); }, 400);
    }
    function show() { button.setAttribute("aria-pressed", on ? "true" : "false"); button.setAttribute("aria-label", on ? "Turn sound off" : "Turn sound on"); }
    button.addEventListener("click", function (ev) {
      ev.stopPropagation();
      if (on) stop(); else start();
      remember(on); show();
    });
    show();
    // Remembered "on": try at once; a browser that still wants a tap keeps it quiet, and the button says so.
    if (pref()) {
      try {
        start();
        if (ac && ac.state !== "running") setTimeout(function () { if (ac && ac.state !== "running") { stop(); show(); } }, 300);
      } catch (e) { on = false; }
      show();
    }
    return {
      leave: function (skipped) {
        if (!ac) return;
        if (skipped) { stop(); return; }
        var old = ac; setTimeout(function () { try { old.close(); } catch (e) {} }, 4500);
      }
    };
  })();

  // --- Skipping ---------------------------------------------------------------------------------------------------
  stage.querySelector(".iskip").addEventListener("click", function (ev) { ev.stopPropagation(); finish(true); });
  stage.addEventListener("click", function () { finish(true); });
  function onKey(ev) { if (ev.key === "Escape" || ev.key === "Enter" || ev.key === " ") { if (ev.target.closest && ev.target.closest(".ibtn")) return; ev.preventDefault(); finish(true); } }
  addEventListener("keydown", onKey);

  if (logoImg && !logoImg.complete) logoImg.addEventListener("load", makeLogo);
  makeLogo();
  raf = requestAnimationFrame(frame);
})();
