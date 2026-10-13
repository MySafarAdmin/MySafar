/* Shared Railway storage. The artifact and file:// versions keep their own storage.
   Classrooms are created and deleted from the page, so the class list comes from the server. */
(function () {
  "use strict";
  var revisions = {}, pending = {}, sending = false, reading = false, loaded = false, failed = false;
  var editVersion = 0;
  var banner = document.createElement("div");
  banner.style.cssText = "position:sticky;top:0;z-index:90;background:#eef2ff;color:#1e1b4b;padding:10px 16px;font:14px system-ui";
  banner.setAttribute("role", "status");
  var message = document.createElement("span");
  var retry = document.createElement("button");
  retry.textContent = "Retry";
  var download = document.createElement("button");
  download.textContent = "Download unsaved changes";
  var reload = document.createElement("button");
  reload.textContent = "Reload latest records";
  [message, retry, download, reload].forEach(function (e) { banner.appendChild(e); });
  var signIn = document.createElement("a");
  signIn.textContent = "Sign in again";
  signIn.href = "/login";
  signIn.target = "_blank";
  signIn.rel = "noopener";
  banner.appendChild(signIn);
  [retry, download, reload, signIn].forEach(function (e) { e.style.marginLeft = "12px"; e.hidden = true; });
  document.body.prepend(banner);

  // The signed-in person, their account links and sign-out.
  var ME = window.ME || {};
  var who = document.createElement("div");
  who.style.cssText = "display:flex;gap:12px;align-items:center;flex-wrap:wrap;justify-content:flex-end;font-size:.95rem";
  var label = document.createElement("span");
  label.textContent = (ME.name || "") + (ME.role === "admin" ? " · Administrator" : " · Teacher");
  who.appendChild(label);
  var links = [["Account", "/account"]];
  if (ME.role === "admin") links.unshift(["Manage users", "/admin/users"], ["Class history", "/admin/history"], ["TV screens", "/admin/tv"]);
  links.forEach(function (l) {
    var a = document.createElement("a");
    a.textContent = l[0]; a.href = l[1]; a.style.color = "inherit";
    who.appendChild(a);
  });
  var out = document.createElement("form");
  out.method = "post"; out.action = "/logout"; out.style.margin = "0";
  var csrf = document.createElement("input");
  csrf.type = "hidden"; csrf.name = "csrf"; csrf.value = ME.csrf || "";
  var outButton = document.createElement("button");
  outButton.className = "btn"; outButton.textContent = "Sign out";
  out.appendChild(csrf); out.appendChild(outButton);
  who.appendChild(out);
  document.querySelector(".hdr").prepend(who);
  // Only admins upload CSVs and create or delete classrooms; the server enforces this too.
  if (ME.role !== "admin") {
    document.getElementById("up").style.display = "none";
    var del = document.getElementById("delC").parentNode;
    del.style.display = "none";
    del.previousElementSibling.style.display = "none";
  }

  function lock(value) {
    document.querySelector("main").inert = value;
    document.querySelector("header").inert = value;
  }
  function status(text) { message.textContent = text; setSt(text); }
  function problem(error) {
    failed = true;
    lock(true);
    var conflict = error.status === 409 || error.status === 404;
    var signedOut = error.status === 401, denied = error.status === 403;
    status(signedOut
      ? "You've been signed out. Sign in again (it opens in a new tab), then come back here and press Retry. Your unsaved changes are kept in this tab."
      : denied
      ? "Your account can't make this change. Reload to see the classrooms you can edit."
      : conflict
      ? "Another browser changed or deleted this classroom. Download your unsaved changes, then reload the latest records."
      : "Records could not be loaded or saved. Check your connection and retry. Keep this page open to preserve unsaved changes.");
    retry.hidden = conflict || denied;
    download.hidden = !Object.keys(pending).length;
    reload.hidden = !(conflict || denied);
    signIn.hidden = !signedOut;
  }
  async function api(path, options) {
    var controller = new AbortController();
    var timeout = setTimeout(function () { controller.abort(); }, 15000);
    try {
      var response = await fetch(path, Object.assign({credentials: "same-origin", cache: "no-store", signal: controller.signal}, options));
      if (!response.ok) { var error = new Error("Request failed"); error.status = response.status; throw error; }
      return await response.json();
    } finally { clearTimeout(timeout); }
  }
  async function read() {
    if (reading || sending || Object.keys(pending).length || failed) return;
    reading = true;
    var versionAtStart = editVersion;
    try {
      var records = await api("/api/classes");
      // Discard responses that overlap local edits. A later poll will refresh them.
      if (sending || Object.keys(pending).length || editVersion !== versionAtStart) return;
      var active = document.activeElement;
      var editing = active && (active.matches("input,textarea,select") || active.isContentEditable);
      var updated = false, first = !loaded;
      Object.keys(records).forEach(function (c) {
        var record = records[c];
        // Never update the revision without also applying its state.
        if (loaded && editing && CID === c) return;
        if (revisions[c] !== record.revision) {
          parseC(c, record.json);
          revisions[c] = record.revision;
          updated = true;
        }
      });
      // Classrooms deleted in another browser.
      CIDS.slice().forEach(function (c) {
        if (records[c] || (loaded && editing && CID === c)) return;
        dropC(c);
        delete revisions[c];
        updated = true;
      });
      loaded = true;
      LOADED = true;
      DBST = "on";
      lock(false);
      // Leave a focused class form intact while other classes refresh.
      if (first || (updated && (!editing || !CID))) changed();
      status("All changes saved online. Records are shared across devices.");
      retry.hidden = true;
      refreshHouses();
    } catch (error) { problem(error); }
    finally { reading = false; }
  }
  // Whole-school house points for the Master page; teachers only load their own classrooms.
  async function refreshHouses() {
    try {
      var totals = await api("/api/houses");
      var before = JSON.stringify(window.HOUSE_TOTALS);
      window.HOUSE_TOTALS = totals;
      if (before !== JSON.stringify(totals) && !CID) master();
    } catch (error) { /* The totals refresh with the next poll. */ }
  }
  async function flush() {
    if (sending || failed) return;
    var c = Object.keys(pending)[0];
    if (!c) { status("All changes saved online. Records are shared across devices."); return; }
    sending = true;
    var json = pending[c];
    var path = "/api/classes/" + encodeURIComponent(c);
    var headers = {"Content-Type": "application/json", "X-Dashboard-Request": "1"};
    status("Saving changes online… Keep this page open.");
    try {
      if (json === null) {
        // A deleted classroom. Revision 0 means it was never saved.
        await api(path, {method: "DELETE", headers: headers, body: JSON.stringify({revision: revisions[c] || 0})});
        if (pending[c] === null) { delete pending[c]; delete revisions[c]; }
      } else {
        // Revision 0 creates a new classroom.
        var result = await api(path, {method: "PUT", headers: headers, body: JSON.stringify({json: json, revision: revisions[c] || 0})});
        revisions[c] = result.revision;
        if (pending[c] === json) delete pending[c];
      }
    } catch (error) { problem(error); }
    finally { sending = false; }
    if (!failed) flush();
  }
  // Replace device-only saves for the hosted page; no student data is cached in localStorage.
  persist = function (c) {
    if (!ST[c] || !loaded || failed) return;
    editVersion++;
    pending[c] = cj(c);
    flush();
  };
  unpersist = function (c) {
    if (!loaded || failed) return;
    editVersion++;
    pending[c] = null;
    flush();
  };
  retry.onclick = function () {
    failed = false;
    retry.hidden = download.hidden = reload.hidden = signIn.hidden = true;
    if (Object.keys(pending).length) {
      lock(false);
      flush();
    } else { read(); }
  };
  download.onclick = function () {
    var records = {};
    Object.keys(pending).forEach(function (c) { records[c] = {json: pending[c], revision: revisions[c]}; });
    var url = URL.createObjectURL(new Blob([JSON.stringify(records, null, 2)], {type: "application/json"}));
    var link = document.createElement("a");
    link.href = url; link.download = "safar-unsaved-changes.json"; link.click();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  };
  reload.onclick = function () {
    if (confirm("Reload server records? Unsaved changes in this tab will be discarded. Download them first if you need to keep them.")) {
      pending = {};
      location.reload();
    }
  };
  window.addEventListener("beforeunload", function (event) {
    if (sending || Object.keys(pending).length) { event.preventDefault(); event.returnValue = ""; }
  });
  lock(true);
  status("Loading shared class records…");
  read();
  setInterval(function () { if (!document.hidden) read(); }, 10000);
})();
