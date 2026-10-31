// The sign-in page's opening, drawn live on a canvas (no video to download). Stars come out one by one on a deep
// night-blue sky as it slowly turns towards us. Then the stars let go: they gather into a turning galaxy of
// light with spiral arms, which draws in and falls together into a full moon. A straight line cuts the moon in two; the halves drift apart sideways, then they click back
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
  body.classList.add("filming", "wait");   // "wait" keeps the welcome panel's quote and art hidden until they come in

  // --- Timeline (seconds) ---------------------------------------------------------------------------------------
  var T = {bloom: .55, sweep: .9, swirl: 2.25, land: 3.55, crack: 3.9, split: 4.2, rejoin: 5.18, joined: 5.4,
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
    gr.addColorStop(0, "#fffdf6"); gr.addColorStop(.55, "#f3f1ea"); gr.addColorStop(.88, "#dfe2ea"); gr.addColorStop(1, "#c4cbdb");
    g.fillStyle = gr; g.fillRect(0, 0, SPR, SPR);
    function blob(x, y, r, a) {
      var bg = g.createRadialGradient(x, y, 0, x, y, r);
      bg.addColorStop(0, "rgba(118,124,140," + (a * .8) + ")"); bg.addColorStop(.6, "rgba(124,130,146," + (a * .55) + ")"); bg.addColorStop(1, "rgba(130,136,150,0)");
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
    sh.addColorStop(0, "rgba(40,55,90,0)"); sh.addColorStop(.85, "rgba(40,55,90,.04)"); sh.addColorStop(1, "rgba(30,45,80,.18)");
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
  // The motes: each star leaves its place in the sky and, as a point of light, spirals in round the centre and
  // settles on its place in the moon.
  // The stars gather into a turning galaxy of light with three spiral arms, which spins faster as it draws in,
  // then falls together into the disc of the moon, each point landing on its own place.
  var ARMS = 3, TWIST = 2.6;
  function frac(x) { return x - Math.floor(x); }
  function turnTo(a, b, w) { var d = b - a; d -= 6.2832 * Math.round(d / 6.2832); return a + d * w; }
  function motesAt(m, t) {
    var e = clamp((t - T.swirl - m.del) / (T.land - T.swirl - m.del - .1));
    var st = toScreen(m.px, m.py, Math.min(t, T.swirl + m.del)), sx = st[0] - cx, sy = st[1] - cy;
    var r0 = Math.hypot(sx, sy), a0 = Math.atan2(sy, sx), r1 = Math.hypot(m.tx, m.ty), a1 = Math.atan2(m.ty, m.tx);
    var u = Math.pow(frac(m.ph * 7.13), 1.4), gR = Rm * (.55 + 3.4 * u) * (S < 600 ? .75 : 1);
    var e1 = smooth(e / .5), e2 = Math.pow(smooth((e - .55) / .45), 1.4);
    var rad = e > .55 ? mix(gR, r1, e2) : mix(r0, gR, e1);
    var s0 = t - T.swirl, spin = s0 * 1.1 + s0 * s0 * .55;   // the galaxy turns, faster and faster
    var arm = Math.floor(frac(m.ph * 1.91) * ARMS) * 6.2832 / ARMS + (frac(m.ph * 3.7) - .5) * (.5 + .6 * u);
    var gA = arm - TWIST * Math.log(1 + rad / Rm) + spin;
    var ang = turnTo(a0 + s0 * .4, gA, e1);
    ang = turnTo(ang, a1 + spin * .15 * (1 - e2), e2);
    return [cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad * mix(.9, 1, e2), e, rad];   // seen a little from above
  }
  // a soft round point of light, drawn once and stamped for every mote
  var dotSpr = offscreen(32, 32);
  (function () {
    var g = dotSpr.getContext("2d"), gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(.12, "rgba(255,255,255,.95)"); gr.addColorStop(.3, "rgba(200,220,255,.35)");
    gr.addColorStop(.6, "rgba(160,190,255,.08)"); gr.addColorStop(1, "rgba(160,190,255,0)");
    g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
  })();
  function drawMotes(t) {
    if (!motes.length || t < T.swirl) return;
    var settle = smooth((t - T.land + .12) / .35);
    ctx.globalCompositeOperation = "lighter";
    // the heart of the swirl brightens as the light gathers, then gives way to the moon
    var core = smooth((t - T.swirl - .3) / 1) * (1 - smooth((t - T.land + .2) / .4));
    if (core > 0) {
      ctx.globalAlpha = core * .5;
      ctx.fillStyle = radial(cx, cy, 0, Rm * 2.6, [0, "rgba(220,232,255,.6)", .3, "rgba(170,195,255,.22)", 1, "rgba(120,150,240,0)"]);
      ctx.fillRect(cx - Rm * 2.6, cy - Rm * 2.6, Rm * 5.2, Rm * 5.2);
    }
    for (var k = 0; k < motes.length; k++) {
      var m = motes[k];
      if (t < T.swirl + m.del) continue;
      var p = motesAt(m, t), e = p[2];
      // nearer the centre the points burn brighter; each twinkles a little
      var heat = 1 - clamp(p[3] / (Rm * 4));
      var a = m.b * (1 - settle * .9) * (.75 + .25 * Math.sin(t * 9 + m.ph * 2)) * (.7 + .5 * heat);
      if (a <= .01) continue;
      var r = (m.big ? 3.4 : 1.6 + m.b * 2) * mix(1, .7, e) * (.85 + .3 * heat);
      ctx.globalAlpha = Math.min(1, a);
      ctx.drawImage(dotSpr, p[0] - r * 2, p[1] - r * 2, r * 4, r * 4);
    }
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
  }
  // The moon: formed by the motes, a straight line of light cuts it top to bottom and it splits in two: the left
  // half drifts left and the right half drifts right, each turning slowly outward. Then, as if taken in hand, they swing back
  // along a curve into an exact join with a click; the joined moon sways on a few damped swings to rest, settles
  // to the logo's size and whitens,
  // and the Safar design is drawn onto it in one sweep, a point of gold light leading the way.
  function moonAndLogo(t) {
    var f = smooth((t - T.land + .25) / .4), gone = 1 - smooth((t - T.domLogo - .15) / .2);
    if (f <= 0 || gone <= 0) return;
    // Apart: the halves drift slowly out to the sides, turning a touch. Back together: a quick swing in along a
    // curve, speeding up, into an exact join.
    // They float apart slowly (.85s) and come back together much faster (.22s), speeding up into the click.
    var up = outCubic((t - T.split) / .85), bx = clamp((t - T.rejoin) / (T.joined - T.rejoin));
    var back = Math.pow(bx, 2.2);
    var sp = up * (1 - back) * (1 + .03 * Math.sin((t - T.split) * 3.2) * (1 - bx));
    if (t >= T.joined) sp = 0;
    var s0 = t - T.joined;
    // After the click the joined moon swings on, like something just let go of: a few damped swings to rest.
    var swing = s0 > 0 ? .085 * Math.exp(-s0 * 3.4) * Math.sin(s0 * 11) : 0;
    var shrink = inOut((s0 - .35) / .45), rad = mix(Rm, R, shrink);
    var snap = s0 > 0 ? 1 + .025 * Math.exp(-s0 * 12) * Math.sin(s0 * 50) : 1;
    var white = smooth((s0 - .35) / .35);
    // a thin halo, just enough to light the sky round it
    ctx.globalAlpha = f * gone;
    ctx.fillStyle = radial(cx, cy, rad * .9, rad * 2.6, [0, "rgba(215,228,255,.5)", .18, "rgba(190,210,250,.22)", .5, "rgba(160,190,240,.07)", 1, "rgba(140,170,230,0)"]);
    ctx.fillRect(cx - rad * 3, cy - rad * 3, rad * 6, rad * 6);
    // the swing hangs from a point above the moon, so the moon sways sideways as it turns
    var Lp = rad * 3;
    ctx.save();
    ctx.translate(cx + Math.sin(swing) * Lp, cy - Lp + Math.cos(swing) * Lp); ctx.rotate(swing); ctx.translate(-cx, -cy);
    // the halves drift straight out to the sides, as two pieces pushed apart in space would, each turning slowly
    // outward; a slight curve in the path keeps the float and the swing back from looking mechanical
    var gap = sp * rad * .36, slide = rad * .08 * Math.sin(clamp(sp) * Math.PI), tilt = .1 * sp;
    if (sp > .001) {
      // a soft light in the cut
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = f * gone * Math.min(1, sp) * .22;
      ctx.save(); ctx.translate(cx, cy); ctx.scale(.14, 1);
      ctx.fillStyle = radial(0, 0, 0, rad * 1.5, [0, "rgba(255,246,225,.9)", .4, "rgba(255,225,170,.3)", 1, "rgba(255,210,140,0)"]);
      ctx.fillRect(-rad * 1.5, -rad * 1.5, rad * 3, rad * 3); ctx.restore();
      ctx.globalCompositeOperation = "source-over";
    }
    ctx.globalAlpha = f * gone;
    // whole unless it is apart, so no hairline of the cut ever shows through
    for (var k = 0, halves = sp > 0 ? 2 : 1; k < halves; k++) {
      var side = k ? 1 : -1;   // left half drifts left, right half drifts right
      ctx.save();
      ctx.translate(cx + side * gap, cy - side * slide); ctx.rotate(side * tilt); ctx.scale(rad * snap, rad * snap);
      if (halves === 2) { ctx.beginPath(); ctx.rect(k ? 0 : -1.1, -1.1, 1.1, 2.2); ctx.clip(); }
      ctx.drawImage(moonSpr, -1, -1, 2, 2);
      ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = f * gone * .22;   // the face's own glow
      ctx.fillStyle = radial(-.25, -.3, 0, 1.1, [0, "rgba(255,250,235,1)", .7, "rgba(220,230,255,.5)", 1, "rgba(200,215,255,.2)"]);
      ctx.beginPath(); ctx.arc(0, 0, 1, 0, 6.283); ctx.fill();
      ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = f * gone;
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
      body.classList.add("landed"); body.classList.remove("wait");
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
    // the panel's badge holds its logo a little smaller within the white circle; ease into exactly that, so the
    // hand-over at the end is invisible
    var bi = badge.querySelector("img"), li = logoEl.querySelector("img");
    if (bi && li) li.animate([{transform: "scale(1)"}, {transform: "scale(" + (bi.getBoundingClientRect().width / br.width * 112 / 97).toFixed(4) + ")"}],
                             {duration: 1050, easing: ease, fill: "forwards"});
    logoEl.animate([{boxShadow: "0 0 0 1px rgba(255,255,255,.4),0 0 60px 8px rgba(150,190,255,.28)"}, {boxShadow: "0 0 0 0 rgba(255,255,255,0),0 0 0 0 rgba(150,190,255,0)"}],
                   {duration: 900, easing: "ease", fill: "forwards"});
    var clipTo = "inset(" + Math.max(0, pr.top) + "px " + Math.max(0, innerWidth - pr.right) + "px " + Math.max(0, innerHeight - pr.bottom) + "px " + pr.left + "px)";
    stage.animate([{clipPath: "inset(0px 0px 0px 0px)"}, {clipPath: clipTo}], {duration: 1050, easing: ease, fill: "forwards"}).onfinish = function () {
      body.classList.remove("filming");
      // the stage melts off the panel, and only then does the panel's quote and art come in, so it's seen arriving
      stage.animate([{opacity: 1}, {opacity: 0}], {duration: 260, easing: "ease", fill: "forwards"}).onfinish = function () {
        body.classList.add("landed"); body.classList.remove("wait");
        end();
      };
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
    // The score, in D, kept spare so each sound marks one moment: a low swell under the stars, air drawn in as they
    // swirl into the moon, a soft whoosh as it parts, a quick rush back into one weighty knock with the chord
    // opening over it, and a single breath as the page arrives.
    function score() {
      var base = ac.currentTime - t;
      // the night: a low D and a dark string chord, rising slowly as the stars come out and holding to the end
      tone("sine", 36.71, base, [Math.max(t, 0), 0, 2.5, .12, T.joined, .14, T.out + .6, .08, T.end + 1.2, 0], 1, .1, T.end + 1.3);
      pad(base, [73.42, 110, 146.83, 220], Math.max(0, t), T.land + .6, .06, 240, 800, .5);
      // the stars let go and gather: air drawn in, landing in a soft low bloom as the moon forms
      whoosh(base, T.swirl - .2, T.land - .05, T.land + .6, 220, 2000, 400, .14, .55);
      boom(base + T.land, 66, 40, 2.6, .28, .5);
      // the split: one soft whoosh as the halves part
      whoosh(base, T.split - .1, T.split + .15, T.split + 1, 260, 900, 180, .12, .5);
      // the quick rush back, cut dead at the join, then the knock: a clean click, a body, a deep hit and the hall
      whoosh(base, T.rejoin - .12, T.joined - .01, T.joined + .03, 200, 2200, 2000, .2, .3);
      var J = base + T.joined;
      burst(J, "bandpass", 3000, 2.5, .05, .3, .35);
      burst(J, "lowpass", 900, .8, .16, .3, .4);
      boom(J, 150, 70, .3, .35, .3);
      boom(J, 58, 32, 3.2, .5, .5);
      // the chord opens over it, D major, and carries through to the page
      pad(base, [73.42, 146.83, 220, 293.66, 369.99, 440], T.joined, T.out + 1.6, .08, 400, 1600, .6);
      // the page arrives: one long breath of air settling
      whoosh(base, T.out - .2, T.out + .3, T.out + 1.6, 2000, 1000, 240, .07, .55);
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
