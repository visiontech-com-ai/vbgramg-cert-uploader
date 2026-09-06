/* Consolidate tables across selected tabs — Stack (append) or Join (link on key),
   with an output column selector and saved join "recipes" (re-run on the same pages).
   Runs in an extension page. Reuses DX.* from dx-core.js. */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var TABS = [];             // {id,title,url,ok}
  var lastDatasets = [];     // [{title,url,tables:[...]}]  (raw extraction)
  var FLAT = [];             // [{label, table, url}]  flattened tables for the join pickers
  var lastMerged = [];       // datasets to render/download
  var lastSummary = [];      // datasets for the PDF/sources panel
  var outputCols = [];       // per-dataset ordered column-name arrays (null = all)
  var activeRecipe = null;   // recipe object being built/replayed (join output = dataset 0)

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]; }); }
  function msg(t) { $("msg").textContent = t || ""; }
  function jmsg(t) { $("joinMsg").textContent = t || ""; }
  function scriptable(u) { return /^https?:/i.test(u || ""); }
  var normUrl = DX.normUrl;

  /* ---------- recipe storage ---------- */
  function loadRecipes(cb) {
    try { chrome.storage.local.get("dxRecipes", function (r) { cb((r && r.dxRecipes) || []); }); }
    catch (e) { cb([]); }
  }
  function saveRecipes(list) {
    try { chrome.storage.local.set({ dxRecipes: list }); } catch (e) {}
    try { chrome.storage.sync.set({ dxRecipes: list }); } catch (e) {}
  }
  function upsertRecipe(rec) {
    loadRecipes(function (list) {
      var key = rec.sources.slice().sort().join("|");
      var i = list.findIndex(function (x) { return x.sources.slice().sort().join("|") === key; });
      if (i >= 0) { rec.id = list[i].id; list[i] = rec; } else { rec.id = "r" + Date.now(); list.push(rec); }
      saveRecipes(list); renderSavedList();
    });
  }
  function deleteRecipe(id) { loadRecipes(function (list) { saveRecipes(list.filter(function (x) { return x.id !== id; })); renderSavedList(); checkMatch(); }); }

  /* ---------- tab list ---------- */
  function loadTabs() {
    chrome.tabs.query({}, function (tabs) {
      TABS = (tabs || []).map(function (t) { return { id: t.id, title: t.title || "(untitled)", url: t.url || "", ok: scriptable(t.url) }; });
      renderTabs(); $("tablist").classList.remove("hide");
      $("tabsHint").textContent = TABS.length + " tab(s) loaded. Tick the ones to include.";
    });
  }
  function renderTabs() {
    var f = ($("filter").value || "").toLowerCase(), list = $("tablist"); list.innerHTML = "";
    TABS.forEach(function (t, i) {
      if (f && (t.title + " " + t.url).toLowerCase().indexOf(f) < 0) return;
      var row = document.createElement("div"); row.className = "tab" + (t.ok ? "" : " dis");
      var cb = document.createElement("input"); cb.type = "checkbox"; cb.setAttribute("data-i", i); cb.disabled = !t.ok;
      cb.addEventListener("change", updateCount);
      var box = document.createElement("div");
      var tt = document.createElement("div"); tt.className = "t"; tt.textContent = t.title;
      var uu = document.createElement("div"); uu.className = "u"; uu.textContent = t.ok ? t.url : (t.url + "  (can't be read)");
      box.appendChild(tt); box.appendChild(uu); row.appendChild(cb); row.appendChild(box); list.appendChild(row);
    });
    updateCount();
  }
  function selectedTabs() {
    var out = [];
    Array.prototype.forEach.call($("tablist").querySelectorAll('input[type=checkbox]'), function (cb) {
      if (cb.checked && !cb.disabled) out.push(TABS[+cb.getAttribute("data-i")]);
    });
    return out;
  }
  function updateCount() {
    var n = selectedTabs().length;
    $("selCount").textContent = n + " tab" + (n === 1 ? "" : "s") + " selected";
    $("run").disabled = n === 0;
  }
  function originsOf(tabs) { var set = {}; tabs.forEach(function (t) { try { set[new URL(t.url).origin + "/*"] = 1; } catch (e) {} }); return Object.keys(set); }

  /* ---------- extraction ---------- */
  function extractOne(tab) {
    return new Promise(function (resolve) {
      chrome.scripting.executeScript(
        { target: { tabId: tab.id, allFrames: true }, func: DX.extractFn, args: [{ grids: true }] },
        function (res) {
          if (chrome.runtime.lastError) { resolve({ title: tab.title, url: tab.url, tables: [], error: chrome.runtime.lastError.message }); return; }
          var tables = [];
          (res || []).forEach(function (r) { if (r && r.result && r.result.tables) r.result.tables.forEach(function (t) { tables.push(t); }); });
          resolve({ title: tab.title, url: tab.url, tables: tables });
        }
      );
    });
  }
  function cleanDatasets(datasets, clean) {
    if (clean) datasets.forEach(function (d) { d.tables = (d.tables || []).map(function (t) { return DX.cleanTable(t, {}); }).filter(function (t) { return t.rowCount > 0; }); });
    return datasets;
  }
  function run() {
    var picks = selectedTabs(); if (!picks.length) return;
    msg("Requesting access to the selected tabs…");
    chrome.permissions.request({ origins: originsOf(picks) }, function (granted) {
      if (!granted) { msg("Access was not granted, so those pages can't be read."); return; }
      msg("Extracting from " + picks.length + " tab(s)…");
      var chain = Promise.resolve([]);
      picks.forEach(function (tab) { chain = chain.then(function (acc) { return extractOne(tab).then(function (d) { acc.push(d); return acc; }); }); });
      chain.then(function (datasets) {
        cleanDatasets(datasets, $("cleanChk") && $("cleanChk").checked);
        lastDatasets = datasets; FLAT = [];
        datasets.forEach(function (d) {
          (d.tables || []).forEach(function (t) {
            FLAT.push({ label: d.title + " · " + (t.name || "table") + " (" + t.rowCount + "×" + t.colCount + ")", table: t, url: d.url });
          });
        });
        msg("Extracted " + FLAT.length + " table(s) from " + datasets.length + " tab(s). Choose how to consolidate below.");
        $("consolidateCard").classList.remove("hide");
        populateJoinPickers();
      });
    });
  }

  /* ---------- join UI helpers ---------- */
  function colsOf(table) {
    var n = table.colCount || (table.rows[0] ? table.rows[0].length : 0);
    var h = (table.headers && table.headers.length) ? table.headers : [];
    var out = []; for (var i = 0; i < n; i++) out.push({ i: i, name: (h[i] && String(h[i]).trim()) || ("col" + (i + 1)) });
    return out;
  }
  function nameAt(table, i) { var c = colsOf(table)[i]; return c ? c.name : ""; }
  function idxOfName(table, name) { var cs = colsOf(table); for (var i = 0; i < cs.length; i++) if (cs[i].name === name) return i; return -1; }
  function fillSelect(sel, items, textKey) { sel.innerHTML = ""; items.forEach(function (it, idx) { var o = document.createElement("option"); o.value = idx; o.textContent = textKey ? it[textKey] : it; sel.appendChild(o); }); }
  function tableFromSel(sel) { var it = FLAT[+sel.value]; return it ? it.table : null; }
  function colSelect(cols, cls) { var s = document.createElement("select"); s.className = cls; cols.forEach(function (c) { var o = document.createElement("option"); o.value = c.i; o.textContent = c.name; s.appendChild(o); }); return s; }
  function fmtSelect(cls) { var s = document.createElement("select"); s.className = cls; s.title = "date format"; [["auto", "auto"], ["dmy", "D/M/Y"], ["mdy", "M/D/Y"]].forEach(function (m) { var o = document.createElement("option"); o.value = m[0]; o.textContent = m[1]; s.appendChild(o); }); return s; }
  function addKeyRow(preset) {
    var L = tableFromSel($("leftTable")), R = tableFromSel($("rightTable")); if (!L || !R) return;
    var row = document.createElement("div"); row.className = "keyrow";
    var kl = colSelect(colsOf(L), "kl");
    var km = document.createElement("select"); km.className = "km";
    [["exact", "exact"], ["id", "id (numbers)"], ["date", "date"], ["name", "name (fuzzy)"]].forEach(function (m) { var o = document.createElement("option"); o.value = m[0]; o.textContent = m[1]; km.appendChild(o); });
    var eq = document.createElement("span"); eq.className = "eq"; eq.textContent = "↔";
    var kr = colSelect(colsOf(R), "kr");
    var lf = fmtSelect("klf"), rf = fmtSelect("krf"); lf.classList.add("hide"); rf.classList.add("hide");
    km.addEventListener("change", function () { var d = km.value === "date"; lf.classList.toggle("hide", !d); rf.classList.toggle("hide", !d); });
    var rm = document.createElement("button"); rm.className = "krm"; rm.textContent = "×"; rm.title = "remove"; rm.addEventListener("click", function () { row.remove(); });
    row.appendChild(kl); row.appendChild(km); row.appendChild(eq); row.appendChild(kr); row.appendChild(lf); row.appendChild(rf); row.appendChild(rm);
    if (preset) { var li = idxOfName(L, preset.leftCol), ri = idxOfName(R, preset.rightCol); if (li >= 0) kl.value = li; if (ri >= 0) kr.value = ri; km.value = preset.mode; km.dispatchEvent(new Event("change")); if (preset.leftFmt) lf.value = preset.leftFmt; if (preset.rightFmt) rf.value = preset.rightFmt; }
    $("keyRows").appendChild(row);
  }
  function populateJoinPickers() {
    fillSelect($("leftTable"), FLAT, "label"); fillSelect($("rightTable"), FLAT, "label");
    if (FLAT.length > 1) $("rightTable").value = "1";
    refreshJoinCols();
  }
  function refreshJoinCols() {
    var L = tableFromSel($("leftTable")), R = tableFromSel($("rightTable"));
    if (L) fillMulti($("fillLeft"), colsOf(L)); if (R) fillMulti($("fillRight"), colsOf(R));
    $("keyRows").innerHTML = ""; addKeyRow();
  }
  function fillMulti(sel, cols) { sel.innerHTML = ""; cols.forEach(function (c) { var o = document.createElement("option"); o.value = c.i; o.textContent = c.name; sel.appendChild(o); }); }
  function selectedMulti(sel) { return Array.prototype.filter.call(sel.options, function (o) { return o.selected; }).map(function (o) { return +o.value; }); }

  /* ---------- run stack / join ---------- */
  function buildStack() { activeRecipe = null; lastMerged = DX.mergeTables(lastDatasets); lastSummary = lastDatasets; outputCols = lastMerged.map(function () { return null; }); renderResults(); jmsg(""); }

  function runJoin() {
    var Lit = FLAT[+$("leftTable").value], Rit = FLAT[+$("rightTable").value];
    if (!Lit || !Rit) { jmsg("Pick both tables."); return; }
    var Lraw = Lit.table, Rraw = Rit.table, L = Lraw, R = Rraw;
    var fl = selectedMulti($("fillLeft")), fr = selectedMulti($("fillRight"));
    if (fl.length) L = DX.fillDown(L, fl);
    if (fr.length) R = DX.fillDown(R, fr);
    var keySpec = [], recKeys = [];
    Array.prototype.forEach.call($("keyRows").children, function (row) {
      var li = +row.querySelector(".kl").value, ri = +row.querySelector(".kr").value, mode = row.querySelector(".km").value,
        lf2 = row.querySelector(".klf").value, rf2 = row.querySelector(".krf").value;
      keySpec.push({ left: li, right: ri, mode: mode, leftFmt: lf2, rightFmt: rf2 });
      recKeys.push({ leftCol: nameAt(L, li), rightCol: nameAt(R, ri), mode: mode, leftFmt: lf2, rightFmt: rf2 });
    });
    if (!keySpec.length) { jmsg("Add at least one key."); return; }
    var type = (document.querySelector('input[name=jtype]:checked') || {}).value || "left", firstOnly = $("firstOnly").checked;
    var joined = DX.joinTables(L, R, keySpec, { type: type, firstMatchOnly: firstOnly, rightName: Rraw.name || "R" });
    lastMerged = [joined];
    lastSummary = [{ title: "LEFT · " + Lit.label, url: "", tables: [L] }, { title: "RIGHT · " + Rit.label, url: "", tables: [R] }];
    outputCols = [null];
    var s = joined._stats;
    jmsg("Joined: " + s.matched + " left rows matched, " + s.unmatched + " unmatched → " + joined.rowCount + " output rows.");

    // build / remember recipe
    if ($("rememberChk") && $("rememberChk").checked && Lit.url && Rit.url) {
      activeRecipe = {
        label: (Rraw.name || "Right") + " → " + (Lraw.name || "Left"),
        sources: [normUrl(Lit.url), normUrl(Rit.url)],
        left: { url: normUrl(Lit.url), headerSig: colsOf(Lraw).map(function (c) { return c.name; }) },
        right: { url: normUrl(Rit.url), headerSig: colsOf(Rraw).map(function (c) { return c.name; }) },
        keys: recKeys, join: { type: type, firstMatchOnly: firstOnly },
        clean: !!($("cleanChk") && $("cleanChk").checked),
        fillLeft: fl.map(function (i) { return nameAt(Lraw, i); }), fillRight: fr.map(function (i) { return nameAt(Rraw, i); }),
        output: null, export: "csv", savedAt: Date.now()
      };
      upsertRecipe(activeRecipe);
    } else activeRecipe = null;
    renderResults();
  }

  /* ---------- results + column selector ---------- */
  function previewTable(t) {
    var tb = document.createElement("table"), all = []; if (t.headers && t.headers.length) all.push(t.headers);
    all = all.concat(t.rows.slice(0, 5));
    all.forEach(function (r) { var tr = document.createElement("tr"); r.forEach(function (v) { var td = document.createElement("td"); td.textContent = v; tr.appendChild(td); }); tb.appendChild(tr); });
    return tb;
  }
  function projected(i) { var m = lastMerged[i]; return outputCols[i] ? DX.projectColumns(m, outputCols[i]) : m; }
  function recomputeOutput(i, container) {
    var names = Array.prototype.map.call(container.querySelectorAll(".colitem"), function (it) { return it.getAttribute("data-name"); });
    var checked = Array.prototype.filter.call(container.querySelectorAll(".colitem"), function (it) { return it.querySelector("input").checked; }).map(function (it) { return it.getAttribute("data-name"); });
    // keep DOM order, only checked
    outputCols[i] = names.filter(function (n) { return checked.indexOf(n) >= 0; });
    if (i === 0 && activeRecipe) { activeRecipe.output = outputCols[i]; upsertRecipe(activeRecipe); }
  }
  function getAfter(container, y) {
    var els = [].slice.call(container.querySelectorAll(".colitem:not(.dragging)")), res = null, closest = -Infinity;
    els.forEach(function (el) { var b = el.getBoundingClientRect(), off = y - b.top - b.height / 2; if (off < 0 && off > closest) { closest = off; res = el; } });
    return res;
  }
  function buildColPicker(i, m) {
    var wrap = document.createElement("details"); wrap.className = "colpick";
    var sum = document.createElement("summary"); sum.textContent = "Choose / reorder columns"; wrap.appendChild(sum);
    var list = document.createElement("div"); list.className = "collist";
    m.headers.forEach(function (h) {
      var it = document.createElement("div"); it.className = "colitem"; it.setAttribute("draggable", "true"); it.setAttribute("data-name", h);
      it.innerHTML = '<span class="drag" title="drag to reorder">⋮⋮</span>';
      var lab = document.createElement("label"); var cb = document.createElement("input"); cb.type = "checkbox"; cb.checked = true;
      cb.addEventListener("change", function () { recomputeOutput(i, list); });
      lab.appendChild(cb); lab.appendChild(document.createTextNode(" " + h)); it.appendChild(lab); list.appendChild(it);
    });
    var dragEl = null;
    list.addEventListener("dragstart", function (e) { dragEl = e.target.closest(".colitem"); if (dragEl) dragEl.classList.add("dragging"); });
    list.addEventListener("dragend", function () { if (dragEl) { dragEl.classList.remove("dragging"); dragEl = null; recomputeOutput(i, list); } });
    list.addEventListener("dragover", function (e) { e.preventDefault(); var d = list.querySelector(".dragging"); if (!d) return; var after = getAfter(list, e.clientY); if (after == null) list.appendChild(d); else list.insertBefore(d, after); });
    wrap.appendChild(list); return wrap;
  }
  function renderResults() {
    $("resultsCard").classList.remove("hide");
    var src = $("sources"); src.innerHTML = "";
    lastSummary.forEach(function (d) { var line = document.createElement("div"); line.innerHTML = "• " + esc(d.title) + " — " + (d.tables ? d.tables.length : 0) + " table(s)" + (d.error ? " <em>(skipped: " + esc(d.error) + ")</em>" : ""); src.appendChild(line); });
    var wrap = $("datasets"); wrap.innerHTML = "";
    if (!lastMerged.length) { var p = document.createElement("p"); p.className = "muted"; p.textContent = "Nothing to show."; wrap.appendChild(p); return; }
    lastMerged.forEach(function (m, i) {
      var d = document.createElement("div"); d.className = "ds";
      var head = document.createElement("h3"); head.textContent = "Dataset " + (i + 1);
      var b = document.createElement("span"); b.className = "badge"; b.textContent = (m.sourceCount || 1) + " source" + ((m.sourceCount || 1) === 1 ? "" : "s"); head.appendChild(b); d.appendChild(head);
      var dim = document.createElement("div"); dim.className = "dim"; dim.textContent = m.rowCount + " rows × " + m.colCount + " cols"; d.appendChild(dim);
      d.appendChild(buildColPicker(i, m));
      var acts = document.createElement("div"); acts.className = "acts";
      acts.innerHTML = '<button data-a="csv">Download CSV</button><button data-a="json">Download JSON</button><button data-a="prev">Preview</button>';
      d.appendChild(acts);
      var prev = document.createElement("div"); prev.className = "prev hide"; d.appendChild(prev);
      acts.addEventListener("click", function (e) {
        var btn = e.target.closest("button"); if (!btn) return; var a = btn.getAttribute("data-a"), nm = "consolidated-" + (i + 1), p2 = projected(i);
        if (a === "csv") { DX.download(nm + ".csv", DX.toCSV(p2.headers, p2.rows), "text/csv;charset=utf-8"); if (i === 0 && activeRecipe) { activeRecipe.export = "csv"; upsertRecipe(activeRecipe); } }
        else if (a === "json") { DX.download(nm + ".json", JSON.stringify(DX.toObjects(p2), null, 2), "application/json"); if (i === 0 && activeRecipe) { activeRecipe.export = "json"; upsertRecipe(activeRecipe); } }
        else { prev.innerHTML = ""; prev.classList.remove("hide"); prev.appendChild(previewTable(p2)); }
      });
      wrap.appendChild(d);
    });
  }

  /* ---------- saved joins: banner + list + replay ---------- */
  function bestTableBySig(tables, sig) {
    var best = null, bestScore = -1;
    (tables || []).forEach(function (t) {
      var names = colsOf(t).map(function (c) { return c.name; }); var set = {}; names.forEach(function (n) { set[n] = 1; });
      var hit = 0; sig.forEach(function (n) { if (set[n]) hit++; }); var score = hit / Math.max(1, sig.length);
      if (score > bestScore) { bestScore = score; best = t; }
    });
    return bestScore >= 0.5 ? best : null;
  }
  function runRecipe(rec) {
    chrome.tabs.query({}, function (tabs) {
      function findTab(u) { return (tabs || []).filter(function (t) { return scriptable(t.url) && normUrl(t.url) === u; })[0]; }
      var lt = findTab(rec.left.url), rt = findTab(rec.right.url);
      if (!lt || !rt) { showBanner("The saved pages aren't both open right now.", null); return; }
      chrome.permissions.request({ origins: originsOf([lt, rt]) }, function (granted) {
        if (!granted) { showBanner("Access not granted for those pages.", null); return; }
        Promise.all([extractOne(lt), extractOne(rt)]).then(function (ds) {
          cleanDatasets(ds, rec.clean);
          var L = bestTableBySig(ds[0].tables, rec.left.headerSig), R = bestTableBySig(ds[1].tables, rec.right.headerSig);
          if (!L || !R) { showBanner("Couldn't find the expected tables on those pages.", null); return; }
          rec.fillLeft && rec.fillLeft.length && (L = DX.fillDown(L, rec.fillLeft.map(function (n) { return idxOfName(L, n); }).filter(function (i) { return i >= 0; })));
          rec.fillRight && rec.fillRight.length && (R = DX.fillDown(R, rec.fillRight.map(function (n) { return idxOfName(R, n); }).filter(function (i) { return i >= 0; })));
          var keySpec = rec.keys.map(function (k) { return { left: idxOfName(L, k.leftCol), right: idxOfName(R, k.rightCol), mode: k.mode, leftFmt: k.leftFmt, rightFmt: k.rightFmt }; }).filter(function (k) { return k.left >= 0 && k.right >= 0; });
          if (!keySpec.length) { showBanner("Saved keys no longer match these pages.", null); return; }
          var joined = DX.joinTables(L, R, keySpec, { type: rec.join.type, firstMatchOnly: rec.join.firstMatchOnly, rightName: R.name || "R" });
          lastMerged = [joined]; outputCols = [rec.output || null]; activeRecipe = rec;
          lastSummary = [{ title: "LEFT · " + (lt.title || rec.left.url), tables: [L] }, { title: "RIGHT · " + (rt.title || rec.right.url), tables: [R] }];
          $("consolidateCard").classList.remove("hide");
          renderResults();
          var p = projected(0);
          if (rec.export === "json") DX.download("consolidated-1.json", JSON.stringify(DX.toObjects(p), null, 2), "application/json");
          else DX.download("consolidated-1.csv", DX.toCSV(p.headers, p.rows), "text/csv;charset=utf-8");
          showBanner("Re-ran saved join → " + joined.rowCount + " rows exported.", null);
        });
      });
    });
  }
  function showBanner(text, rec) {
    var el = $("banner"); if (!el) return; el.innerHTML = "";
    var span = document.createElement("span"); span.textContent = text; el.appendChild(span);
    if (rec) { var b = document.createElement("button"); b.className = "btn"; b.style.marginLeft = "10px"; b.textContent = "Run same join & export"; b.addEventListener("click", function () { runRecipe(rec); }); el.appendChild(b); }
    var x = document.createElement("button"); x.className = "btn ghost"; x.style.marginLeft = "8px"; x.textContent = "Dismiss"; x.addEventListener("click", function () { el.classList.add("hide"); }); el.appendChild(x);
    el.classList.remove("hide");
  }
  function checkMatch() {
    chrome.tabs.query({}, function (tabs) {
      var open = {}; (tabs || []).forEach(function (t) { if (scriptable(t.url)) open[normUrl(t.url)] = 1; });
      loadRecipes(function (list) {
        var qid = new URLSearchParams(location.search).get("recipe");
        var rec = null;
        if (qid) rec = list.filter(function (x) { return x.id === qid; })[0];
        if (!rec) rec = list.filter(function (x) { return x.sources.every(function (s) { return open[s]; }); }).sort(function (a, b) { return b.savedAt - a.savedAt; })[0];
        if (rec) showBanner("You joined these pages before (" + esc(rec.label) + ").", rec);
      });
    });
  }
  function renderSavedList() {
    var box = $("savedList"); if (!box) return; box.innerHTML = "";
    loadRecipes(function (list) {
      if (!list.length) { box.textContent = "No saved joins yet."; return; }
      list.slice().sort(function (a, b) { return b.savedAt - a.savedAt; }).forEach(function (rec) {
        var row = document.createElement("div"); row.className = "saved";
        var t = document.createElement("span"); t.textContent = rec.label + "  —  " + rec.sources.map(function (s) { return s.replace(/^https?:\/\//, ""); }).join("  +  ");
        var run = document.createElement("button"); run.className = "mini"; run.textContent = "Run"; run.addEventListener("click", function () { runRecipe(rec); });
        var del = document.createElement("button"); del.className = "mini"; del.textContent = "Delete"; del.addEventListener("click", function () { deleteRecipe(rec.id); });
        row.appendChild(t); row.appendChild(run); row.appendChild(del); box.appendChild(row);
      });
    });
  }

  /* ---------- wire up ---------- */
  $("loadTabs").addEventListener("click", loadTabs);
  $("filter").addEventListener("input", renderTabs);
  $("selAll").addEventListener("change", function () { Array.prototype.forEach.call($("tablist").querySelectorAll('input[type=checkbox]'), function (cb) { if (!cb.disabled) cb.checked = $("selAll").checked; }); updateCount(); });
  $("run").addEventListener("click", run);
  Array.prototype.forEach.call(document.querySelectorAll('input[name=mode]'), function (r) {
    r.addEventListener("change", function () { var join = document.querySelector('input[name=mode]:checked').value === "join"; $("joinPanel").classList.toggle("hide", !join); $("stackPanel").classList.toggle("hide", join); });
  });
  $("leftTable").addEventListener("change", refreshJoinCols);
  $("rightTable").addEventListener("change", refreshJoinCols);
  $("addKey").addEventListener("click", function () { addKeyRow(); });
  $("buildStack").addEventListener("click", buildStack);
  $("runJoin").addEventListener("click", runJoin);
  $("dlPdf").addEventListener("click", function () { var doc = DX.buildSummaryPDF(lastSummary, lastMerged); if (doc) doc.save("extraction-summary.pdf"); });

  renderSavedList();
  checkMatch();
})();
