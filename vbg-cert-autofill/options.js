/* Settings page (also the toolbar popup). Saves the signing-authority
   details used to fill every certificate block. */
(function () {
  "use strict";
  var FIELDS = ["name", "desig", "dept", "mob", "email"];
  var el = {};
  FIELDS.forEach(function (k) { el[k] = document.getElementById(k); });
  var saved = document.getElementById("saved");
  var savedTimer = null;

  function hasAny(s) { return !!(s && (s.name || s.desig || s.dept || s.mob || s.email)); }
  function populate(s) { FIELDS.forEach(function (k) { if (s[k]) el[k].value = s[k]; }); }

  // load: local first, then fall back to sync (account-backed) and re-hydrate local
  try {
    chrome.storage.local.get("vbgCert", function (r) {
      if (r && hasAny(r.vbgCert)) { populate(r.vbgCert); return; }
      try {
        chrome.storage.sync.get("vbgCert", function (r2) {
          if (r2 && hasAny(r2.vbgCert)) {
            populate(r2.vbgCert);
            try { chrome.storage.local.set({ vbgCert: r2.vbgCert }); } catch (e) {}
          }
        });
      } catch (e) {}
    });
  } catch (e) {}

  function save() {
    var s = {};
    FIELDS.forEach(function (k) { s[k] = el[k].value.trim(); });
    // write to both stores so the details survive restart, update and reinstall
    try { chrome.storage.sync.set({ vbgCert: s }); } catch (e) {}
    try {
      chrome.storage.local.set({ vbgCert: s }, function () {
        saved.classList.add("show");
        if (savedTimer) clearTimeout(savedTimer);
        savedTimer = setTimeout(function () { saved.classList.remove("show"); }, 1200);
      });
    } catch (e) {}
  }

  FIELDS.forEach(function (k) {
    el[k].addEventListener("input", save);
    el[k].addEventListener("change", save);
  });
})();

/* ---- Data extractor: scan the active page, download CSV/JSON ---- */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var msgEl = $("dxMsg"), box = $("dxResults");
  function msg(t) { if (msgEl) msgEl.textContent = t || ""; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]; }); }

  function previewTable(t) {
    var tb = document.createElement("table"), rows = [];
    if (t.headers && t.headers.length) rows.push(t.headers);
    rows = rows.concat(t.rows.slice(0, 3));
    rows.forEach(function (r) {
      var tr = document.createElement("tr");
      r.forEach(function (v) { var td = document.createElement("td"); td.textContent = v; tr.appendChild(td); });
      tb.appendChild(tr);
    });
    return tb;
  }

  function render(tables, title, url) {
    box.innerHTML = "";
    if (!tables.length) { msg("No tables or grids found on this page."); return; }
    msg("Found " + tables.length + " table" + (tables.length > 1 ? "s" : "") + " on this page.");
    var all = document.createElement("button");
    all.className = "btn ghost"; all.textContent = "Download all as one JSON";
    all.onclick = function () { DX.download(DX.safeName(title || "page") + "-tables.json", JSON.stringify({ source: url, title: title, tables: tables }, null, 2), "application/json"); };
    box.appendChild(all);

    tables.forEach(function (t, i) {
      var d = document.createElement("div"); d.className = "dxt";
      var gridCls = t.kind === "table" ? "" : "grid";
      d.innerHTML =
        '<h4><span>' + esc(t.name || ("Table " + (i + 1))) + '</span> <span class="badge ' + gridCls + '">' + esc(t.kind) + '</span></h4>' +
        '<div class="dim">' + t.rowCount + ' rows &times; ' + t.colCount + ' cols</div>' +
        '<div class="acts"><button data-a="csv">CSV</button><button data-a="json">JSON</button><button data-a="prev">Preview</button></div>' +
        '<div class="prev" hidden></div>';
      var prev = d.querySelector(".prev");
      d.querySelector(".acts").addEventListener("click", function (e) {
        var b = e.target.closest("button"); if (!b) return;
        var a = b.getAttribute("data-a"), nm = DX.safeName(t.name || ("table" + (i + 1)));
        if (a === "csv") DX.download(nm + ".csv", DX.toCSV(t.headers, t.rows), "text/csv;charset=utf-8");
        else if (a === "json") DX.download(nm + ".json", JSON.stringify(DX.toObjects(t), null, 2), "application/json");
        else { prev.hidden = !prev.hidden; if (!prev.getAttribute("data-done")) { prev.appendChild(previewTable(t)); prev.setAttribute("data-done", "1"); } }
      });
      box.appendChild(d);
    });
  }

  function scan() {
    msg("Scanning…"); box.innerHTML = "";
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      var tab = tabs && tabs[0];
      if (!tab) { msg("No active tab."); return; }
      if (!/^https?:/i.test(tab.url || "")) { msg("This page can't be scanned (open a normal web page)."); return; }
      chrome.scripting.executeScript(
        { target: { tabId: tab.id, allFrames: true }, func: DX.extractFn, args: [{ grids: true }] },
        function (res) {
          if (chrome.runtime.lastError) { msg("Can't read this page: " + chrome.runtime.lastError.message); return; }
          var tables = [];
          (res || []).forEach(function (r) { if (r && r.result && r.result.tables) r.result.tables.forEach(function (t) { tables.push(t); }); });
          if ($("cleanChk") && $("cleanChk").checked) {
            tables = tables.map(function (t) { return DX.cleanTable(t, {}); }).filter(function (t) { return t.rowCount > 0; });
          }
          render(tables, tab.title, tab.url);
        }
      );
    });
  }

  if ($("scanBtn")) $("scanBtn").addEventListener("click", scan);
  if ($("tabsBtn")) $("tabsBtn").addEventListener("click", function () {
    chrome.tabs.create({ url: chrome.runtime.getURL("extractor.html") });
  });

  /* saved-join suggestion in the popup */
  (function () {
    var norm = (window.DX && DX.normUrl) || function (u) { return String(u || "").split(/[?#]/)[0].toLowerCase(); };
    try {
      chrome.storage.local.get("dxRecipes", function (d) {
        var list = (d && d.dxRecipes) || []; if (!list.length) return;
        chrome.tabs.query({}, function (tabs) {
          var o = {}; (tabs || []).forEach(function (t) { if (/^https?:/i.test(t.url || "")) o[norm(t.url)] = 1; });
          var rec = list.filter(function (x) { return (x.sources || []).length && x.sources.every(function (s) { return o[s]; }); }).sort(function (a, b) { return b.savedAt - a.savedAt; })[0];
          if (!rec) return;
          var el = $("popBanner"); if (!el) return;
          el.textContent = "Saved join available for these pages: " + rec.label + " ";
          var b = document.createElement("button"); b.className = "pbtn"; b.textContent = "Open & re-run →";
          b.addEventListener("click", function () { chrome.tabs.create({ url: chrome.runtime.getURL("extractor.html?recipe=" + encodeURIComponent(rec.id)) }); });
          el.appendChild(document.createElement("br")); el.appendChild(b); el.classList.remove("hide");
        });
      });
    } catch (e) {}
  })();
})();
