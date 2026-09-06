/* On-page caste-wise wage-list amount breakup.
   - Registration Application Register page  -> scrape + cache Job Card -> Caste in storage.local
   - Wage List page                          -> floating button -> modal breakup (+ copy row)
   Runs in every frame on the portal; each frame self-detects its page type. */
(function () {
  "use strict";
  if (window.__DX_WBK) return; window.__DX_WBK = true;
  var DXk = window.DX; if (!DXk || typeof DX_EXTRACT !== "function") return;

  var IS_WAGE = false;
  var JC_RE = /WB-\d{2}-\d{3}-\d{3}-\d{3}\/\d+/;
  function pageText() { try { return (document.body && document.body.innerText) || ""; } catch (e) { return ""; } }
  function hasJobCardRow() { try { return Array.prototype.some.call(document.querySelectorAll("tr"), function (tr) { return JC_RE.test(tr.innerText || ""); }); } catch (e) { return false; } }
  function statedTotal() { var t = pageText(), mx = 0, m, re = /total[^0-9]{0,15}([0-9][0-9,]*)/gi; while ((m = re.exec(t))) { var n = parseFloat(m[1].replace(/,/g, "")) || 0; if (n > mx) mx = n; } return mx; }
  function hasCol(t, re) { return (t.headers || []).some(function (h) { return re.test(String(h || "")); }); }
  function allCleanTables() { var r = DX_EXTRACT({ grids: true }); return (r.tables || []).map(function (t) { return DXk.cleanTable(t, {}); }).filter(function (t) { return t.rowCount > 0; }); }
  // Union of EVERY data row on the page (read straight from the DOM), then cleaned into one grid.
  // A wage list is often split across several sibling/nested <table>s where only one carries the
  // header; collecting all leaf <tr> rows recovers every row regardless of table structure.
  function rawUnion() {
    var rows = [];
    Array.prototype.forEach.call(document.querySelectorAll("tr"), function (tr) {
      if (tr.querySelector("table")) return;                               // layout row wrapping a nested table
      if (tr.closest && tr.closest("#dxwbk-ov")) return;                    // ignore our own modal
      var vals = [];
      for (var i = 0; i < tr.children.length; i++) { var c = tr.children[i]; if (c.tagName === "TD" || c.tagName === "TH") vals.push((c.innerText || c.textContent || "").replace(/\s+/g, " ").trim()); }
      if (vals.length) rows.push(vals);
    });
    var f = {}, W = 0; rows.forEach(function (x) { if (x.length >= 2) f[x.length] = (f[x.length] || 0) + 1; });
    Object.keys(f).forEach(function (k) { if (f[k] > (f[W] || 0)) W = +k; });
    return DXk.cleanTable({ headers: [], rows: rows, colCount: W, name: "page" }, {});
  }
  function fmt(n) { try { return Number(n).toLocaleString("en-IN"); } catch (e) { return String(n); } }

  /* ---------- shared styles ---------- */
  function injectCss() {
    if (document.getElementById("dxwbk-css")) return;
    var s = document.createElement("style"); s.id = "dxwbk-css";
    s.textContent =
      "#dxwbk-btn{position:fixed;right:18px;bottom:18px;z-index:2147483646;background:#1b3a86;color:#fff;border:0;border-radius:24px;" +
      "padding:11px 16px;font:600 13px 'Segoe UI',Arial,sans-serif;box-shadow:0 3px 12px rgba(0,0,0,.28);cursor:pointer}" +
      "#dxwbk-btn:hover{background:#224aaa}" +
      "#dxwbk-ov{position:fixed;inset:0;z-index:2147483647;background:rgba(15,20,30,.45);display:flex;align-items:center;justify-content:center}" +
      "#dxwbk-card{background:#fff;border-radius:12px;max-width:860px;width:94%;font:14px 'Segoe UI',Arial,sans-serif;color:#1a1f2e;box-shadow:0 12px 40px rgba(0,0,0,.35);overflow:hidden}" +
      ".dxwbk-scroll{overflow-x:auto}" +
      "#dxwbk-hd{background:#1b3a86;color:#fff;padding:12px 16px;display:flex;align-items:center;justify-content:space-between}" +
      "#dxwbk-hd b{font-size:15px}#dxwbk-x{background:none;border:0;color:#fff;font-size:20px;cursor:pointer;line-height:1}" +
      "#dxwbk-bd{padding:16px}" +
      ".dxwbk-tbl{border-collapse:collapse;width:100%;font-size:13px;margin-top:6px}" +
      ".dxwbk-tbl th,.dxwbk-tbl td{border:1px solid #d7deea;padding:7px 12px;text-align:center;white-space:nowrap}" +
      ".dxwbk-tbl th{background:#eef2fb;color:#1b3a86;font-weight:700}" +
      ".dxwbk-row{display:flex;gap:10px;align-items:center;margin:12px 0 2px;flex-wrap:wrap}" +
      ".dxwbk-copy{background:#137333;color:#fff;border:0;border-radius:8px;padding:9px 14px;font-weight:600;cursor:pointer;display:inline-flex;gap:7px;align-items:center}" +
      ".dxwbk-copy:hover{filter:brightness(1.07)}" +
      ".dxwbk-warn{color:#9a5a12;background:#fdf0e3;border:1px solid #f4d9b8;border-radius:8px;padding:8px 10px;font-size:12.5px;margin-top:10px}" +
      ".dxwbk-ok{color:#137333;background:#e7f4ea;border:1px solid #b6dcc0;border-radius:8px;padding:8px 10px;font-size:12.5px;margin-top:10px}" +
      ".dxwbk-lbl{font-size:12px;color:#5b6472}.dxwbk-in{padding:6px 8px;border:1px solid #c7cfdd;border-radius:7px;font-size:13px;min-width:220px}" +
      ".dxwbk-foot{margin-top:14px;padding-top:9px;border-top:1px solid #eef1f7;text-align:center;font-size:11.5px;color:#7a8290}.dxwbk-foot b{color:#1b3a86}" +
      "#dxwbk-toast{position:fixed;right:18px;bottom:18px;z-index:2147483646;background:#137333;color:#fff;padding:10px 14px;border-radius:8px;" +
      "font:600 12.5px 'Segoe UI',Arial,sans-serif;box-shadow:0 3px 12px rgba(0,0,0,.28)}";
    (document.head || document.documentElement).appendChild(s);
  }
  function toast(msg) {
    injectCss(); var t = document.getElementById("dxwbk-toast"); if (t) t.remove();
    t = document.createElement("div"); t.id = "dxwbk-toast"; t.textContent = msg;
    document.body.appendChild(t); setTimeout(function () { if (t) t.remove(); }, 4000);
  }
  function closeModal() { var o = document.getElementById("dxwbk-ov"); if (o) o.remove(); if (IS_WAGE) showButton(); }
  function modal(title, buildBody) {
    injectCss();
    var old = document.getElementById("dxwbk-ov"); if (old) old.remove();
    var bt = document.getElementById("dxwbk-btn"); if (bt) bt.style.display = "none";
    var ov = document.createElement("div"); ov.id = "dxwbk-ov";
    ov.addEventListener("click", function (e) { if (e.target === ov) closeModal(); });
    var card = document.createElement("div"); card.id = "dxwbk-card";
    var hd = document.createElement("div"); hd.id = "dxwbk-hd";
    var b = document.createElement("b"); b.textContent = title; var x = document.createElement("button"); x.id = "dxwbk-x"; x.textContent = "✕"; x.addEventListener("click", closeModal);
    hd.appendChild(b); hd.appendChild(x);
    var bd = document.createElement("div"); bd.id = "dxwbk-bd"; buildBody(bd);
    card.appendChild(hd); card.appendChild(bd); ov.appendChild(card); document.body.appendChild(ov);
  }

  /* ---------- register page: cache caste map ---------- */
  function cacheRegister() {
    try {
      var reg = rawUnion();
      if (!hasCol(reg, /job\s*card\s*(no|number)/i) || !hasCol(reg, /caste/i)) return;
      var map = DXk.buildCasteMap(reg); var n = Object.keys(map).length; if (!n) return;
      chrome.storage.local.get("dxCasteMap", function (d) {
        var cur = (d && d.dxCasteMap) || {}; for (var k in map) cur[k] = map[k];
        chrome.storage.local.set({ dxCasteMap: cur, dxCasteMeta: { count: Object.keys(cur).length, savedAt: Date.now() } }, function () {
          toast("Caste register saved — " + n + " job cards (" + Object.keys(cur).length + " total).");
        });
      });
    } catch (e) { }
  }

  /* ---------- wage page: button + breakup ---------- */
  function showButton() {
    injectCss();
    var btn = document.getElementById("dxwbk-btn");
    if (!btn) { btn = document.createElement("button"); btn.id = "dxwbk-btn"; btn.textContent = "⚖ Caste breakup"; document.body.appendChild(btn); }
    btn.onclick = doBreakup;
    btn.style.display = "";
  }
  function promptOpenRegister(missingCount) {
    modal("Registration register needed", function (bd) {
      var p = document.createElement("p");
      p.textContent = missingCount
        ? (missingCount + " job card(s) in this wage list aren't in the saved register. Open the Registration Application Register for this GP once — it saves automatically — then click again.")
        : "The caste register isn't saved yet. Open the Registration Application Register once (it saves automatically), then click Caste breakup again.";
      p.style.margin = "0 0 6px"; bd.appendChild(p);
      var hint = document.createElement("div"); hint.className = "dxwbk-lbl"; hint.textContent = "Analytics & Reports → Registration Application Register."; bd.appendChild(hint);
    });
  }
  function doBreakup() {
    // union all page rows into one grid (a wage list can be split across several nested tables)
    var wage = rawUnion();
    if (!hasCol(wage, /job\s*card/i) || !hasCol(wage, /amount/i)) { modal("Wage list breakup", function (bd) { bd.textContent = "Couldn't find the wage list table on this page."; }); return; }
    var T = pageText();
    var wlno = ((T.match(/Wage\s*List\s*No\.?\s*:\s*-\s*([A-Za-z0-9]+)/i) || [])[1])   // "Wage List No.:- <no>" (report body)
      || ((T.match(/\b(\d{6,}WL\d{2,})\b/i) || [])[1])                                  // fallback: the WL-number pattern
      || "";
    chrome.storage.local.get("dxCasteMap", function (d) {
      var map = (d && d.dxCasteMap) || {};
      if (!Object.keys(map).length) { promptOpenRegister(0); return; }
      var b = DXk.wageCasteBreakup(wage, map);
      showBreakup(wlno, b);
    });
  }
  function showBreakup(wlno, b) {
    modal("Wage list amount breakup — caste-wise", function (bd) {
      var tbl = document.createElement("table"); tbl.className = "dxwbk-tbl";
      var heads = ["Wagelist No", "Oth Amt", "SC Amt", "ST Amt", "Total Amt"];
      var thead = document.createElement("tr"); heads.forEach(function (h) { var th = document.createElement("th"); th.textContent = h; thead.appendChild(th); }); tbl.appendChild(thead);
      var tr = document.createElement("tr");
      tr.appendChild(td(wlno));
      tr.appendChild(td(fmt(b.others))); tr.appendChild(td(fmt(b.sc))); tr.appendChild(td(fmt(b.st))); tr.appendChild(td(fmt(b.total)));
      tbl.appendChild(tr);
      var scroll = document.createElement("div"); scroll.className = "dxwbk-scroll"; scroll.appendChild(tbl); bd.appendChild(scroll);
      function td(v) { var c = document.createElement("td"); c.textContent = v; return c; }

      var actions = document.createElement("div"); actions.className = "dxwbk-row";
      var copy = document.createElement("button"); copy.className = "dxwbk-copy"; copy.innerHTML = "📋 <span>Copy row</span>";
      copy.addEventListener("click", function () {
        var line = [wlno, Math.round(b.others), Math.round(b.sc), Math.round(b.st), Math.round(b.total)].join("\t");
        navigator.clipboard.writeText(line).then(function () { copy.querySelector("span").textContent = "Copied ✓"; setTimeout(function () { copy.querySelector("span").textContent = "Copy row"; }, 1500); },
          function () { copy.querySelector("span").textContent = "Copy failed"; });
      });
      actions.appendChild(copy);
      var note = document.createElement("span"); note.className = "dxwbk-lbl"; note.textContent = "Copies the data row only (tab-separated) — paste into a spreadsheet."; actions.appendChild(note);
      bd.appendChild(actions);

      var stated = statedTotal();
      if (stated > 0) {
        var v = document.createElement("div");
        if (Math.round(stated) !== Math.round(b.total)) { v.className = "dxwbk-warn"; v.textContent = "⚠ Validation: computed total ₹" + fmt(b.total) + " does NOT match the wage-list total ₹" + fmt(stated) + " shown on the page. The breakup may be incomplete — reload the full page and try again."; }
        else { v.className = "dxwbk-ok"; v.textContent = "✓ Validation: total ₹" + fmt(b.total) + " matches the wage-list total on the page."; }
        bd.appendChild(v);
      }
      if (b.missing > 0) {
        var w = document.createElement("div"); w.className = "dxwbk-warn";
        w.textContent = b.missing + " job card(s) weren't found in the saved register and were counted under Others. Open the Registration Application Register for this GP to refresh.";
        bd.appendChild(w);
      }
      var foot = document.createElement("div"); foot.className = "dxwbk-foot";
      foot.innerHTML = '<b>VisionTech</b> — Vision Technologies &amp; Robotics · VB-G RAM G utilities';
      bd.appendChild(foot);
    });
  }

  /* ---------- detect page type ---------- */
  // Fire only when the report has actually rendered — i.e. "Download In Excel" appears (or job-card
  // rows exist). Avoids acting on half-loaded pages / unrelated tables, and only in the frame that
  // holds the wage data.
  function reportReady() { return /Download\s*In\s*Excel/i.test(pageText()) || hasJobCardRow(); }
  function classifyAndFire() {
    var t = pageText();
    if (/Registration Application Register/i.test(t) && hasJobCardRow()) { cacheRegister(); return true; }
    if (/Wage\s*List/i.test(t) && /Wage\s*List\s*No/i.test(t) && hasJobCardRow()) { IS_WAGE = true; doBreakup(); return true; }
    return false;
  }
  var fired = false, obs = null;
  function tryFire() { if (fired) return; if (!reportReady()) return; if (classifyAndFire()) { fired = true; if (obs) { obs.disconnect(); obs = null; } } }
  try {
    tryFire();
    if (!fired) {
      obs = new MutationObserver(tryFire);
      obs.observe(document.documentElement || document.body, { childList: true, subtree: true, characterData: true });
      setTimeout(function () { if (obs) { obs.disconnect(); obs = null; } }, 90000); // stop watching after 90s
    }
  } catch (e) { }
})();
