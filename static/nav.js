// The admin and account pages' side menu: one soft highlight glides to whichever item the pointer is over, as on
// the dashboard (page.html, MO.hover). Without this script the items simply light up on hover.
(function () {
  var nav = document.querySelector(".rail .navs");
  var still = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)");
  if (!nav || (still && still.matches)) return;
  var m = document.createElement("span"), on = false;
  m.className = "mhl"; m.setAttribute("aria-hidden", "true");
  nav.insertBefore(m, nav.firstChild);
  nav.classList.add("has-h");
  function place(it) {
    m.style.transform = "translate(" + it.offsetLeft + "px," + it.offsetTop + "px)";
    m.style.width = it.offsetWidth + "px"; m.style.height = it.offsetHeight + "px";
  }
  nav.addEventListener("pointerover", function (e) {
    if (e.pointerType !== "mouse") return;
    var it = e.target.closest(".nav");
    if (!it || !nav.contains(it)) return;
    if (!on) { m.classList.remove("go"); place(it); m.getBoundingClientRect(); m.classList.add("go"); on = true; } else place(it);
    m.style.opacity = it.getAttribute("aria-current") === "page" ? "0" : "1";
  });
  nav.addEventListener("pointerleave", function () { m.style.opacity = "0"; on = false; });
})();
