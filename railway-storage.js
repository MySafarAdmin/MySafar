/* Shared Railway storage. The artifact and file:// versions keep their own storage.
   Classrooms are created and deleted from the page, so the class list comes from the server. */
(function () {
  "use strict";
  if (window.SIGNING_OUT) return;  // a new tab going back to the sign-in page (see TAB_GUARD in server.py)
  var revisions = {}, pending = {}, sending = false, reading = false, loaded = false, failed = false;
  var editVersion = 0;
  // Shown only when saving or loading fails; routine save status goes in the page heading.
  var banner = document.createElement("div");
  banner.className = "sync bad";
  banner.setAttribute("role", "alert");
  banner.hidden = true;
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
  [retry, download, reload, signIn].forEach(function (e) { e.hidden = true; });
  document.querySelector(".work").prepend(banner);

  // The signed-in person, their account links and sign-out, in the navigation rail.
  var ME = window.ME || {};
  var ICONS = {
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.3-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><path d="M16 4.8a3.4 3.4 0 0 1 0 6.4"/><path d="M18 14.8c1.8.7 3 2.4 3.5 5.2"/>',
    history: '<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v4.5h4.5"/><path d="M12 7.5V12l3 2"/>',
    activity: '<path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h10"/>',
    tv: '<rect x="3" y="4.5" width="18" height="12" rx="1.5"/><path d="M8 20h8"/><path d="M12 16.5V20"/>',
    sheet: '<rect x="3.5" y="3.5" width="17" height="17" rx="2"/><path d="M3.5 9.5h17"/><path d="M3.5 15h17"/><path d="M9.5 9.5v11"/>',
    pie: '<path d="M20.5 13.5A8.5 8.5 0 1 1 10.5 3.5v10z"/><path d="M14 3.2A8.5 8.5 0 0 1 20.8 10H14z"/>',
    upload: '<path d="M12 15V4"/><path d="m7.5 8.5 4.5-4.5 4.5 4.5"/><path d="M4 15v4.5h16V15"/>'
  };
  if (ME.role === "admin") {
    var adminNav = document.getElementById("adminNav");
    var heading = document.createElement("div");
    heading.className = "navh";
    heading.textContent = "Administration";
    adminNav.appendChild(heading);
    [["Manage users", "/admin/users", "users"], ["Class history", "/admin/history", "history"],
     ["Activity", "/admin/activity", "activity"], ["TV screens", "/admin/tv", "tv"], ["Historical points", "/admin/house-points", "pie"],
     ["Spreadsheet", "/admin/export", "sheet"], ["Import", "/admin/import", "upload"]].forEach(function (l) {
      var a = document.createElement("a");
      a.className = "nav"; a.href = l[1];
      a.innerHTML = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICONS[l[2]] + "</svg>";
      a.appendChild(document.createTextNode(l[0]));
      adminNav.appendChild(a);
      // Students sits under Manage users for admins.
      var stu = document.getElementById("nU");
      if (l[2] === "users" && stu) adminNav.appendChild(stu);
    });
  }
  var me = document.getElementById("me");
  var who = document.createElement("div");
  who.className = "who";
  var nameLine = document.createElement("b");
  nameLine.textContent = ME.name || "";
  var roleLine = document.createElement("span");
  roleLine.textContent = ME.role === "admin" ? "Administrator" : "Teacher";
  who.appendChild(nameLine); who.appendChild(roleLine);
  var row = document.createElement("div");
  row.className = "row";
  var account = document.createElement("a");
  account.className = "linkbtn"; account.href = "/account"; account.textContent = "Account";
  var out = document.createElement("form");
  out.method = "post"; out.action = "/logout";
  var csrf = document.createElement("input");
  csrf.type = "hidden"; csrf.name = "csrf"; csrf.value = ME.csrf || "";
  var outButton = document.createElement("button");
  outButton.className = "linkbtn"; outButton.textContent = "Sign out";
  out.appendChild(csrf); out.appendChild(outButton);
  row.appendChild(account); row.appendChild(out);
  me.appendChild(who); me.appendChild(row);
  me.hidden = false;
  // Only admins upload CSVs and create or delete classrooms; the server enforces this too.
  if (ME.role !== "admin") {
    document.getElementById("up").style.display = "none";
    document.getElementById("delWrap").style.display = "none";
  }

  function lock(value) {
    document.querySelector("main").inert = value;
    document.querySelector("header").inert = value;
  }
  function status(text, state) { message.textContent = text; setSt(state === "bad" ? "Needs attention" : text, state); }
  function problem(error) {
    failed = true;
    lock(true);
    banner.hidden = false;
    var conflict = error.status === 409 || error.status === 404;
    var signedOut = error.status === 401, denied = error.status === 403;
    status(signedOut
      ? "You've been signed out. Sign in again (it opens in a new tab), then come back here and press Retry. Your unsaved changes are kept in this tab."
      : denied
      ? "Your account can't make this change. Reload to see the classrooms you can edit."
      : conflict
      ? "Another browser changed or deleted this classroom. Download your unsaved changes, then reload the latest records."
      : "Records could not be loaded or saved. Check your connection and retry. Keep this page open to preserve unsaved changes.", "bad");
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
      status("All changes saved");
      retry.hidden = true;
      banner.hidden = true;
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
      // Admins also get the points added by hand for a whole house, for the House points page.
      if (window.ME && ME.role === "admin") {
        var extra = await api("/api/house-extra"), had = JSON.stringify(window.HOUSE_EXTRA || null);
        window.HOUSE_EXTRA = extra;
        if (had !== JSON.stringify(extra)) before = "";
      }
      if (before !== JSON.stringify(totals) && !CID) master();
    } catch (error) { /* The totals refresh with the next poll. */ }
  }
  async function flush() {
    if (sending || failed) return;
    var c = Object.keys(pending)[0];
    if (!c) { status("All changes saved"); banner.hidden = true; return; }
    sending = true;
    var json = pending[c];
    var path = "/api/classes/" + encodeURIComponent(c);
    var headers = {"Content-Type": "application/json", "X-Dashboard-Request": "1"};
    status("Saving…", "busy");
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
  status("Loading class records…", "busy");
  read();
  // While the dashboard is open in a background tab, check in every few minutes so the sign-in stays alive;
  // once the app is closed the check-ins stop and the server ends the sign-in after 20 minutes.
  var checkedIn = Date.now();
  setInterval(function () {
    if (!document.hidden) { read(); checkedIn = Date.now(); return; }
    if (Date.now() - checkedIn < 240000) return;
    checkedIn = Date.now();
    fetch("/api/houses", { credentials: "same-origin", cache: "no-store" }).catch(function () {});
  }, 10000);
})();
