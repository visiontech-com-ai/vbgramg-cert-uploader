/* =====================================================================
   Data Extractor — shared core (used by the popup and the consolidate page)
   - DX_EXTRACT(opts): SELF-CONTAINED page function, injected via
     chrome.scripting.executeScript. It must not reference anything outside
     itself (it is serialized and run in the target page's context).
   - DX.*: helpers that run in the extension page (CSV/JSON/merge/PDF/download).
   ===================================================================== */

/* ---- injected into the page; returns {url,title,tables:[...]} ---- */
function DX_EXTRACT(opts) {
  opts = opts || {};
  var out = [];
  function txt(el) { return (el ? (el.innerText || el.textContent || "") : "").replace(/\s+/g, " ").trim(); }

  function nearName(el, idx) {
    if (el.querySelector) { var cap = el.querySelector("caption"); if (cap && txt(cap)) return txt(cap); }
    if (el.getAttribute) { var al = el.getAttribute("aria-label") || el.getAttribute("summary") || el.getAttribute("title"); if (al && al.trim()) return al.trim(); }
    var p = el, hops = 0;
    while (p && hops < 6) {
      var s = p.previousElementSibling;
      while (s) {
        if (/^H[1-6]$/.test(s.tagName) && txt(s)) return txt(s);
        if (/^(P|DIV|SPAN|LEGEND|B|STRONG)$/.test(s.tagName)) { var t = txt(s); if (t && t.length <= 90) return t; }
        s = s.previousElementSibling;
      }
      p = p.parentElement; hops++;
    }
    return "Table " + (idx + 1);
  }

  function add(headers, rows, name, kind) {
    var cc = (headers && headers.length) || (rows[0] ? rows[0].length : 0);
    if (cc < 2 || !rows.length) return;
    if (!rows.some(function (r) { return r.some(function (v) { return v; }); })) return;
    out.push({ name: name, kind: kind, headers: headers || [], rows: rows, rowCount: rows.length, colCount: cc });
  }

  /* 1) real HTML tables */
  Array.prototype.slice.call(document.querySelectorAll("table")).forEach(function (tb, i) {
    var trs = Array.prototype.slice.call(tb.rows || []);
    if (!trs.length) return;
    var headers = [], rows = [], headerDone = false;
    if (tb.tHead && tb.tHead.rows.length) {
      headers = Array.prototype.map.call(tb.tHead.rows[tb.tHead.rows.length - 1].cells, function (c) { return txt(c); });
      headerDone = true;
    }
    trs.forEach(function (tr) {
      if (headerDone && tb.tHead && tr.parentNode === tb.tHead) return;
      var cells = Array.prototype.slice.call(tr.cells || []);
      if (!cells.length) return;
      var vals = cells.map(function (c) { return txt(c); });
      if (!headerDone && cells.every(function (c) { return c.tagName === "TH"; })) { headers = vals; headerDone = true; return; }
      rows.push(vals);
    });
    add(headers, rows, nearName(tb, i), "table");
  });

  /* 2) ARIA grids / role=table */
  if (opts.grids !== false) {
    Array.prototype.slice.call(document.querySelectorAll('[role="grid"],[role="table"],[role="treegrid"]')).forEach(function (g, i) {
      if (g.tagName === "TABLE") return;
      var rowEls = Array.prototype.slice.call(g.querySelectorAll('[role="row"]'));
      if (rowEls.length < 2) return;
      var headers = [], rows = [];
      rowEls.forEach(function (r) {
        var cs = Array.prototype.slice.call(r.querySelectorAll('[role="columnheader"],[role="rowheader"],[role="gridcell"],[role="cell"]'));
        if (!cs.length) return;
        var vals = cs.map(function (c) { return txt(c); });
        if (!headers.length && cs.every(function (c) { return /header/.test(c.getAttribute("role") || ""); })) { headers = vals; return; }
        rows.push(vals);
      });
      add(headers, rows, g.getAttribute("aria-label") || nearName(g, i), "aria-grid");
    });
  }

  /* 3) repeated-structure heuristic (conservative, opt-in) */
  if (opts.grids !== false) {
    var base = out.length;
    Array.prototype.slice.call(document.querySelectorAll("ul,ol,div,section,tbody")).forEach(function (c, i) {
      if (out.length - base > 25) return;
      if (c.closest && c.closest('table,[role="grid"],[role="table"],[role="treegrid"]')) return;
      var kids = Array.prototype.filter.call(c.children, function (k) { return k.nodeType === 1; });
      if (kids.length < 3) return;
      function sig(k) { return k.tagName + "." + (k.className || ""); }
      var s0 = sig(kids[0]);
      var same = kids.filter(function (k) { return sig(k) === s0; });
      if (same.length < Math.max(3, kids.length * 0.7)) return;
      function cellsOf(k) { return Array.prototype.filter.call(k.children, function (ch) { return ch.nodeType === 1 && txt(ch); }); }
      var counts = same.map(function (k) { return cellsOf(k).length; });
      var col = counts[0];
      if (col < 2) return;
      if (counts.filter(function (n) { return n === col; }).length < same.length * 0.8) return;
      var rows = same.map(function (k) { return cellsOf(k).map(function (ch) { return txt(ch); }); });
      add([], rows, nearName(c, i), "grid");
    });
  }

  /* dedupe identical captures (nested containers, etc.) */
  var seen = {}, dedup = [];
  out.forEach(function (t) {
    var s = t.kind + "|" + t.rowCount + "x" + t.colCount + "|" + (t.rows[0] || []).join("~") + "|" + (t.rows[t.rows.length - 1] || []).join("~");
    if (seen[s]) return; seen[s] = 1; dedup.push(t);
  });
  return { url: location.href, title: document.title, tables: dedup };
}

