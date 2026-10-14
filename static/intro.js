// The sign-in page's opening: the email field takes focus only once the opening has ended, so a browser's
// saved-password suggestions appear then, not over the animation. Clicking or tapping a field earlier still works.
(function () {
  var field = document.querySelector("input[name=email]");
  if (!field) return;
  var still = false;
  try { still = matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}
  setTimeout(function () {
    var active = document.activeElement;
    if (!active || active === document.body) field.focus({preventScroll: true});
  }, still ? 0 : 4200);
})();
