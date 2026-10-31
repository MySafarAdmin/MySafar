// The sign-in page's opening, drawn live on a canvas (no video to download). Stars come out one by one on a deep
// night-blue sky as it slowly turns towards us. Then the stars let go: they swirl inward like a galaxy and gather
// into a full moon. The moon cracks and splits into pieces with light pouring from between them, pulls back
// together with a flash and a ring of light, settles to the logo's size, and the Safar design is drawn onto it.
// The logo (a real element from then on) moves aside for "MySafar", then, on a computer, the stage folds into
// the navy welcome panel as the logo lands on the panel's own; on a phone it lifts away. Skip, Escape, or a tap
// anywhere goes straight to the form.
//
// Sound is drawn too (Web Audio): off by default, as browsers expect, until the speaker button is pressed; the
// choice is remembered on this device. The form's fields stay disabled while the opening plays (a fieldset in
// login.html), so browsers, Safari included, can't offer saved passwords over it; when it ends they're enabled and
// the email field takes focus, which is when the saved-password suggestions appear. Under reduced motion there
// is no opening at all (auth.css hides it) and the form is ready at once.
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

  // --- Timeline (seconds) ---------------------------------------------------------------------------------------
  var T = {bloom: .55, sweep: .9, swirl: 2.25, land: 3.55, crack: 3.95, split: 4.15, rejoin: 4.85, joined: 5.27,
           draw: 5.5, domLogo: 6.35, lock: 6.75, out: 8.05, end: 9.2};

  // --- Small helpers --------------------------------------------------------------------------------------------
  function clamp(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
  function mix(a, b, p) { return a + (b - a) * p; }
  function smooth(x) { x = clamp(x); return x * x * (3 - 2 * x); }
  function inOut(x) { x = clamp(x); return x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; }
  function outCubic(x) { x = clamp(x); return 1 - Math.pow(1 - x, 3); }
  function outExpo(x) { x = clamp(x); return x === 1 ? 1 : 1 - Math.pow(2, -10 * x); }
  function seeded(s) { return function () { s |= 0; s = s + 0x6D2B79F5 | 0; var t = Math.imul(s ^ s >>> 15, 1 | s);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function radial(x, y, r0, r1, stops) {
    var g = ctx.createRadialGradient(x, y, r0, x, y, Math.max(r1, r0 + .01));
    for (var i = 0; i < stops.length; i += 2) g.addColorStop(stops[i], stops[i + 1]);
    return g;
  }
  function offscreen(w, h) { var c = document.createElement("canvas"); c.width = w; c.height = h; return c; }

  // --- Canvas size ----------------------------------------------------------------------------------------------
  var W = 0, H = 0, S = 0, D = 0, cx = 0, cy = 0, dpr = 1;
  function resize() {
    W = innerWidth; H = innerHeight; S = Math.min(W, H); D = Math.sqrt(W * W + H * H); cx = W / 2; cy = H / 2;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (W * H * dpr * dpr > 3200000) dpr = Math.max(1, Math.sqrt(3200000 / (W * H)));
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  }
  resize();
  addEventListener("resize", resize);
  var rnd = seeded(7), i;

  // --- The stars ------------------------------------------------------------------------------------------------
  // The sky slowly turns and drifts towards us. Where a point of the sky sits on screen at time t:
  function rot(t) { return t * .022; }
  function zoom(t) { return 1 + t * .045; }
  function toScreen(x, y, t) {
    var r = rot(t), z = zoom(t), c = Math.cos(r), s = Math.sin(r);
    return [cx + (x * c - y * s) * z, cy + (x * s + y * c) * z];
  }
  // Faint stars that stay put behind, and a soft band of the Milky Way.
  var faint = [];
  for (i = 0; i < 260; i++) faint.push({x: (rnd() - .5) * W * 1.3, y: (rnd() - .5) * H * 1.3, r: .4 + rnd() * .7, ph: rnd() * 6.3, a: .1 + rnd() * .9});
  // --- The moon, the logo, and the points of light ---------------------------------------------------------------
  // The light gathers into a full moon. The moon cracks and splits into pieces, which pull back together; the moon
  // settles to the logo's size, turns white, and the Safar design is drawn onto it.
  var logoImg = stage.querySelector(".ilogo img"), R = 56, Rm = Math.min(84, S * .2), SPR = 256, motes = [];
  var MOTES = W < 700 ? 900 : 1500;
  (function () {
    var mr = seeded(19);
    for (var k = 0; k < MOTES; k++) {
      // each mote is a star in the sky to begin with, and ends at a point of the moon's disc
      var ta = mr() * 6.283, tr = Math.sqrt(mr()) * Rm, b = Math.pow(mr(), 2.2);
      motes.push({px: (mr() - .5) * W * 1.15, py: (mr() - .5) * H * 1.15, tx: Math.cos(ta) * tr, ty: Math.sin(ta) * tr,
                  del: mr() * .45, ph: mr() * 6.3, b: .35 + b * .65, big: b > .93, born: .05 + mr() * 1.3, turns: 1.1 + mr() * .9});
    }
  })();
  var moonSpr = offscreen(SPR, SPR);
  (function () {
    var g = moonSpr.getContext("2d"), c = SPR / 2;
    var gr = g.createRadialGradient(c - 34, c - 38, 8, c, c, c);
    gr.addColorStop(0, "#ffffff"); gr.addColorStop(.65, "#eef3fc"); gr.addColorStop(1, "#cdd9ee");
    g.fillStyle = gr; g.beginPath(); g.arc(c, c, c - 1, 0, 6.283); g.fill();
    var cr = seeded(4);
    for (var k = 0; k < 14; k++) {
      var a = cr() * 6.283, d = Math.sqrt(cr()) * c * .78, r = 5 + cr() * 22, x = c + Math.cos(a) * d, y = c + Math.sin(a) * d;
      var cg = g.createRadialGradient(x - r * .25, y - r * .25, 0, x, y, r);
      cg.addColorStop(0, "rgba(150,170,205,.28)"); cg.addColorStop(.8, "rgba(160,180,212,.18)"); cg.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = cg; g.beginPath(); g.arc(x, y, r, 0, 6.283); g.fill();
    }
  })();
  // The pieces: cuts run from a point a little off the middle out to the rim, each with a few jags.
  var shards = [];
  (function () {
    var sr = seeded(29), n = 7, ox = .1, oy = -.07, cuts = [], k, j;
    for (k = 0; k < n; k++) {
      var a = (k + .2 + sr() * .6) / n * 6.283, pts = [[ox, oy]];
      for (j = 1; j <= 3; j++) {
        var f = j / 4, aa = a + (sr() - .5) * .35;
        pts.push([mix(ox, Math.cos(aa), f) + (sr() - .5) * .05, mix(oy, Math.sin(aa), f) + (sr() - .5) * .05]);
      }
      pts.push([Math.cos(a) * 1.02, Math.sin(a) * 1.02]);
      cuts.push({a: a, pts: pts});
    }
    for (k = 0; k < n; k++) {
      var c0 = cuts[k], c1 = cuts[(k + 1) % n], a1 = c1.a < c0.a ? c1.a + 6.283 : c1.a, mid = (c0.a + a1) / 2;
      shards.push({c0: c0.pts, c1: c1.pts, a0: c0.a, a1: a1, dx: Math.cos(mid), dy: Math.sin(mid),
                   spin: (sr() - .5) * .8, far: .55 + sr() * .35});
    }
    shards.cuts = cuts;
  })();
  function shardPath(s) {
    ctx.beginPath();
    var j;
    for (j = 0; j < s.c0.length; j++) ctx.lineTo(s.c0[j][0], s.c0[j][1]);
    ctx.arc(0, 0, 1.02, s.a0, s.a1);
    for (j = s.c1.length - 1; j >= 0; j--) ctx.lineTo(s.c1[j][0], s.c1[j][1]);
    ctx.closePath();
  }
  function logoReady() { return logoImg && logoImg.complete && logoImg.naturalWidth > 0; }
  // Dust in the air, catching the light.
  var dust = [];
  for (i = 0; i < 70; i++) dust.push({x: rnd(), y: rnd(), r: .5 + rnd() * 1.3, v: .004 + rnd() * .012, ph: rnd() * 6.3});
  // Film grain.
  var grain = offscreen(128, 128), gg = grain.getContext("2d"), gd = gg.createImageData(128, 128);
  for (i = 0; i < gd.data.length; i += 4) { var v = rnd() * 255; gd.data[i] = gd.data[i + 1] = gd.data[i + 2] = v; gd.data[i + 3] = 255; }
  gg.putImageData(gd, 0, 0);
  var grainFill = ctx.createPattern(grain, "repeat");

  // --- Drawing --------------------------------------------------------------------------------------------------
  function backdrop(t) {
    // deep night blue, warming to the welcome panel's navy once the logo has landed
    var toNavy = smooth((t - T.joined - .1) / .9);
    ctx.fillStyle = radial(cx, cy, 0, D * .62, [0, "#0a2b57", .55, "#041631", 1, "#010813"]);
    ctx.fillRect(0, 0, W, H);
    if (toNavy > 0) { ctx.globalAlpha = toNavy; ctx.fillStyle = "#003b6b"; ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = toNavy * (1 - smooth((t - T.out) / .5));
      ctx.fillStyle = radial(cx, cy, 0, D * .5, [0, "rgba(40,110,185,.45)", 1, "rgba(0,40,80,0)"]); ctx.fillRect(0, 0, W, H); }
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#cfe0ff";
    for (var k = 0; k < dust.length; k++) {
      var d = dust[k], y = ((d.y - t * d.v) % 1 + 1) % 1;
      ctx.globalAlpha = .18 + .2 * Math.sin(t * 1.5 + d.ph);
      ctx.fillRect(d.x * W + Math.sin(t * .6 + d.ph) * 8, y * H, d.r, d.r);
    }
    ctx.globalAlpha = 1;
  }
  // The sky: stars come out one by one and twinkle; the brightest wear a soft four-point flare. Each of the
  // brighter stars is a mote, which stays a star until its moment to leave for the moon.
  function sky(t) {
    var band = smooth(t / 1.4) * (1 - smooth((t - T.joined) / .6));
    if (band > 0) {
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(-.55 + rot(t)); ctx.scale(1, .22);
      ctx.globalAlpha = band * .5;
      ctx.fillStyle = radial(0, 0, 0, D * .55, [0, "rgba(120,150,220,.22)", .5, "rgba(80,110,190,.08)", 1, "rgba(60,90,170,0)"]);
      ctx.fillRect(-D, -D, D * 2, D * 2); ctx.restore();
    }
    var keep = 1 - smooth((t - T.out + .3) / .5);
    ctx.fillStyle = "#dfe8ff";
    for (var k = 0; k < faint.length; k++) {
      var f = faint[k], p = toScreen(f.x, f.y, t);
      ctx.globalAlpha = keep * f.a * smooth((t - f.ph * .2) / .8) * (.35 + .3 * Math.sin(t * 2 + f.ph));
      ctx.fillRect(p[0], p[1], f.r, f.r);
    }
    ctx.globalCompositeOperation = "lighter";
    for (k = 0; k < motes.length; k++) {
      var m = motes[k];
      if (t >= T.swirl + m.del) continue;
      var q = toScreen(m.px, m.py, t), a = smooth((t - m.born) / .6) * m.b * (.7 + .3 * Math.sin(t * 3 + m.ph * 3));
      if (a <= .01) continue;
      ctx.globalAlpha = a; ctx.fillStyle = "#eef4ff";
      var r = m.big ? 1.9 : .6 + m.b * 1.1;
      ctx.beginPath(); ctx.arc(q[0], q[1], r, 0, 6.283); ctx.fill();
      if (m.big) {
        var L = 9 + 5 * Math.sin(t * 2.5 + m.ph);
        ctx.globalAlpha = a * .45;
        ctx.fillStyle = radial(q[0], q[1], 0, 7, [0, "rgba(200,220,255,.9)", 1, "rgba(200,220,255,0)"]); ctx.fillRect(q[0] - 7, q[1] - 7, 14, 14);
        ctx.fillStyle = "#dbe7ff"; ctx.fillRect(q[0] - L, q[1] - .4, L * 2, .8); ctx.fillRect(q[0] - .4, q[1] - L, .8, L * 2);
      }
    }
    ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
  }
  // The motes: each star leaves its place in the sky, spirals in round the centre, and settles on its place in the
  // moon, leaving a short trail of light.
  function motesAt(m, t) {
    var e = inOut((t - T.swirl - m.del) / (T.land - T.swirl - .45));
    var st = toScreen(m.px, m.py, Math.min(t, T.swirl + m.del)), sx = st[0] - cx, sy = st[1] - cy;
    var r0 = Math.hypot(sx, sy), a0 = Math.atan2(sy, sx), r1 = Math.hypot(m.tx, m.ty), a1 = Math.atan2(m.ty, m.tx);
    var da = a1 - a0; while (da < 0) da += 6.283; da += 6.283 * Math.floor(m.turns);
    var ang = a0 + da * e, rad = mix(r0, r1, Math.pow(e, .8)) * (1 + .12 * Math.sin(e * Math.PI));
    return [cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad, e];
  }
  function drawMotes(t) {
    if (!motes.length || t < T.swirl) return;
    var settle = smooth((t - T.land + .12) / .35);
    ctx.globalCompositeOperation = "lighter";
    for (var k = 0; k < motes.length; k++) {
      var m = motes[k];
      if (t < T.swirl + m.del) continue;
      var p = motesAt(m, t), q = motesAt(m, t - .035), e = p[2];
      var a = m.b * (1 - settle * .9) * (.6 + .4 * Math.sin(t * 13 + m.ph * 2));
      if (a <= .01) continue;
      ctx.globalAlpha = a;
      ctx.strokeStyle = e < .5 ? "#e4ecff" : "#ffffff";
      ctx.lineWidth = mix(1.6, 1.3, e);
      ctx.beginPath(); ctx.moveTo(q[0], q[1]); ctx.lineTo(p[0] + .1, p[1]); ctx.stroke();
    }
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
  }
  // The moon: formed by the motes, it cracks (lines of light run out from near its middle), splits into pieces
  // that drift apart with light pouring from between them, then pulls back together with a flash and a ring of
  // light. It settles to the logo's size and whitens, and the Safar design is drawn onto it in one sweep, a point
  // of gold light leading the way.
  function moonAndLogo(t) {
    var f = smooth((t - T.land + .25) / .4), gone = 1 - smooth((t - T.domLogo - .15) / .2);
    if (f <= 0 || gone <= 0) return;
    var up = outCubic((t - T.split) / .5), down = inOut((t - T.rejoin) / .42), sp = up * (1 - down);
    var shrink = inOut((t - T.joined) / .4), rad = mix(Rm, R, shrink);
    var snap = t > T.joined ? 1 + .05 * Math.exp(-(t - T.joined) * 9) * Math.sin((t - T.joined) * 40) : 1;
    rad *= snap;
    var white = smooth((t - T.joined - .05) / .35);
    // glow behind
    ctx.globalAlpha = f * gone * (.8 + sp * .6);
    ctx.fillStyle = radial(cx, cy, rad * .6, rad * (3 + sp * 2), [0, "rgba(170,205,255,.42)", 1, "rgba(120,160,240,0)"]);
    ctx.fillRect(cx - rad * 5, cy - rad * 5, rad * 10, rad * 10);
    if (sp > .001) {
      // the light inside, showing between the pieces
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = f * gone * sp;
      ctx.fillStyle = radial(cx, cy, 0, rad * 1.3, [0, "rgba(255,240,205,1)", .4, "rgba(255,214,140,.6)", 1, "rgba(255,200,120,0)"]);
      ctx.fillRect(cx - rad * 1.3, cy - rad * 1.3, rad * 2.6, rad * 2.6);
      ctx.globalCompositeOperation = "source-over";
    }
    ctx.globalAlpha = f * gone;
    for (var k = 0; k < shards.length; k++) {
      var s = shards[k], d = sp * s.far * rad;
      ctx.save();
      ctx.translate(cx + s.dx * d, cy + s.dy * d); ctx.rotate(s.spin * sp); ctx.scale(rad, rad);
      shardPath(s); ctx.clip();
      ctx.drawImage(moonSpr, -1, -1, 2, 2);
      if (white > 0) { ctx.globalAlpha = f * gone * white; ctx.fillStyle = "#fff"; ctx.fillRect(-1.1, -1.1, 2.2, 2.2); ctx.globalAlpha = f * gone; }
      if (sp > .01) {   // the broken edges catch the light
        ctx.strokeStyle = "rgba(255,226,170," + Math.min(1, sp * 2).toFixed(3) + ")"; ctx.lineWidth = 2.2 / rad;
        shardPath(s); ctx.stroke();
      }
      ctx.restore();
    }
    // the cracks running out before it splits
    var cr = clamp((t - T.crack) / (T.split - T.crack + .05)), crf = 1 - smooth((t - T.split) / .2);
    if (cr > 0 && crf > 0) {
      ctx.save(); ctx.translate(cx, cy); ctx.scale(rad, rad);
      ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = f * crf;
      ctx.strokeStyle = "#ffe6b0"; ctx.lineWidth = 2 / rad; ctx.lineJoin = "round";
      shards.cuts.forEach(function (c) {
        var n = c.pts.length - 1, upto = cr * n;
        ctx.beginPath(); ctx.moveTo(c.pts[0][0], c.pts[0][1]);
        for (var j = 1; j <= n; j++) {
          var q = clamp(upto - (j - 1));
          if (q <= 0) break;
          ctx.lineTo(mix(c.pts[j - 1][0], c.pts[j][0], q), mix(c.pts[j - 1][1], c.pts[j][1], q));
        }
        ctx.stroke();
      });
      ctx.restore(); ctx.globalCompositeOperation = "source-over";
    }
    // the Safar design, drawn on in a sweep with a point of gold light leading
    var dr = inOut((t - T.draw) / .75);
    if (dr > 0 && logoReady()) {
      var a0 = -Math.PI / 2, a1 = a0 + dr * 6.2832, ri = 97 / 112 * rad;
      ctx.save(); ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, rad + 2, a0, a1); ctx.closePath(); ctx.clip();
      ctx.beginPath(); ctx.arc(cx, cy, ri, 0, 6.283); ctx.clip();
      ctx.drawImage(logoImg, cx - ri, cy - ri, ri * 2, ri * 2);
      ctx.restore();
      if (dr < 1) {
        var px = cx + Math.cos(a1) * rad * .78, py = cy + Math.sin(a1) * rad * .78;
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = f * Math.sin(dr * Math.PI);
        ctx.fillStyle = radial(px, py, 0, 18, [0, "rgba(255,236,190,1)", .3, "rgba(255,205,120,.55)", 1, "rgba(255,190,100,0)"]);
        ctx.fillRect(px - 18, py - 18, 36, 36);
        ctx.strokeStyle = "rgba(255,226,170,.6)"; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(cx + Math.cos(a1) * ri * .1, cy + Math.sin(a1) * ri * .1); ctx.lineTo(cx + Math.cos(a1) * ri, cy + Math.sin(a1) * ri); ctx.stroke();
        ctx.globalCompositeOperation = "source-over";
      }
    }
    ctx.globalAlpha = 1;
    // the flash and ring of light as the pieces meet
    var w = t - T.joined;
    if (w > 0 && w < 1.2) {
      var rr = rad + outExpo(w / 1.2) * D * .55;
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = .55 * (1 - w / 1.2);
      ctx.strokeStyle = "#cfe2ff"; ctx.lineWidth = 2 + 10 * (1 - w / 1.2);
      ctx.beginPath(); ctx.arc(cx, cy, rr, 0, 6.283); ctx.stroke();
      ctx.globalAlpha = .4 * Math.exp(-w * 6);
      ctx.fillStyle = radial(cx, cy, 0, D * .5, [0, "rgba(200,225,255,.8)", 1, "rgba(200,225,255,0)"]); ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
    }
  }

  // --- The film -------------------------------------------------------------------------------------------------
  var t = 0, last = 0, raf = 0, over = false;
  function frame(now) {
    raf = 0;
    if (over) return;
    var dt = last ? Math.min((now - last) / 1000, 1 / 20) : 1 / 60;
    last = now; t += dt;
    try { draw(t); cues(t); }
    catch (e) { finish(true); return; }
    if (t < T.end) raf = requestAnimationFrame(frame);
  }
  function draw(t) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1;
    backdrop(t);
    sky(t);
    drawMotes(t);
    moonAndLogo(t);
    var vig = 1 - smooth((t - T.joined) / .8);
    if (vig > 0) {
      ctx.globalAlpha = vig;
      ctx.fillStyle = radial(cx, cy, S * .3, D * .6, [0, "rgba(0,0,0,0)", 1, "rgba(0,3,12,.55)"]); ctx.fillRect(0, 0, W, H);
    }
    ctx.globalAlpha = .045; ctx.fillStyle = grainFill;
    ctx.save(); ctx.translate((t * 977) % 128, (t * 613) % 128); ctx.fillRect(-128, -128, W + 256, H + 256); ctx.restore();
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
  // All synthesised, at a gentle level: a low pad throughout, a rising harp as the stars come out, a rush of air and scattered high
  // notes as the light swirls in, a low bloom and a bell as the logo lands, soft ticks for the letters, and a last
  // breath of air with a chord as the page arrives.
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
        tone("sine", 73.42, base, [Math.max(t, 0), 0, 1.2, .1, T.land, .14, T.land + .1, .2, T.out + .5, .12, E, 0], 1, .25, E);
        tone("sine", 110, base, [Math.max(t, 0), 0, 1.6, .07, T.land + .1, .13, T.out + .5, .08, E, 0], 1, .35, E);
        var o = tone("triangle", 220.5, base, [Math.max(t, 0), 0, 2, .025, T.land + .1, .04, E, 0], .6, .6, E); o.detune.value = 7;
      }
      // the stars coming out: a rising harp of D major pentatonic notes
      var notes = [293.66, 329.63, 369.99, 440, 493.88, 587.33, 659.25, 739.99, 880, 987.77, 1174.66];
      for (var k = 0; k < 22; k++) {
        var at = .2 + k * .075 + (k > 6 ? (k - 6) * .01 : 0), f = notes[Math.min(notes.length - 1, Math.floor(k / 2))];
        ping(base + at, f, f, 1.6, .05 * (1 - k / 30), .85, k % 3 ? "sine" : "triangle");
      }
      // the light letting go and swirling in
      if (t < T.land) hiss(base, "bandpass", 300, 4200, Math.max(t, T.swirl - .2), T.land, [Math.max(t, T.swirl - .2), 0, T.land - .15, .22, T.land, 0], 1, .45, 2.2);
      var gr = seeded(77);
      for (k = 0; k < 18; k++) { var at2 = T.swirl + gr() * (T.land - T.swirl), f2 = notes[5 + Math.floor(gr() * 6)]; ping(base + at2, f2 * 2, f2 * 2, .4, .012 + gr() * .012, .9); }
      // the moon forms; it cracks and splits; it rejoins with a low bloom and a bell; the design is drawn on
      bell(base + T.land, 880, .07);
      [0, .06, .11, .19].forEach(function (d, j) { ping(base + T.crack + d, 3200 - j * 300, 1400, .07, .05, .5, "triangle"); });
      hiss(base, "highpass", 1800, 600, T.split - .02, T.split + .5, [T.split - .02, 0, T.split + .02, .3, T.split + .5, 0], 1, .6, .7);
      ping(base + T.split, 90, 50, .8, .25, .4);
      if (t < T.joined) hiss(base, "bandpass", 500, 2600, Math.max(t, T.rejoin), T.joined, [Math.max(t, T.rejoin), 0, T.joined - .05, .18, T.joined, 0], 1, .4, 2);
      ping(base + T.joined, 110, 46, 1.4, .3, .4);
      bell(base + T.joined, 587.33, .17);
      if (t < T.draw + .8) tone("sine", 1174.66, base, [Math.max(t, T.draw), 0, T.draw + .3, .02, T.draw + .8, 0], .5, 1, T.draw + .9);
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
        master.gain.linearRampToValueAtTime(.27, ac.currentTime + .4);   // 30% of the first mix, which was too loud
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

  raf = requestAnimationFrame(frame);
})();