/* ---- helpers that run inside the extension page ---- */
window.DX = (function () {
  "use strict";
  function q(v) { v = (v == null ? "" : String(v)); return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  function toCSV(headers, rows) {
    var lines = [];
    if (headers && headers.length) lines.push(headers.map(q).join(","));
    rows.forEach(function (r) { lines.push(r.map(q).join(",")); });
    return "﻿" + lines.join("\r\n"); // BOM so Excel reads UTF-8
  }
  function uniqueHeaders(h, n) {
    if (!h || !h.length) { h = []; for (var i = 0; i < n; i++) h.push("col" + (i + 1)); }
    var used = {};
    return h.map(function (k, i) { k = (k || ("col" + (i + 1))); var b = k, c = 1; while (used[k]) { k = b + "_" + (++c); } used[k] = 1; return k; });
  }
  function toObjects(t) {
    var h = uniqueHeaders(t.headers, t.colCount || (t.rows[0] ? t.rows[0].length : 0));
    return t.rows.map(function (r) { var o = {}; h.forEach(function (k, i) { o[k] = r[i] == null ? "" : r[i]; }); return o; });
  }
  function download(filename, text, mime) {
    var blob = new Blob([text], { type: mime || "text/plain;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a"); a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1500);
  }
  function safeName(s) { return (s || "table").replace(/[^\w\-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "table"; }
  function headerSig(t) { return ((t.headers && t.headers.length) ? t.headers : ["cols", t.colCount]).join("|").toLowerCase(); }

  function mergeTables(datasets) {
    var groups = {}, order = [];
    datasets.forEach(function (d) {
      (d.tables || []).forEach(function (t) {
        var sig = headerSig(t);
        if (!groups[sig]) { groups[sig] = { headers: (t.headers || []).slice(), rows: [], sources: {} }; order.push(sig); }
        var g = groups[sig];
        if (!g.headers.length && t.headers && t.headers.length) g.headers = t.headers.slice();
        t.rows.forEach(function (r) { g.rows.push(r.concat([d.title || "", d.url || ""])); });
        g.sources[d.url || d.title] = 1;
      });
    });
    return order.map(function (sig) {
      var g = groups[sig];
      var dataCols = g.rows.length ? g.rows[0].length - 2 : g.headers.length;
      var headers = g.headers.slice();
      while (headers.length < dataCols) headers.push("col" + (headers.length + 1));
      headers = uniqueHeaders(headers, dataCols).concat(["_source", "_url"]);
      return { headers: headers, rows: g.rows, rowCount: g.rows.length, colCount: headers.length, sourceCount: Object.keys(g.sources).length };
    });
  }
  function numericStats(headers, rows) {
    var out = [];
    for (var c = 0; c < headers.length; c++) {
      var nums = [], filled = 0;
      for (var i = 0; i < rows.length; i++) {
        var raw = rows[i][c] == null ? "" : String(rows[i][c]);
        if (raw.trim() !== "") filled++;
        var v = raw.replace(/[,₹$\s%]/g, "");
        if (v !== "" && !isNaN(v)) nums.push(parseFloat(v));
      }
      if (rows.length && nums.length >= rows.length * 0.6 && nums.length > 0) {
        var sum = nums.reduce(function (a, b) { return a + b; }, 0);
        out.push({ col: headers[c], numeric: true, sum: sum, avg: sum / nums.length, count: nums.length });
      } else out.push({ col: headers[c], numeric: false, count: filled });
    }
    return out;
  }
  function fmt(n) { return (Math.round(n * 100) / 100).toLocaleString(); }

  function buildSummaryPDF(datasets, merged) {
    var J = window.jspdf && window.jspdf.jsPDF; if (!J) return null;
    var doc = new J({ unit: "pt", format: "a4" });
    var W = doc.internal.pageSize.getWidth(), M = 40, y = 48;
    function ln(t, size, bold, color) {
      doc.setFont("helvetica", bold ? "bold" : "normal"); doc.setFontSize(size || 10);
      doc.setTextColor(color ? color[0] : 30, color ? color[1] : 35, color ? color[2] : 46);
      doc.splitTextToSize(t, W - 2 * M).forEach(function (l) { if (y > 790) { doc.addPage(); y = 48; } doc.text(l, M, y); y += (size || 10) + 4; });
    }
    ln("VB-G RAM G — Table Extraction Report", 16, true, [34, 74, 170]); y += 2;
    ln("Generated " + new Date().toLocaleString() + "  ·  VisionTech Data Extractor", 9, false, [91, 100, 114]); y += 8;
    ln("Sources (" + datasets.length + ")", 12, true);
    datasets.forEach(function (d) { ln("- " + (d.title || d.url) + "  —  " + ((d.tables || []).length) + " table(s)", 9, false, [60, 66, 80]); if (d.url) ln("   " + d.url, 8, false, [130, 138, 150]); });
    y += 8;
    ln("Consolidated datasets (" + merged.length + ")", 12, true);
    merged.forEach(function (m, i) {
      y += 2; ln("Dataset " + (i + 1) + ": " + m.rowCount + " rows x " + (m.colCount - 2) + " cols  (from " + m.sourceCount + " source[s])", 10, true);
      numericStats(m.headers, m.rows).forEach(function (s) {
        if (s.col === "_source" || s.col === "_url") return;
        if (s.numeric) ln("   " + s.col + ":  sum " + fmt(s.sum) + "   avg " + fmt(s.avg) + "   (" + s.count + " values)", 9, false, [60, 66, 80]);
        else ln("   " + s.col + ":  " + s.count + " non-empty", 9, false, [120, 128, 140]);
      });
    });
    return doc;
  }

  /* ---- join / link helpers ---- */
  function fillDown(t, colIdxs) {
    var rows = t.rows.map(function (r) { return r.slice(); });
    (colIdxs || []).forEach(function (c) {
      var last = "";
      for (var i = 0; i < rows.length; i++) {
        var v = rows[i][c];
        if (v == null || String(v).trim() === "") rows[i][c] = last; else last = v;
      }
    });
    return { headers: t.headers, rows: rows, rowCount: rows.length, colCount: t.colCount, name: t.name, kind: t.kind };
  }
  function pad2(n) { n = String(n); return n.length < 2 ? "0" + n : n; }
  function normDate(v, fmt) {
    v = String(v == null ? "" : v).trim(); if (!v) return "";
    var iso = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); if (iso) return iso[1] + "-" + pad2(+iso[2]) + "-" + pad2(+iso[3]);
    var m = v.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/); if (!m) return v.toLowerCase();
    var a = +m[1], b = +m[2], y = +m[3]; if (y < 100) y += 2000; var day, mon;
    if (fmt === "dmy") { day = a; mon = b; }
    else if (fmt === "mdy") { day = b; mon = a; }
    else { if (a > 12) { day = a; mon = b; } else if (b > 12) { day = b; mon = a; } else { day = a; mon = b; } }
    return y + "-" + pad2(mon) + "-" + pad2(day);
  }
  function normName0(v) { return String(v == null ? "" : v).toLowerCase().replace(/\*/g, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim(); }
  function tokenSort(s) { return s.split(" ").filter(Boolean).sort().join(" "); }
  function normKey(v, mode, opts) {
    opts = opts || {};
    if (mode === "id") return String(v == null ? "" : v).toUpperCase().replace(/\s+/g, "").replace(/\d+/g, function (m) { return String(parseInt(m, 10)); });
    if (mode === "date") return normDate(v, opts.dateFormat || "auto");
    if (mode === "name") return normName0(v);
    return String(v == null ? "" : v).trim().toLowerCase();
  }
  function levenshtein(a, b) {
    a = a || ""; b = b || ""; var m = a.length, n = b.length; if (!m) return n; if (!n) return m;
    var prev = [], cur = [], i, j; for (j = 0; j <= n; j++) prev[j] = j;
    for (i = 1; i <= m; i++) { cur[0] = i; for (j = 1; j <= n; j++) { var cost = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1; cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost); } var t = prev; prev = cur; cur = t; }
    return prev[n];
  }
  function similar(a, b) { a = a || ""; b = b || ""; if (!a && !b) return 1; var mx = Math.max(a.length, b.length); if (!mx) return 1; return 1 - levenshtein(a, b) / mx; }
  function nameScore(a, b, thr) {
    var na = normName0(a), nb = normName0(b); if (na === nb) return 1;
    var sa = tokenSort(na), sb = tokenSort(nb); if (sa === sb) return 0.99;
    var s = Math.max(similar(na, nb), similar(sa, sb)); return s >= thr ? s : 0;
  }
  function joinTables(left, right, keySpec, opts) {
    opts = opts || {}; var thr = opts.threshold || 0.85, type = opts.type || "left", firstOnly = !!opts.firstMatchOnly;
    var lh = uniqueHeaders(left.headers, left.colCount || (left.rows[0] ? left.rows[0].length : 0));
    var rh = uniqueHeaders(right.headers, right.colCount || (right.rows[0] ? right.rows[0].length : 0));
    var hard = [], fuzzy = [];
    keySpec.forEach(function (k) { (k.mode === "name" ? fuzzy : hard).push(k); });
    var rprefix = (opts.rightName ? safeName(opts.rightName).slice(0, 14) : "R") + ".";
    // keep all right columns (prefixed) so matched key values stay visible
    var rOut = []; for (var c = 0; c < rh.length; c++) rOut.push(c);
    function hardKey(row, side) {
      return hard.map(function (k) {
        var idx = side === "l" ? k.left : k.right, fmt = side === "l" ? k.leftFmt : k.rightFmt;
        return normKey(row[idx], k.mode, { dateFormat: fmt });
      }).join("");
    }
    var index = {};
    right.rows.forEach(function (rr) { var kk = hard.length ? hardKey(rr, "r") : ""; (index[kk] || (index[kk] = [])).push(rr); });
    var outHeaders = lh.concat(rOut.map(function (c) { return rprefix + rh[c]; })).concat(["_matched"]);
    var outRows = [], matched = 0, unmatched = 0;
    left.rows.forEach(function (lr) {
      var bucket = hard.length ? (index[hardKey(lr, "l")] || []) : right.rows;
      var cands = [];
      bucket.forEach(function (rr) {
        if (fuzzy.length) {
          var ok = true, sc = 0;
          for (var f = 0; f < fuzzy.length; f++) { var s = nameScore(lr[fuzzy[f].left], rr[fuzzy[f].right], thr); if (!s) { ok = false; break; } sc += s; }
          if (ok) cands.push({ rr: rr, score: sc / fuzzy.length });
        } else cands.push({ rr: rr, score: 1 });
      });
      if (cands.length) {
        cands.sort(function (a, b) { return b.score - a.score; });
        (firstOnly ? [cands[0]] : cands).forEach(function (c) {
          outRows.push(lr.concat(rOut.map(function (ci) { return c.rr[ci]; })).concat(["yes"]));
        });
        matched++;
      } else { unmatched++; if (type === "left") outRows.push(lr.concat(rOut.map(function () { return ""; })).concat(["no"])); }
    });
    return { headers: outHeaders, rows: outRows, rowCount: outRows.length, colCount: outHeaders.length, sourceCount: 2,
      _stats: { matched: matched, unmatched: unmatched, leftRows: left.rows.length, rightRows: right.rows.length } };
  }

  /* ---- clean: report page -> analysis-ready grid ---- */
  var SECTION_LABEL = /^(villages?|gram\s*panchayat|panchayat|block|district|sansad|section|gp)$/i;
  var JUNK_FIRST = /^(sub ?total|total\b|rupees\b.*only|signature|report completed|payment by|bank name|wage list|state\s*[:：]|district\s*[:：]|block\s*[:：]|financial year|mustroll period|wage list agency|view wage list|signout|home$)/i;
  function cellStr(v) { return v == null ? "" : String(v).trim(); }
  function nonEmpty(r) { var c = 0; for (var i = 0; i < r.length; i++) if (cellStr(r[i]) !== "") c++; return c; }
  function firstText(r) { for (var i = 0; i < r.length; i++) { var v = cellStr(r[i]); if (v) return v; } return ""; }
  function isSerialRow(r) {
    var nums = []; for (var i = 0; i < r.length; i++) { var v = cellStr(r[i]); if (v) nums.push(v); }
    if (nums.length < Math.max(3, r.length - 2)) return false;
    for (var j = 0; j < nums.length; j++) if (String(j + 1) !== nums[j]) return false;
    return true;
  }
  function labelScore(r) { var lab = 0, tot = 0; for (var i = 0; i < r.length; i++) { var v = cellStr(r[i]); if (!v) continue; tot++; if (!/^[\d.,\/\-]+$/.test(v)) lab++; } return tot ? lab / tot : 0; }
  function cleanTable(t, opts) {
    opts = opts || {}; var promote = opts.promoteSections !== false, fillG = opts.fillGroups !== false;
    var all = ((t.headers && t.headers.length) ? [t.headers] : []).concat(t.rows.map(function (r) { return r.slice(); }));
    if (!all.length) return { headers: [], rows: [], rowCount: 0, colCount: 0, name: t.name, kind: t.kind };
    // dominant data width
    var freq = {}; all.forEach(function (r) { if (r.length >= 2) freq[r.length] = (freq[r.length] || 0) + 1; });
    var W = 0, best = -1; Object.keys(freq).forEach(function (k) { if (freq[k] > best) { best = freq[k]; W = +k; } });
    if (!W) W = all[0].length;
    // recover the real grid width when preamble rows outnumber a short data section
    // (e.g. a single-row wage list): if a clearly-labelled header row is wider, use it.
    var hcand = null;
    for (var i = 0; i < all.length; i++) { var hr = all[i]; if (hr.length < 3 || isSerialRow(hr) || labelScore(hr) < 0.7) continue; if (hr.length > (hcand ? hcand.length : 0)) hcand = hr; }
    if (hcand && hcand.length > W) W = hcand.length;
    // header = first W-wide label row (not the 1,2,3 numbering row)
    var header = null, headerIdx = -1;
    for (var j = 0; j < all.length; j++) { if (all[j].length === W && !isSerialRow(all[j]) && labelScore(all[j]) >= 0.7) { header = all[j].slice(); headerIdx = j; break; } }
    // scan rows: promote section bands, drop junk, keep W-wide data rows
    var bandRe = /^(.*?)\s*[:：]\s*(.+)$/;
    var sectionLabels = [], cur = {}, dataRows = [], secPerRow = [];
    for (var r0 = 0; r0 < all.length; r0++) {
      if (r0 === headerIdx) continue;
      var row = all[r0], ne = nonEmpty(row);
      if (ne === 0) continue;
      if (row.length !== W) { // candidate band / preamble / summary
        if (promote && ne <= 2) {
          var m = firstText(row).match(bandRe);
          if (m) {
            var label = m[1].trim().replace(/\s+/g, " "), val = m[2].trim().replace(/\s{2,}.*$/, "").trim();
            if (SECTION_LABEL.test(label) && val) { if (sectionLabels.indexOf(label) < 0) sectionLabels.push(label); cur[label] = val; }
          }
        }
        continue; // non-W rows never become data
      }
      if (isSerialRow(row)) continue;
      if (JUNK_FIRST.test(firstText(row))) continue;
      if (header && row.join("") === header.join("")) continue; // repeated header
      dataRows.push(row.slice()); secPerRow.push(sectionLabels.map(function (l) { return cur[l] || ""; }));
    }
    // headers (sections first, then real/synth columns)
    var base = (header ? header.slice() : []);
    for (var h = base.length; h < W; h++) base.push("col" + (h + 1));
    base = base.slice(0, W).map(function (x, idx) { return cellStr(x) || ("col" + (idx + 1)); });
    var outHeaders = sectionLabels.concat(base);
    var outRows = dataRows.map(function (row, idx) { return secPerRow[idx].concat(row); });
    // fill down leading group columns: skip leading fully-populated cols, then fill the run of
    // blank-with-value-above group cols, stopping at the next fully-populated col (leaves true empties)
    if (fillG && outRows.length) {
      var dc = sectionLabels.length; // data cols start here
      function colBlank(ci) { for (var i2 = 0; i2 < outRows.length; i2++) if (cellStr(outRows[i2][ci]) === "") return true; return false; }
      function valueAboveAll(ci) { var seen = false; for (var i2 = 0; i2 < outRows.length; i2++) { if (cellStr(outRows[i2][ci]) === "") { if (!seen) return false; } else seen = true; } return true; }
      var ci = dc;
      while (ci < dc + W && !colBlank(ci)) ci++;                        // skip leading full columns (S.No, keys)
      while (ci < dc + W && colBlank(ci) && valueAboveAll(ci)) {        // fill the group-column run
        var last = ""; for (var k = 0; k < outRows.length; k++) { if (cellStr(outRows[k][ci]) === "") outRows[k][ci] = last; else last = outRows[k][ci]; }
        ci++;
      }
    }
    return { headers: outHeaders, rows: outRows, rowCount: outRows.length, colCount: outHeaders.length, name: t.name, kind: t.kind };
  }

  /* ---- output helpers ---- */
  function projectColumns(t, orderedNames) {
    var H = uniqueHeaders(t.headers, t.colCount || (t.rows[0] ? t.rows[0].length : 0));
    if (!orderedNames || !orderedNames.length) return { headers: H, rows: t.rows, rowCount: t.rowCount, colCount: H.length, name: t.name };
    var idx = orderedNames.map(function (n) { return H.indexOf(n); }).filter(function (i) { return i >= 0; });
    var headers = idx.map(function (i) { return H[i]; });
    var rows = t.rows.map(function (r) { return idx.map(function (i) { return r[i]; }); });
    return { headers: headers, rows: rows, rowCount: rows.length, colCount: headers.length, name: t.name };
  }
  function normUrl(u) { try { var x = new URL(u); return (x.origin + x.pathname).replace(/\/+$/, "").toLowerCase(); } catch (e) { return String(u || "").split(/[?#]/)[0].toLowerCase(); } }

  /* ---- caste / wage-amount breakup ---- */
  function colIndex(table, re) { var H = table.headers || []; for (var i = 0; i < H.length; i++) if (re.test(String(H[i] || ""))) return i; return -1; }
  function bucketCaste(v) { var s = String(v == null ? "" : v).trim().toUpperCase(); if (s === "SC") return "SC"; if (s === "ST") return "ST"; return "Others"; }
  function buildCasteMap(regTable) {
    var cardIdx = colIndex(regTable, /job\s*card\s*(no|number)/i), casteIdx = colIndex(regTable, /caste/i);
    var map = {}; if (cardIdx < 0 || casteIdx < 0) return map;
    regTable.rows.forEach(function (r) {
      var raw = r[cardIdx]; if (!raw) return; var id = normKey(raw, "id"); if (!id) return;
      var caste = String(r[casteIdx] == null ? "" : r[casteIdx]).trim();
      if (caste && !map[id]) map[id] = caste;
    });
    return map;
  }
  function wageCasteBreakup(wageTable, casteMap) {
    var cardIdx = colIndex(wageTable, /job\s*card/i);
    var amtIdx = colIndex(wageTable, /amount\s*of\s*wage/i); if (amtIdx < 0) amtIdx = colIndex(wageTable, /amount/i);
    var res = { others: 0, sc: 0, st: 0, total: 0, missing: 0, missingCards: [], cardIdx: cardIdx, amtIdx: amtIdx };
    if (cardIdx < 0 || amtIdx < 0) return res;
    wageTable.rows.forEach(function (r) {
      var amtRaw = String(r[amtIdx] == null ? "" : r[amtIdx]).replace(/[^\d.\-]/g, "");
      if (amtRaw === "" || isNaN(parseFloat(amtRaw))) return; // skip repeated headers / blank / non-data rows
      var amt = parseFloat(amtRaw) || 0;
      var id = normKey(r[cardIdx], "id"); var caste = (casteMap || {})[id];
      if (caste == null) { res.missing++; if (res.missingCards.indexOf(r[cardIdx]) < 0) res.missingCards.push(r[cardIdx]); }
      var b = bucketCaste(caste);
      if (b === "SC") res.sc += amt; else if (b === "ST") res.st += amt; else res.others += amt;
      res.total += amt;
    });
    return res;
  }

  return {
    extractFn: DX_EXTRACT, toCSV: toCSV, toObjects: toObjects, download: download,
    safeName: safeName, mergeTables: mergeTables, numericStats: numericStats, buildSummaryPDF: buildSummaryPDF,
    fillDown: fillDown, normKey: normKey, similar: similar, joinTables: joinTables, cleanTable: cleanTable,
    projectColumns: projectColumns, normUrl: normUrl,
    bucketCaste: bucketCaste, buildCasteMap: buildCasteMap, wageCasteBreakup: wageCasteBreakup
  };
})();
