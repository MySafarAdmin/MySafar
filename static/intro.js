// The sign-in page's opening film. Everything is drawn here on a canvas, frame by frame, from simple shapes and
// gradients, so there is no video to download: the camera falls from space towards a night-side planet, through
// moonlit clouds, past the Kaaba with the tawaf circling it, and down into a stone well, where a drop of water
// ripples the moon's reflection and the reflection becomes the logo. The logo (a real element from then on) moves
// aside for "MySafar", then, on a computer, the stage folds into the navy welcome panel as the logo lands on the
// panel's own; on a phone it simply lifts away. Skip, Escape, or a tap anywhere goes straight to the form.
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
  var T = {cloudsIn: 1.55, kaabaIn: 3.2, wellIn: 4.85, drip: 6.0, morph: 6.2, navy: 6.95, domLogo: 7.05,
           lock: 7.55, out: 8.75, end: 9.9};

  // --- Small helpers --------------------------------------------------------------------------------------------
  function clamp(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
  function mix(a, b, p) { return a + (b - a) * p; }
  function smooth(x) { x = clamp(x); return x * x * (3 - 2 * x); }
  function inOut(x) { x = clamp(x); return x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; }
  function outCubic(x) { x = clamp(x); return 1 - Math.pow(1 - x, 3); }
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
  var warp = [];
  for (var i = 0; i < (small ? 260 : 440); i++) warp.push(newStar(true));
  function newStar(any) { return {x: rnd() * 2 - 1, y: rnd() * 2 - 1, z: any ? .05 + rnd() * .95 : 1, b: .4 + rnd() * .6}; }
  var sky = [];
  for (i = 0; i < 110; i++) sky.push({x: rnd(), y: rnd() * .62, r: .4 + rnd() * 1.1, ph: rnd() * 6.3});
  var city = [];
  for (i = 0; i < 170; i++) city.push({x: rnd() * 2 - 1, d: Math.pow(rnd(), 1.6), ph: rnd() * 6.3, w: rnd() < .8});
  var lights = [];
  for (i = 0; i < 70; i++) { var a = rnd() * 6.283; lights.push({a: a, r: .8 + rnd() * .2}); }
  var tawaf = [];
  for (i = 0; i < 220; i++) tawaf.push({a: rnd() * 6.283, r: .34 + Math.pow(rnd(), .8) * .58, s: .7 + rnd() * .5});
  var cityGlow = [];
  for (i = 0; i < 90; i++) cityGlow.push({a: -1.35 + rnd() * .9, r: .86 + rnd() * .13, s: rnd()});
  var ridges = [ridge(11, .12), ridge(23, .075)];
  function ridge(seed, h) {
    var r = seeded(seed), pts = [], f = [1 + r() * 2, 3 + r() * 3, 7 + r() * 5], p = [r() * 6, r() * 6, r() * 6];
    for (var k = 0; k <= 80; k++) {
      var x = k / 80;
      pts.push(h * (.55 + .3 * Math.sin(x * f[0] * 3.1 + p[0]) + .12 * Math.sin(x * f[1] * 3.1 + p[1]) + .05 * Math.sin(x * f[2] * 6 + p[2])));
    }
    return pts;
  }
  // Clouds: a few soft, top-lit sprites drawn once, then flown past at many sizes.
  var puffs = [];
  for (i = 0; i < 4; i++) puffs.push(cloudSprite(31 + i * 17));
  function cloudSprite(seed) {
    var r = seeded(seed), c = offscreen(512, 300), g = c.getContext("2d"), k, x, y, rad, gr;
    var blobs = [];
    for (k = 0; k < 30; k++) {
      var ang = r() * 6.283, d = Math.pow(r(), .7);
      blobs.push({x: 256 + Math.cos(ang) * d * 170, y: 170 + Math.sin(ang) * d * 60 - (1 - d) * 26, r: 38 + r() * 64});
    }
    for (k = 0; k < blobs.length; k++) {   // the shaded underside
      x = blobs[k].x; y = blobs[k].y + 14; rad = blobs[k].r;
      gr = g.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, "rgba(28,52,96,.55)"); gr.addColorStop(1, "rgba(28,52,96,0)");
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, rad, 0, 6.283); g.fill();
    }
    for (k = 0; k < blobs.length; k++) {   // moonlit tops
      x = blobs[k].x + 6; y = blobs[k].y - 10; rad = blobs[k].r * .82;
      gr = g.createRadialGradient(x + rad * .2, y - rad * .35, 0, x, y, rad);
      gr.addColorStop(0, "rgba(196,214,244,.62)"); gr.addColorStop(.5, "rgba(112,142,196,.32)"); gr.addColorStop(1, "rgba(80,110,170,0)");
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, rad, 0, 6.283); g.fill();
    }
    return c;
  }
  var clouds = [];
  for (i = 0; i < 34; i++) clouds.push({x: (rnd() * 2 - 1) * 1.9, y: rnd() * 1.6 - .5, z: .55 + rnd() * 2.6, s: .7 + rnd() * .8,
                                        k: i % 4, f: rnd() < .5});
  for (i = 0; i < 5; i++) clouds.push({x: (rnd() - .5) * .5, y: (rnd() - .3) * .4, z: 1.2 + i * .32, s: 1.3, k: i % 4, f: i % 2 === 1});
  clouds.sort(function (a, b) { return b.z - a.z; });
  // Film grain, a small tile laid over everything at low strength.
  var grain = offscreen(128, 128), gg = grain.getContext("2d"), gd = gg.createImageData(128, 128);
  for (i = 0; i < gd.data.length; i += 4) { var v = rnd() * 255; gd.data[i] = gd.data[i + 1] = gd.data[i + 2] = v; gd.data[i + 3] = 255; }
  gg.putImageData(gd, 0, 0);
  var grainFill = ctx.createPattern(grain, "repeat");
  // The moon and the logo as round sprites, for the water's wobbling reflection.
  var SPR = 256;
  var moonSpr = offscreen(SPR, SPR);
  (function () {
    var g = moonSpr.getContext("2d"), c = SPR / 2;
    var gr = g.createRadialGradient(c - 30, c - 34, 10, c, c, c);
    gr.addColorStop(0, "#ffffff"); gr.addColorStop(.7, "#e6eefb"); gr.addColorStop(1, "#c7d6ee");
    g.fillStyle = gr; g.beginPath(); g.arc(c, c, c - 2, 0, 6.283); g.fill();
    g.fillStyle = "rgba(150,170,205,.28)";
    [[-30, -20, 22], [34, 18, 16], [6, 46, 12], [-40, 40, 9], [40, -40, 10]].forEach(function (m) {
      g.beginPath(); g.arc(c + m[0], c + m[1], m[2], 0, 6.283); g.fill();
    });
  })();
  var logoImg = stage.querySelector(".ilogo img"), logoSpr = null;
  function makeLogo() {
    if (logoSpr || !logoImg || !logoImg.complete || !logoImg.naturalWidth) return;
    logoSpr = offscreen(SPR, SPR);
    var g = logoSpr.getContext("2d"), c = SPR / 2, r = 97 / 112 * c;
    g.fillStyle = "#fff"; g.beginPath(); g.arc(c, c, c - 1, 0, 6.283); g.fill();
    g.save(); g.beginPath(); g.arc(c, c, r, 0, 6.283); g.clip();
    g.drawImage(logoImg, c - r, c - r, r * 2, r * 2); g.restore();
  }

  // --- Scenes ---------------------------------------------------------------------------------------------------
  var moonX = function () { return W * .76; }, moonY = function () { return H * .19; };
  function moon(alpha, size) {
    var x = moonX(), y = moonY(), r = S * .042 * (size || 1);
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
      var R = D * 1.35, py = H + R - H * .55 * q, px = cx;
      ctx.fillStyle = radial(px, py, R * .96, R * 1.14, [0, "rgba(90,160,255,.0)", .2, "rgba(110,175,255,.55)", .45, "rgba(60,120,220,.22)", 1, "rgba(40,90,200,0)"]);
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = radial(px, py - R * .2, R * .7, R, [0, "#020816", .85, "#04102a", 1, "#0b2a5c"]);
      ctx.beginPath(); ctx.arc(px, py, R, 0, 6.283); ctx.fill();
      for (k = 0; k < cityGlow.length; k++) {
        var c = cityGlow[k], ang = c.a + p * .05, rr = R * c.r;
        var gx = px + Math.sin(ang) * rr, gy = py - Math.cos(ang) * rr;
        if (gy > H || gx < 0 || gx > W) continue;
        ctx.globalAlpha = q * (.4 + .6 * c.s);
        ctx.fillStyle = "#ffd28a"; ctx.fillRect(gx, gy, 1.6, 1.6);
      }
      ctx.globalAlpha = 1;
      ctx.strokeStyle = "rgba(170,210,255," + (.75 * q).toFixed(3) + ")"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(px, py, R, 0, 6.283); ctx.stroke();
    }
    var haze = smooth((p - .78) / .22);
    if (haze > 0) { ctx.fillStyle = "rgba(42,86,160," + (haze * .55).toFixed(3) + ")"; ctx.fillRect(0, 0, W, H); }
  }

  // 2. The night sky inside the air, under the moon, that the clouds rush past.
  function cloudSky(t, alpha) {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = linear(0, 0, 0, H, [0, "#050f2c", .55, "#12336a", 1, "#2b5994"]); ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
    stars(alpha * .8, t, H * .55);
    moon(alpha);
  }
  function cloudLayer(t) {
    var p = (t - T.cloudsIn) / 2.4, fade = smooth((t - T.cloudsIn) / .45) * (1 - smooth((t - 3.75) / .35));
    if (fade <= 0) return;
    var F = D * .5, cz = p * 2.9;
    for (var k = 0; k < clouds.length; k++) {
      var c = clouds[k], z = c.z - cz;
      if (z < .07) continue;
      var a = clamp((3.3 - z) / 1.1) * clamp((z - .07) / .4) * fade;
      if (a <= .01) continue;
      var w = D * .62 * c.s / z, h = w * 300 / 512;
      var x = cx + c.x * F / z, y = cy + (c.y - p * .55) * F / z;
      if (x + w / 2 < 0 || x - w / 2 > W || y + h / 2 < 0 || y - h / 2 > H) continue;
      ctx.globalAlpha = a;
      if (c.f) { ctx.save(); ctx.translate(x, y); ctx.scale(-1, 1); ctx.drawImage(puffs[c.k], -w / 2, -h / 2, w, h); ctx.restore(); }
      else ctx.drawImage(puffs[c.k], x - w / 2, y - h / 2, w, h);
    }
    ctx.globalAlpha = 1;
  }

  // 3. Makkah at night: ridges, the city's lights, the minarets and the lit courtyard with the tawaf turning round
  // the Kaaba. The camera comes down and passes it on the right.
  function kaaba(t, alpha) {
    var p = clamp((t - T.kaabaIn) / 2.55), e = inOut(p);
    ctx.globalAlpha = alpha;
    var hz = H * (.62 - .08 * e);
    ctx.fillStyle = linear(0, 0, 0, hz, [0, "#030a22", .7, "#0d2552", 1, "#1d4378"]); ctx.fillRect(0, 0, W, hz + 2);
    ctx.globalAlpha = 1;
    stars(alpha * .7, t, hz * .8);
    moon(alpha);
    ctx.globalAlpha = alpha;
    // Ridges, with parallax.
    for (var L = 0; L < 2; L++) {
      var rp = ridges[L], spread = 1 + e * (L ? .5 : .22), base = hz + (L ? 2 : 0);
      ctx.beginPath(); ctx.moveTo(-10, base + 4);
      for (var k = 0; k < rp.length; k++) ctx.lineTo(cx + (k / 80 - .5) * W * 1.2 * spread, base - rp[k] * H * (L ? .9 : 1));
      ctx.lineTo(W + 10, base + 4); ctx.closePath();
      ctx.fillStyle = L ? "#06122c" : "#0a1b3e"; ctx.fill();
      if (!L) { ctx.strokeStyle = "rgba(130,170,235,.22)"; ctx.lineWidth = 1; ctx.stroke(); }
    }
    ctx.fillStyle = linear(0, hz, 0, H, [0, "#0b1a3c", 1, "#040b1e"]); ctx.fillRect(0, hz, W, H - hz);
    // The city's warm lights, spreading as we come down.
    var gs = 1 + e * 2.2;
    for (k = 0; k < city.length; k++) {
      var c = city[k], x = cx + c.x * W * .75 * gs, y = hz + 3 + c.d * H * .2 * gs;
      if (x < 0 || x > W || y > H) continue;
      ctx.globalAlpha = alpha * (.45 + .35 * Math.sin(t * 3 + c.ph));
      ctx.fillStyle = c.w ? "#ffd7a0" : "#cfe0ff"; ctx.fillRect(x, y, 1.6, 1.6);
    }
    // The Haram. Distance shrinks as we approach; the Kaaba sits a little left of our path, so it slides out left.
    var k1 = mix(.17, 4.6, Math.pow(p, 1.9));
    var s = W * .085 * k1 * (small ? 1.6 : 1), bx = cx - W * .11 * k1, by = hz + H * .075 * k1;
    var rx = s * 2.7, ry = rx * .2;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = radial(bx, by - s * .4, 0, s * 4, [0, "rgba(255,226,180,.24)", .5, "rgba(190,210,255,.08)", 1, "rgba(150,190,255,0)"]);
    ctx.fillRect(bx - s * 4, by - s * 4.4, s * 8, s * 8);
    ctx.save(); ctx.translate(bx, by); ctx.scale(1, ry / rx);
    ctx.fillStyle = radial(0, 0, 0, rx * 1.25, [0, "rgba(236,242,255,.75)", .55, "rgba(190,206,236,.4)", .8, "rgba(120,140,190,.12)", 1, "rgba(80,100,160,0)"]);
    ctx.beginPath(); ctx.arc(0, 0, rx * 1.25, 0, 6.283); ctx.fill();
    ctx.restore();
    var spin = t * .45;
    function arcade(front) {
      for (var j = 0; j < lights.length; j++) {
        var l = lights[j], sn = Math.sin(l.a);
        if ((sn > 0) !== front) continue;
        ctx.globalAlpha = alpha * .8; ctx.fillStyle = "#ffe2b0";
        ctx.fillRect(bx + Math.cos(l.a) * rx * 1.3 * l.r, by + sn * ry * 1.3 * l.r, Math.max(1.2, s * .03), Math.max(1.2, s * .03));
      }
      for (j = 0; j < 7; j++) {
        var ma = j / 7 * 6.283 + .4, ms = Math.sin(ma);
        if ((ms > 0) !== front) continue;
        minaret(bx + Math.cos(ma) * rx * 1.45, by + ms * ry * 1.45, Math.max(2, s * .075), s * 1.9, alpha);
      }
    }
    function pilgrims(front) {
      ctx.fillStyle = "#f4f7ff";
      for (var j = 0; j < tawaf.length; j++) {
        var w = tawaf[j], an = w.a + spin * (1.2 - w.r * .6), sn = Math.sin(an);
        if ((sn > 0) !== front) continue;
        ctx.globalAlpha = alpha * (.55 + .45 * w.s);
        var z = Math.max(1, s * .022 * w.s);
        ctx.fillRect(bx + Math.cos(an) * rx * w.r, by + sn * ry * w.r - z, z, z);
      }
    }
    arcade(false); pilgrims(false);
    drawKaaba(bx, by, s, alpha);
    pilgrims(true); arcade(true);
    ctx.globalAlpha = 1;
  }
  // A minaret: a tapering shaft with two lit balconies and a pointed cap, moonlit on its right.
  function minaret(x, y, w, h, alpha) {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = linear(x - w / 2, 0, x + w / 2, 0, [0, "#081430", .6, "#0d1d40", 1, "#2b4475"]);
    ctx.beginPath(); ctx.moveTo(x - w / 2, y); ctx.lineTo(x - w * .32, y - h * .86); ctx.lineTo(x + w * .32, y - h * .86); ctx.lineTo(x + w / 2, y); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x - w * .3, y - h * .86); ctx.lineTo(x, y - h); ctx.lineTo(x + w * .3, y - h * .86); ctx.closePath(); ctx.fill();
    [.5, .74].forEach(function (b) {
      var bw = w * (1.25 - b * .4), by2 = y - h * b;
      ctx.fillStyle = "#0b1a3a"; ctx.fillRect(x - bw / 2, by2 - w * .14, bw, w * .14);
      ctx.fillStyle = "rgba(255,222,160,.85)"; ctx.fillRect(x - bw / 2, by2, bw, Math.max(.8, w * .05));
    });
    ctx.fillStyle = radial(x, y - h * .74, 0, w * 2.2, [0, "rgba(255,220,160,.28)", 1, "rgba(255,220,160,0)"]);
    ctx.fillRect(x - w * 2.2, y - h * .74 - w * 2.2, w * 4.4, w * 4.4);
    ctx.fillStyle = "#e9c46a"; ctx.fillRect(x - .5, y - h * 1.04, 1, h * .04);
  }
  function drawKaaba(bx, by, s, alpha) {
    var h = s * .98, x0 = bx - s * .58, x1 = bx + s * .22, x2 = bx + s * .58, y0 = by, y1 = by + s * .05, y2 = by - s * .06;
    var lift = s * .12;  // how much of the top we see from above
    ctx.globalAlpha = alpha;
    // shadow on the marble
    ctx.fillStyle = "rgba(10,18,40,.35)";
    ctx.beginPath(); ctx.ellipse(bx, by + s * .04, s * .75, s * .1, 0, 0, 6.283); ctx.fill();
    // front face
    ctx.fillStyle = linear(0, y0 - h, 0, y1, [0, "#121722", .75, "#0b0e15", 1, "#1c1a18"]);
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.lineTo(x1, y1 - h); ctx.lineTo(x0, y0 - h); ctx.closePath(); ctx.fill();
    // side face, turned to the moon
    ctx.fillStyle = linear(x1, 0, x2, 0, [0, "#0c111c", 1, "#1a2335"]);
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x2, y2 - h); ctx.lineTo(x1, y1 - h); ctx.closePath(); ctx.fill();
    // top
    ctx.fillStyle = "#26324a";
    ctx.beginPath(); ctx.moveTo(x0, y0 - h); ctx.lineTo(x1, y1 - h); ctx.lineTo(x2, y2 - h); ctx.lineTo(x0 + (x2 - x1), y0 - h - lift + (y2 - y1)); ctx.closePath(); ctx.fill();
    // the gold band
    var b0 = h * .2, bt = Math.max(1.2, h * .065);
    ctx.fillStyle = linear(0, y0 - h + b0, 0, y0 - h + b0 + bt, [0, "#f3d488", 1, "#b5862c"]);
    ctx.beginPath(); ctx.moveTo(x0, y0 - h + b0); ctx.lineTo(x1, y1 - h + b0); ctx.lineTo(x1, y1 - h + b0 + bt); ctx.lineTo(x0, y0 - h + b0 + bt); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#8f6a26";
    ctx.beginPath(); ctx.moveTo(x1, y1 - h + b0); ctx.lineTo(x2, y2 - h + b0); ctx.lineTo(x2, y2 - h + b0 + bt); ctx.lineTo(x1, y1 - h + b0 + bt); ctx.closePath(); ctx.fill();
    // the door, raised off the ground
    var dx = mix(x0, x1, .68), dw = s * .14, dy = mix(y0, y1, .68);
    ctx.fillStyle = linear(0, dy - h * .55, 0, dy - h * .14, [0, "#f0cf7c", 1, "#a77a28"]);
    ctx.fillRect(dx, dy - h * .55, dw, h * .41);
    ctx.fillStyle = "rgba(255,235,180,.5)"; ctx.fillRect(dx + dw * .47, dy - h * .53, Math.max(.6, dw * .06), h * .37);
    // rim light from the moon and a warm floor bounce
    ctx.strokeStyle = "rgba(170,200,255,.45)"; ctx.lineWidth = Math.max(.6, s * .008);
    ctx.beginPath(); ctx.moveTo(x2, y2); ctx.lineTo(x2, y2 - h); ctx.lineTo(x0 + (x2 - x1), y0 - h - lift + (y2 - y1)); ctx.stroke();
    ctx.fillStyle = linear(0, y1 - h * .25, 0, y1, [0, "rgba(255,220,170,0)", 1, "rgba(255,220,170,.16)"]);
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x2, y2); ctx.lineTo(x2, y2 - h * .25); ctx.lineTo(x0, y0 - h * .25); ctx.closePath(); ctx.fill();
  }

  // 4. The well: we glide down to an old stone well under the moon and tilt to look straight into it. In the water
  // the moon's reflection waits; a drop falls, rings spread, and as the water stills the reflection is the logo.
  function well(t, alpha) {
    var p = clamp((t - T.wellIn) / 1.75), tilt = inOut((p - .05) / .8), grow = inOut(p);
    var k = mix(.55, 7.5, Math.pow(grow, 1.7));
    var hz = H * (.46 - tilt * .9);
    ctx.globalAlpha = alpha;
    if (hz > 0) {
      ctx.fillStyle = linear(0, 0, 0, hz, [0, "#040b24", 1, "#173a6e"]); ctx.fillRect(0, 0, W, hz);
      ctx.globalAlpha = 1; stars(alpha * .6, t, hz * .9); moon(alpha * clamp(hz / (H * .3))); ctx.globalAlpha = alpha;
    }
    if (hz > 0) {
      ctx.fillStyle = "#081633";
      ctx.beginPath(); ctx.moveTo(0, hz + 2);
      for (var r0 = 0; r0 < ridges[0].length; r0++) ctx.lineTo(r0 / 80 * W, hz - ridges[0][r0] * H * .45);
      ctx.lineTo(W, hz + 2); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = linear(0, Math.max(0, hz), 0, H, [0, "#132a55", .25, "#0b1a3c", 1, "#030916"]); ctx.fillRect(0, Math.max(0, hz), W, H);
    var wy = mix(H * .64, cy, tilt);
    var rx = S * .17 * k, ry = rx * mix(.28, 1, tilt), hw = rx * .78 * (1 - tilt);
    // ground shadow and lantern pool
    ctx.fillStyle = radial(cx, wy + hw, 0, rx * 1.8, [0, "rgba(0,0,0,.4)", 1, "rgba(0,0,0,0)"]);
    ctx.fillRect(cx - rx * 2, wy + hw - rx * 2, rx * 4, rx * 4);
    var lamp = 1 - smooth(tilt * 1.6);
    // the posts, crossbar, rope and bucket (behind the rim at the back)
    if (lamp > 0) {
      var top = wy - rx * 1.25, pw = Math.max(2, rx * .07);
      ctx.globalAlpha = alpha * lamp;
      ctx.fillStyle = "#091530";
      ctx.fillRect(cx - rx * .92 - pw / 2, top, pw, wy - top + ry * .2);
      ctx.fillRect(cx + rx * .92 - pw / 2, top, pw, wy - top + ry * .2);
      ctx.fillRect(cx - rx * 1.05, top - pw * .2, rx * 2.1, pw * .9);
      ctx.fillStyle = "rgba(150,185,240,.35)";
      ctx.fillRect(cx + rx * .92 + pw * .15, top, pw * .3, wy - top);
      ctx.strokeStyle = "rgba(190,170,130,.6)"; ctx.lineWidth = Math.max(.8, rx * .01);
      ctx.beginPath(); ctx.moveTo(cx, top + pw * .7); ctx.lineTo(cx, wy - ry * 1.4); ctx.stroke();
      ctx.fillStyle = "#0f1d3c"; ctx.fillRect(cx - rx * .08, wy - ry * 1.4, rx * .16, rx * .14);
      var lx = cx - rx * .62, ly = top + pw * 2.2;
      ctx.fillStyle = radial(lx, ly, 0, rx * 1.1, [0, "rgba(255,196,120,.45)", .3, "rgba(255,170,90,.12)", 1, "rgba(255,170,90,0)"]);
      ctx.fillRect(lx - rx * 1.1, ly - rx * 1.1, rx * 2.2, rx * 2.2);
      ctx.fillStyle = "#ffd59a"; ctx.beginPath(); ctx.arc(lx, ly, Math.max(1.5, rx * .035), 0, 6.283); ctx.fill();
      ctx.globalAlpha = alpha;
    }
    // the stone body
    if (hw > 1) {
      ctx.fillStyle = linear(cx - rx, 0, cx + rx, 0, [0, "#1b2a49", .35, "#0e1a33", .8, "#22375e", 1, "#33507f"]);
      ctx.beginPath(); ctx.moveTo(cx - rx, wy); ctx.lineTo(cx - rx, wy + hw);
      ctx.ellipse(cx, wy + hw, rx, ry, 0, Math.PI, 0, true); ctx.lineTo(cx + rx, wy);
      ctx.ellipse(cx, wy, rx, ry, 0, 0, Math.PI, false); ctx.closePath(); ctx.fill();
      ctx.fillStyle = radial(cx - rx * .62, wy - rx * .9, 0, rx * 1.5, [0, "rgba(255,180,100," + (.2 * lamp).toFixed(3) + ")", 1, "rgba(255,180,100,0)"]);
      ctx.fill();
      ctx.strokeStyle = "rgba(2,8,22,.55)"; ctx.lineWidth = Math.max(.6, rx * .012);
      var rows = 4;
      for (var j = 1; j < rows; j++) { ctx.beginPath(); ctx.ellipse(cx, wy + hw * j / rows, rx, ry, 0, 0, Math.PI); ctx.stroke(); }
      for (j = 0; j < rows; j++) for (var q = 0; q < 7; q++) {
        var an = Math.PI * ((q + (j % 2 ? .5 : 0)) / 7 + .04), jx = cx + Math.cos(an) * rx, jy = wy + hw * j / rows + Math.sin(an) * ry;
        ctx.beginPath(); ctx.moveTo(jx, jy); ctx.lineTo(jx, jy + hw / rows); ctx.stroke();
      }
    }
    // the rim, the inner wall and the water
    ctx.fillStyle = linear(cx - rx, wy - ry, cx + rx, wy + ry, [0, "#2a3d63", .6, "#3c5788", 1, "#5a77a8"]);
    ctx.beginPath(); ctx.ellipse(cx, wy, rx, ry, 0, 0, 6.283); ctx.fill();
    ctx.strokeStyle = "rgba(4,10,26,.6)"; ctx.lineWidth = Math.max(.6, rx * .008);
    for (j = 0; j < 18; j++) {
      var a1 = j / 18 * 6.283;
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(a1) * rx * .8, wy + Math.sin(a1) * ry * .8); ctx.lineTo(cx + Math.cos(a1) * rx, wy + Math.sin(a1) * ry); ctx.stroke();
    }
    var irx = rx * .8, iry = ry * .8;
    ctx.fillStyle = linear(0, wy - iry, 0, wy + iry, [0, "#020815", 1, "#0a1a38"]);
    ctx.beginPath(); ctx.ellipse(cx, wy, irx, iry, 0, 0, 6.283); ctx.fill();
    ctx.strokeStyle = "rgba(90,120,180,.12)"; ctx.lineWidth = Math.max(.6, rx * .006);
    for (j = 1; j < 4; j++) { ctx.beginPath(); ctx.ellipse(cx, wy + (1 - tilt) * iry * .1 * j, irx * (1 - j * .03), iry * (1 - j * .03), 0, 0, 6.283); ctx.stroke(); }
    var depth = (1 - tilt) * iry * .35, wrx = irx * mix(.9, .86, tilt), wry = iry * mix(.9, .86, tilt), wcy = wy + depth;
    water(t, cx, wcy, wrx, wry, alpha, tilt);
  }
  function water(t, x, y, rx, ry, alpha, tilt) {
    ctx.save();
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, 6.283); ctx.clip();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = radial(x, y, 0, Math.max(rx, ry), [0, "#123a72", .55, "#0a2350", 1, "#030b20"]);
    ctx.fillRect(x - rx, y - ry, rx * 2, ry * 2);
    // reflected stars, drifting with the wobble
    var amp = wobble(t);
    ctx.fillStyle = "#dfe9ff";
    for (var j = 0; j < 40; j++) {
      var st = sky[j], sx = x + (st.x - .5) * rx * 1.8 + Math.sin(t * 3 + j) * amp * .4, sy = y + (st.y / .62 - .5) * ry * 1.8;
      ctx.globalAlpha = alpha * .5 * (.5 + .5 * Math.sin(t * 2 + st.ph));
      ctx.fillRect(sx, sy, st.r, st.r);
    }
    // ripples from the drop
    if (t > T.drip) {
      ctx.lineWidth = Math.max(1, S * .003);
      for (j = 0; j < 4; j++) {
        var age = t - T.drip - j * .14; if (age <= 0) continue;
        var rr = age * S * .34, ra = Math.max(0, .55 - age * .38);
        if (ra <= 0) continue;
        ctx.globalAlpha = alpha * ra; ctx.strokeStyle = "#b9d1ff";
        ctx.beginPath(); ctx.ellipse(x, y, rr, rr * ry / rx, 0, 0, 6.283); ctx.stroke();
        ctx.globalAlpha = alpha * ra * .7; ctx.strokeStyle = "#020a1e";
        ctx.beginPath(); ctx.ellipse(x, y, rr + 3, (rr + 3) * ry / rx, 0, 0, 6.283); ctx.stroke();
      }
    }
    // the moon's reflection, becoming the logo
    var mr = Math.min(56, Math.max(rx, 1) * .22), sq = ry / Math.max(rx, 1), m = smooth((t - T.morph) / .65), fade = 1 - smooth((t - T.domLogo - .25) / .2);
    if (fade > 0) {
      var halo = mr * mix(4, 2.4, m);
      ctx.globalAlpha = alpha * (.55 + .2 * m);
      ctx.fillStyle = radial(x, y, mr * .8, halo, [0, "rgba(170,205,255,.45)", 1, "rgba(120,160,240,0)"]);
      ctx.fillRect(x - halo, y - halo, halo * 2, halo * 2);
      ctx.save(); ctx.translate(x, y); ctx.scale(1, sq);
      wavy(moonSpr, 0, 0, mr, alpha * (1 - m) * fade * .92, amp, t);
      makeLogo();
      if (logoSpr && m > 0) wavy(logoSpr, 0, 0, mr, alpha * m * fade, amp * (1 - smooth((t - 6.5) / .45)), t);
      ctx.restore();
    }
    ctx.restore();
    // the falling drop, catching the light
    if (t > T.drip - .3 && t < T.drip) {
      var dp = (t - (T.drip - .3)) / .3, dy = mix(y - H * .55, y, dp * dp);
      ctx.globalAlpha = alpha * .9; ctx.fillStyle = radial(x, dy, 0, 6, [0, "#ffffff", 1, "rgba(200,220,255,0)"]);
      ctx.fillRect(x - 6, dy - 6, 12, 12);
    }
    ctx.globalAlpha = 1;
  }
  function wobble(t) {
    var a = 1.1;
    if (t > T.drip) a += 5 * Math.exp(-(t - T.drip) * 2.6);
    return a * (1 - smooth((t - 6.55) / .5));
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

  // 5. The stage turns to the welcome panel's navy, keeping a few stars, for the logo and the name.
  function navy(t, alpha) {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "#003b6b"; ctx.fillRect(0, 0, W, H);
    var glow = 1 - smooth((t - T.out) / .5);
    ctx.globalAlpha = alpha * glow;
    ctx.fillStyle = radial(cx, cy, 0, D * .6, [0, "rgba(40,110,185,.55)", 1, "rgba(0,40,80,0)"]); ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
    stars(alpha * .45 * glow, t, H);
  }

  // --- The film -------------------------------------------------------------------------------------------------
  var t = 0, last = 0, raf = 0, over = false;
  function frame(now) {
    raf = 0;
    if (over) return;
    var dt = last ? Math.min((now - last) / 1000, 1 / 20) : 1 / 60;
    last = now; t += dt;
    try { draw(t, dt); cues(t); }
    catch (e) { finish(true); return; }
    if (t < T.end) raf = requestAnimationFrame(frame);
  }
  function draw(t, dt) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1;
    if (t < T.navy + .6) {
      if (t < 2.1) space(t, dt);
      if (t > T.cloudsIn && t < 4.1) cloudSky(t, smooth((t - T.cloudsIn) / .5));
      if (t > T.kaabaIn && t < 5.5) kaaba(t, smooth((t - T.kaabaIn) / .55) * (1 - smooth((t - 5.05) / .4)));
      if (t > T.wellIn + .2) well(t, smooth((t - T.wellIn - .2) / .45));
      if (t > T.cloudsIn && t < 4.1) cloudLayer(t);
    }
    if (t > T.navy) navy(t, smooth((t - T.navy) / .45));
    // the water's logo stays on top of the navy until the real one takes over
    if (t > T.navy && t < T.domLogo + .45) {
      ctx.globalAlpha = 1 - smooth((t - T.domLogo - .25) / .2);
      ctx.fillStyle = radial(cx, cy, 50, 56 * 2.4, [0, "rgba(170,205,255,.35)", 1, "rgba(120,160,240,0)"]);
      ctx.fillRect(cx - 140, cy - 140, 280, 280);
      if (logoSpr) ctx.drawImage(logoSpr, cx - 56, cy - 56, 112, 112);
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
  // shimmer over Makkah, the drop and its ripple, a bell as the logo surfaces, soft ticks for the letters, and a
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
      if (t < 5.4) { tone("sine", 587.33, base, [Math.max(t, 3.2), 0, 4.2, .025, 5.4, 0], .6, 1, 5.5); tone("sine", 880, base, [Math.max(t, 3.2), 0, 4.4, .016, 5.4, 0], .5, 1, 5.5); }
      if (t < 5.4) hiss(base, "bandpass", 1100, 260, Math.max(t, 4.4), 5.4, [Math.max(t, 4.4), 0, 4.85, .16, 5.4, 0], 1, .4, 1);
      ping(base + T.drip, 1900, 620, .16, .22, .6);
      ping(base + T.drip + .05, 340, 170, .32, .12, .5);
      ping(base + T.drip + .42, 2300, 900, .1, .05, .8);
      bell(base + T.morph + .35, 587.33, .16);
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
