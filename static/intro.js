// The sign-in page's opening, drawn live on a canvas (no video to download). Stars come out one by one on a deep
// night-blue sky as it slowly turns towards us. Then the stars let go: they swirl inward like a galaxy and gather
// into a full moon. A straight line cuts the moon in two; one half rises and the other sinks, then they click back
// together with a flash and a ring of light, the moon settles to the logo's size, and the Safar design is drawn on.
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
  var T = {bloom: .55, sweep: .9, swirl: 2.25, land: 3.55, crack: 3.9, split: 4.2, rejoin: 4.9, joined: 5.4,
           draw: 5.95, domLogo: 6.7, lock: 7.1, out: 8.4, end: 9.55};

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
    // A real-looking full moon: pale grey-cream, darker toward the rim, with the grey "seas" (maria) and craters
    // whose rims catch the light from the upper left.
    var g = moonSpr.getContext("2d"), c = SPR / 2, cr = seeded(4), k;
    g.save(); g.beginPath(); g.arc(c, c, c - 1, 0, 6.283); g.clip();
    var gr = g.createRadialGradient(c - 30, c - 34, 6, c, c, c);
    gr.addColorStop(0, "#f6f3ea"); gr.addColorStop(.55, "#e6e4dd"); gr.addColorStop(.88, "#c9cbd1"); gr.addColorStop(1, "#a9aebb");
    g.fillStyle = gr; g.fillRect(0, 0, SPR, SPR);
    function blob(x, y, r, a) {
      var bg = g.createRadialGradient(x, y, 0, x, y, r);
      bg.addColorStop(0, "rgba(112,118,134," + a + ")"); bg.addColorStop(.6, "rgba(118,124,140," + (a * .7) + ")"); bg.addColorStop(1, "rgba(130,136,150,0)");
      g.fillStyle = bg; g.beginPath(); g.arc(x, y, r, 0, 6.283); g.fill();
    }
    // the seas, roughly where they sit on the real moon's face
    [[.36, .30, .20, .5], [.50, .26, .14, .45], [.30, .50, .18, .42], [.62, .38, .16, .5], [.70, .54, .11, .45], [.44, .44, .12, .35],
     [.58, .62, .10, .38], [.24, .66, .12, .3], [.40, .62, .09, .3], [.76, .40, .08, .4]].forEach(function (m) {
      blob(m[0] * SPR, m[1] * SPR, m[2] * SPR, m[3]);
      for (var j = 0; j < 3; j++) blob(m[0] * SPR + (cr() - .5) * m[2] * SPR, m[1] * SPR + (cr() - .5) * m[2] * SPR, m[2] * SPR * (.4 + cr() * .4), m[3] * .5);
    });
    // craters: a shaded floor, a dark inner edge toward the light and a bright rim away from it
    for (k = 0; k < 34; k++) {
      var a = cr() * 6.283, d = Math.sqrt(cr()) * c * .86, r = 2 + Math.pow(cr(), 2.5) * 13, x = c + Math.cos(a) * d, y = c + Math.sin(a) * d;
      g.fillStyle = "rgba(120,124,138,.22)"; g.beginPath(); g.arc(x, y, r, 0, 6.283); g.fill();
      g.lineWidth = Math.max(1, r * .22);
      g.strokeStyle = "rgba(95,100,116,.35)"; g.beginPath(); g.arc(x, y, r * .85, Math.PI * .9, Math.PI * 1.75); g.stroke();
      g.strokeStyle = "rgba(255,253,245,.55)"; g.beginPath(); g.arc(x, y, r, -.2, Math.PI * .75); g.stroke();
    }
    // one bright young crater low on the face, with faint rays
    var tx = c * .92, ty = c * 1.62;
    g.strokeStyle = "rgba(255,255,250,.16)"; g.lineWidth = 1.4;
    for (k = 0; k < 9; k++) { var ra = cr() * 6.283, rl = 25 + cr() * 60; g.beginPath(); g.moveTo(tx, ty); g.lineTo(tx + Math.cos(ra) * rl, ty + Math.sin(ra) * rl); g.stroke(); }
    g.fillStyle = "rgba(255,255,250,.85)"; g.beginPath(); g.arc(tx, ty, 4, 0, 6.283); g.fill();
    // the rim falls into shadow on the side away from the light
    var sh = g.createRadialGradient(c - 40, c - 44, c * .7, c, c, c * 1.02);
    sh.addColorStop(0, "rgba(40,55,90,0)"); sh.addColorStop(.8, "rgba(40,55,90,.08)"); sh.addColorStop(1, "rgba(30,45,80,.32)");
    g.fillStyle = sh; g.fillRect(0, 0, SPR, SPR);
    g.restore();
  })();
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
  // The moon: formed by the motes, a straight line of light cuts it top to bottom and it splits in two: the left
  // half rises and the right half sinks, turning a little as if held. Then, as if taken in hand, they swing back
  // along a curve into an exact join with a click; the joined moon sways on a few damped swings to rest, settles
  // to the logo's size and whitens,
  // and the Safar design is drawn onto it in one sweep, a point of gold light leading the way.
  function moonAndLogo(t) {
    var f = smooth((t - T.land + .25) / .4), gone = 1 - smooth((t - T.domLogo - .15) / .2);
    if (f <= 0 || gone <= 0) return;
    // Apart: the halves ease away and hang there, turning a touch, as if held. Back together: a small pull back
    // (the hand taking hold), then they swing in along a curve, speeding up, into an exact join.
    var up = outCubic((t - T.split) / .55), bx = clamp((t - T.rejoin) / (T.joined - T.rejoin));
    var back = 2.6 * bx * bx * bx - 1.6 * bx * bx;   // ease-in with a little wind-up
    var sp = up * (1 - back) * (1 + .03 * Math.sin((t - T.split) * 3.2) * (1 - bx));
    if (t >= T.joined) sp = 0;
    var s0 = t - T.joined;
    // After the click the joined moon swings on, like something just let go of: a few damped swings to rest.
    var swing = s0 > 0 ? .085 * Math.exp(-s0 * 3.4) * Math.sin(s0 * 11) : 0;
    var shrink = inOut((s0 - .35) / .45), rad = mix(Rm, R, shrink);
    var snap = s0 > 0 ? 1 + .025 * Math.exp(-s0 * 12) * Math.sin(s0 * 50) : 1;
    var white = smooth((s0 - .35) / .35);
    // a thin halo, just enough to light the sky round it
    ctx.globalAlpha = f * gone * (.75 + Math.min(sp, 1) * .25);
    ctx.fillStyle = radial(cx, cy, rad * .95, rad * (1.9 + sp * .6), [0, "rgba(190,210,245,.2)", .4, "rgba(170,195,240,.07)", 1, "rgba(140,170,230,0)"]);
    ctx.fillRect(cx - rad * 3, cy - rad * 3, rad * 6, rad * 6);
    // the swing hangs from a point above the moon, so the moon sways sideways as it turns
    var Lp = rad * 3;
    ctx.save();
    ctx.translate(cx + Math.sin(swing) * Lp, cy - Lp + Math.cos(swing) * Lp); ctx.rotate(swing); ctx.translate(-cx, -cy);
    var gap = rad * (.04 * sp + .2 * Math.sin(clamp(sp) * Math.PI)), slide = sp * rad * .95, tilt = .16 * sp;
    if (sp > .001) {
      // a soft light in the cut
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = f * gone * Math.min(1, sp) * .4;
      ctx.save(); ctx.translate(cx, cy); ctx.scale(Math.max(.12, gap / rad + .08), 1);
      ctx.fillStyle = radial(0, 0, 0, rad * 1.5, [0, "rgba(255,246,225,.9)", .4, "rgba(255,225,170,.3)", 1, "rgba(255,210,140,0)"]);
      ctx.fillRect(-rad * 1.5, -rad * 1.5, rad * 3, rad * 3); ctx.restore();
      ctx.globalCompositeOperation = "source-over";
    }
    ctx.globalAlpha = f * gone;
    for (var k = 0; k < 2; k++) {
      var side = k ? 1 : -1;   // left half rises, right half sinks
      ctx.save();
      ctx.translate(cx + side * gap, cy + side * slide); ctx.rotate(-side * tilt); ctx.scale(rad * snap, rad * snap);
      ctx.beginPath(); ctx.rect(k ? 0 : -1.1, -1.1, 1.1, 2.2); ctx.clip();
      ctx.drawImage(moonSpr, -1, -1, 2, 2);
      if (white > 0) { ctx.globalAlpha = f * gone * white; ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(0, 0, 1, 0, 6.283); ctx.fill(); ctx.globalAlpha = f * gone; }
      if (sp > .01) {   // the cut face catches the light
        ctx.strokeStyle = "rgba(255,236,200," + Math.min(.7, sp * 1.5).toFixed(3) + ")"; ctx.lineWidth = 1.6 / rad;
        ctx.beginPath(); ctx.moveTo(0, -1); ctx.lineTo(0, 1); ctx.stroke();
      }
      ctx.restore();
    }
    // the straight cut drawing itself from top to bottom before it splits
    var cr = clamp((t - T.crack) / (T.split - T.crack)), crf = 1 - smooth((t - T.split - .05) / .2);
    if (cr > 0 && crf > 0) {
      ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = f * crf;
      var y0 = cy - rad * 1.08, y1 = mix(y0, cy + rad * 1.08, inOut(cr));
      ctx.strokeStyle = "#fff0cc"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(cx, y0); ctx.lineTo(cx, y1); ctx.stroke();
      ctx.fillStyle = radial(cx, y1, 0, 14, [0, "rgba(255,240,200,1)", 1, "rgba(255,220,150,0)"]); ctx.fillRect(cx - 14, y1 - 14, 28, 28);
      ctx.globalCompositeOperation = "source-over";
    }
    rad *= snap;
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
    ctx.restore();
    // the flash and ring of light as the pieces meet
    var w = t - T.joined;
    if (w > 0 && w < 1.2) {
      var rr = rad + outExpo(w / 1.2) * D * .55;
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = .35 * (1 - w / 1.2);
      ctx.strokeStyle = "#cfe2ff"; ctx.lineWidth = 1.5 + 6 * (1 - w / 1.2);
      ctx.beginPath(); ctx.arc(cx, cy, rr, 0, 6.283); ctx.stroke();
      ctx.globalAlpha = .18 * Math.exp(-w * 6);
      ctx.fillStyle = radial(cx, cy, 0, D * .4, [0, "rgba(200,225,255,.8)", 1, "rgba(200,225,255,0)"]); ctx.fillRect(0, 0, W, H);
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
      body.classList.add("landed");
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
      body.classList.add("landed");   // the welcome panel's quote and art come in as the stage clears from over them
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
  // All synthesised, at a gentle level, and scored like a film rather than a computer: string-like swells, air,
  // deep hits and a hall reverb, with no beeps (see score() for the cue list).
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
      // a large, dark hall: a long smooth tail with the top rolled off
      var len = ac.sampleRate * 3.6, ir = ac.createBuffer(2, len, ac.sampleRate);
      for (var ch = 0; ch < 2; ch++) { var d = ir.getChannelData(ch); for (var j = 0; j < len; j++) d[j] = (Math.random() * 2 - 1) * Math.pow(1 - j / len, 2.6) * Math.min(1, j / (ac.sampleRate * .02)); }
      verb.buffer = ir;
      var dark = ac.createBiquadFilter(); dark.type = "lowpass"; dark.frequency.value = 3800;
      var wet = ac.createGain(); wet.gain.value = .55; verb.connect(dark); dark.connect(wet); wet.connect(master);
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
    // A soft swell: a few detuned saws through a slowly opening low-pass filter, like a string section.
    function pad(base, freqs, t0, t1, peak, cut0, cut1, wet) {
      var now = ac.currentTime, a0 = Math.max(now, base + t0);
      if (base + t1 <= now) return;
      var f = ac.createBiquadFilter(); f.type = "lowpass"; f.Q.value = .5;
      f.frequency.setValueAtTime(cut0, a0); f.frequency.linearRampToValueAtTime(cut1, Math.max(a0 + .1, base + (t0 + t1) / 2));
      f.frequency.linearRampToValueAtTime(cut0, base + t1);
      var g = out(f, .8, wet);
      g.gain.setValueAtTime(0, a0); g.gain.linearRampToValueAtTime(peak, Math.max(a0 + .05, base + mix(t0, t1, .45)));
      g.gain.linearRampToValueAtTime(0, base + t1);
      freqs.forEach(function (fr) {
        [-6, 5].forEach(function (cents) {
          var o = ac.createOscillator(); o.type = "sawtooth"; o.frequency.value = fr; o.detune.value = cents;
          var lv = ac.createGain(); lv.gain.value = 1 / freqs.length; o.connect(lv); lv.connect(f);
          o.start(a0); o.stop(base + t1 + .1);
        });
      });
    }
    // A low hit: a sine falling in pitch with a long decay, felt more than heard.
    function boom(at, f0, f1, len, level, wet) {
      if (at < ac.currentTime) return;
      var o = ac.createOscillator(); o.type = "sine";
      o.frequency.setValueAtTime(f0, at); o.frequency.exponentialRampToValueAtTime(f1, at + len * .6);
      var g = out(o, 1, wet);
      g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(level, at + .012); g.gain.exponentialRampToValueAtTime(.0001, at + len);
      o.start(at); o.stop(at + len + .05);
    }
    // A short burst of filtered noise: the body of a knock, a click, a breath of air.
    function burst(at, type, f, q, len, level, wet) {
      if (at < ac.currentTime) return;
      var s = ac.createBufferSource(); s.buffer = noise;
      var fl = ac.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
      s.connect(fl); var g = out(fl, 1, wet);
      g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(level, at + .003); g.gain.exponentialRampToValueAtTime(.0001, at + len);
      s.start(at, Math.random()); s.stop(at + len + .05);
    }
    // A whoosh: noise swept through a band-pass, swelling up to its peak and falling away.
    function whoosh(base, t0, peakAt, t1, f0, fp, f1, level, wet) {
      var now = ac.currentTime;
      if (base + t1 <= now) return;
      var s = ac.createBufferSource(); s.buffer = noise; s.loop = true;
      var fl = ac.createBiquadFilter(); fl.type = "bandpass"; fl.Q.value = .9;
      var a0 = Math.max(now, base + t0);
      fl.frequency.setValueAtTime(f0, a0); fl.frequency.exponentialRampToValueAtTime(fp, Math.max(a0 + .02, base + peakAt));
      fl.frequency.exponentialRampToValueAtTime(f1, base + t1);
      s.connect(fl); var g = out(fl, 1, wet);
      g.gain.setValueAtTime(.0001, a0);   // an exponential ramp can't start from zero
      if (base + peakAt > a0) g.gain.exponentialRampToValueAtTime(level, base + peakAt); else g.gain.setValueAtTime(level * .5, a0);
      g.gain.exponentialRampToValueAtTime(.0001, base + t1);
      s.start(a0); s.stop(base + t1 + .1);
    }
    // The score, in D: a slow string swell under the stars, an air swell as they swirl in, a deep bloom as the moon
    // forms, a held breath while it is apart, a rush as it is pulled back, a weighty knock when it joins with the
    // chord opening up over it, a brush of air as the design is drawn, and the chord resolving as the page arrives.
    function score() {
      var base = ac.currentTime - t;
      // under everything, a low D that you feel more than hear
      tone("sine", 36.71, base, [Math.max(t, 0), 0, 2, .16, T.joined, .2, T.out + .6, .12, T.end + 1.5, 0], 1, .1, T.end + 1.6);
      // the night: a dark string chord rising slowly as the stars come out
      pad(base, [73.42, 110, 146.83, 220], Math.max(0, t), T.land + .4, .09, 260, 900, .5);
      // a wind of fine air across the sky
      hiss(base, "bandpass", 500, 1400, Math.max(t, 0), T.swirl + .5, [Math.max(t, 0), 0, 1.5, .03, T.swirl - .3, .035, T.swirl + .5, 0], 1, .6, .6);
      // the stars let go: air rising and gathering pace into the moon
      whoosh(base, T.swirl - .3, T.land - .05, T.land + .5, 220, 2600, 500, .2, .55);
      // the moon forms: a deep bloom, and the chord opens a little
      boom(base + T.land, 70, 38, 3.2, .45, .45);
      burst(base + T.land, "lowpass", 400, .7, .9, .12, .7);
      pad(base, [73.42, 110, 146.83, 185, 293.66], T.land - .2, T.split + .2, .07, 300, 1100, .55);
      // the cut drawn down the moon: a thin bright string held under tension
      pad(base, [587.33, 880], T.crack - .1, T.split + .25, .022, 1500, 3200, .8);
      // the split: a heavy whoosh apart and a low hit
      whoosh(base, T.split - .15, T.split + .05, T.split + .9, 300, 1100, 160, .22, .45);
      boom(base + T.split, 62, 40, 1.4, .35, .35);
      burst(base + T.split, "bandpass", 900, 1.2, .25, .1, .5);
      // held apart: a low, uneasy note while they hang there
      pad(base, [73.42, 77.78, 146.83], T.split, T.rejoin + .15, .06, 220, 520, .5);
      // pulled back: air drawn in, faster and faster, cut dead at the join
      whoosh(base, T.rejoin - .1, T.joined - .01, T.joined + .03, 180, 2200, 2000, .26, .3);
      // the join: a firm knock with weight, a clean click on top, a deep boom, and a long hall tail
      var J = base + T.joined;
      burst(J, "bandpass", 3200, 2.5, .05, .35, .35);   // the click of the edges meeting
      burst(J, "lowpass", 900, .8, .18, .35, .4);       // the knock's body
      boom(J, 150, 70, .35, .4, .3);
      boom(J, 58, 32, 3.4, .55, .5);
      // as it swings on: two soft knocks of the sway, much quieter
      boom(J + .29, 110, 70, .25, .08, .4);
      boom(J + .57, 110, 70, .25, .04, .4);
      // and the chord opens up over it, D major, full and warm
      pad(base, [73.42, 146.83, 220, 293.66, 369.99, 440], T.joined, T.out + 1.6, .11, 400, 1900, .6);
      // the design drawn on: a brush of bright air following the pen round
      whoosh(base, T.draw - .05, T.draw + .4, T.draw + .85, 1800, 5200, 3000, .05, .7);
      // the name: a soft lift of air as the letters arrive
      whoosh(base, T.lock, T.lock + .45, T.lock + 1.3, 600, 2400, 1200, .06, .7);
      // the hand-over: a long descending breath, and a low warm hit as the page lands
      whoosh(base, T.out - .25, T.out + .2, T.out + 1.5, 2400, 1200, 240, .12, .55);
      boom(base + T.out + .95, 55, 38, 2.4, .25, .5);
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
