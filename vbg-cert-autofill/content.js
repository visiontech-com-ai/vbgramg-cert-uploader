/* =====================================================================
   VB-G RAM G  Certificate Auto-Fill
   In-page panel on work_entry.aspx that attaches the 8 certificate PDFs
   from a folder and fills all 8 blocks with the signing-authority details
   set in the extension's settings (toolbar icon). DPR and Convergence are
   set to "Yes" automatically so their uploads are included.
   ===================================================================== */
(function () {
  "use strict";

  var PFX = "ctl00_ContentPlaceHolder1_";

  // Only run on the real Work Entry form (avoids other frames/pages).
  if (!document.getElementById(PFX + "File_pre_estimation_file_name")) return;
  // Guard against double-injection.
  if (document.getElementById("vbg-cert-autofill-host")) return;

  /* ---- The 8 certificate blocks, in the order shown on the page ---- */
  var BLOCKS = [
    {
      num: 1, title: "Pre-estimation / Feasibility / Utility report",
      file: "File_pre_estimation_file_name",
      f: { name: "txtpre_estimation_person_name", desig: "txtpre_estimation_designation", dept: "txtpre_estimation_department", mob: "txtpre_estimation_mobile", email: "txtpre_estimation_emailid" },
      keys: ["pre", "estimation", "feasib", "utility"]
    },
    {
      num: 2, title: "No duplication / double-counting (BDO)",
      file: "File_double_wrks_file_name",
      f: { name: "txtdouble_wrks_person_name", desig: "txtdouble_wrks_designation", dept: "txtdouble_wrks_department", mob: "txtdouble_wrks_mobile", email: "txtdouble_wrks_emailid" },
      keys: ["duplicat", "double", "count"]
    },
    {
      num: 3, title: "Non-splitting of work (BDO)",
      file: "File_spliting_wrk_fie_name",
      f: { name: "non_spliting_person_name", desig: "txtnon_spliting_wrk_designation", dept: "txtnon_spliting_wrks_department", mob: "txtnon_spliting_wrks_Mobile", email: "txtnon_spliting_wrk_Email" },
      keys: ["split"]
    },
    {
      num: 4, title: "Permissible category of MGNREGA (BDO)",
      file: "File_permissible_wrk",
      f: { name: "txtpermissible_wrk_person_name", desig: "txtpermissible_wrk_designation", dept: "txtpermissible_wrk_department", mob: "txtpermissible_wrk_mobile", email: "txtpermissible_wrk_emailid" },
      keys: ["permiss"]
    },
    {
      num: 5, title: "Beneficiary selection per Para 5 (BDO)",
      file: "File_beneficiary_file_name",
      f: { name: "txtbeneficiary_person_name", desig: "txtbeneficiary_designation", dept: "txtbeneficiary_department", mob: "txtbeneficiary_mobile", email: "txtbeneficiary_emailid" },
      keys: ["benefic", "para"]
    },
    {
      num: 6, title: "DPR preparation",
      file: "File_dpr_prep_file_name",
      f: { name: "txtdpr_prep_person_name", desig: "txtdpr_prep_designation", dept: "txtdpr_prep_department", mob: "txtdpr_prep_mobile", email: "txtdpr_prep_emailid" },
      keys: ["dpr"],
      radio: "rdodpr_preparation"   // auto-set to Yes
    },
    {
      num: 7, title: "Convergence department clearance",
      file: "File_conv_dept_file_name",
      f: { name: "txtconv_dept_person_name", desig: "txtconv_dept_designation", dept: "txtconv_dept", mob: "txtconv_dept_mobile", email: "txtconv_dept_emailid" },
      keys: ["converg"],
      radio: "rdoConvergenece"      // auto-set to Yes
    },
    {
      num: 8, title: "Adherence to non-negotiables (BDO)",
      file: "File_non_negotiables_file_name",
      f: { name: "txtnon_negotiables_person_name", desig: "txtnon_negotiables_designation", dept: "txtnon_negotiables_department", mob: "txtnon_negotiables_mobile", email: "txtnon_negotiables_emailid" },
      keys: ["negoti"]
    }
  ];
  var MAXN = BLOCKS.length; // 8

  var DEFAULTS = { name: "", desig: "", dept: "", mob: "", email: "" };
  var settings = Object.assign({}, DEFAULTS);
  var picked = [];      // Array<File> of picked .pdf files
  var mapping = {};     // block.num -> File (matched)

  var LIMIT_BYTES = 1024 * 1024;   // server limit: 1 MB per PDF (a 980 KB file was accepted)
  var TARGET_BYTES = 900 * 1024;   // compression aims below this for headroom
  var compressedInfo = {};         // block.num -> original size (if we compressed it)
  var busy = false;                // true while compressing

  // pdf.js worker (bundled resource)
  try {
    if (window.pdfjsLib && chrome.runtime && chrome.runtime.getURL) {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL("lib/pdf.worker.min.js");
    }
  } catch (e) {}
  function libsReady() {
    return !!(window.pdfjsLib && window.jspdf && window.jspdf.jsPDF);
  }

  function fmtSize(b) {
    if (b >= 1048576) return (b / 1048576).toFixed(2) + " MB";
    if (b >= 1024) return Math.round(b / 1024) + " KB";
    return b + " B";
  }
  function oversizedBlocks() {
    var a = [];
    BLOCKS.forEach(function (b) {
      var f = mapping[b.num];
      if (f && f.size > LIMIT_BYTES) a.push(b.num);
    });
    return a;
  }

  /* ---------------------- DOM / form helpers ---------------------- */
  function byId(id) { return document.getElementById(PFX + id); }

  function setValue(el, val) {
    if (!el) return false;
    try {
      var proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      var setter = Object.getOwnPropertyDescriptor(proto, "value").set;
      setter.call(el, val);
    } catch (e) { el.value = val; }
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  function attachFile(el, file) {
    if (!el || !file) return false;
    try {
      var dt = new DataTransfer();
      dt.items.add(file);
      el.files = dt.files;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return el.files && el.files.length === 1;
    } catch (e) { return false; }
  }

  // radios: <name>_0 = Yes(Y), <name>_1 = No(N). We always set Yes.
  function setRadioYes(radioName) {
    var el = document.getElementById(PFX + radioName + "_0");
    if (!el) return false;
    if (!el.checked) { el.checked = true; el.click(); } // runs page's toggleFileUpload* handler
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  /* ---------------------- filename matching ---------------------- */
  function baseName(f) {
    var n = f.name || "";
    var slash = Math.max(n.lastIndexOf("/"), n.lastIndexOf("\\"));
    return (slash >= 0 ? n.slice(slash + 1) : n);
  }
  function isPdf(f) { return /\.pdf$/i.test(baseName(f)); }

  // Pull the block number (1..MAXN) out of a filename, wherever it sits.
  function seqOf(f) {
    var nm = baseName(f).toLowerCase().replace(/\.pdf$/i, "");
    nm = nm.replace(/of[\s_.-]*\d+/g, " "); // drop "of 8" style totals
    var groups = nm.match(/\d+/g);
    if (!groups) return null;
    var last = null;
    for (var i = 0; i < groups.length; i++) {
      var v = parseInt(groups[i], 10);
      if (v >= 1 && v <= MAXN) last = v;
    }
    return last;
  }

  function matchFiles() {
    mapping = {};
    var used = {};
    var seqs = picked.map(seqOf);

    // Pass 1: match by the 1..MAXN number found anywhere in the filename
    BLOCKS.forEach(function (b) {
      for (var i = 0; i < picked.length; i++) {
        if (used[i]) continue;
        if (seqs[i] === b.num) { mapping[b.num] = picked[i]; used[i] = true; break; }
      }
    });
    // Pass 2: fill any gaps by keyword (dpr, split, permissible, ...)
    BLOCKS.forEach(function (b) {
      if (mapping[b.num]) return;
      for (var i = 0; i < picked.length; i++) {
        if (used[i]) continue;
        var nm = baseName(picked[i]).toLowerCase();
        for (var k = 0; k < b.keys.length; k++) {
          if (nm.indexOf(b.keys[k]) !== -1) { mapping[b.num] = picked[i]; used[i] = true; return; }
        }
      }
    });
    renderRows();
  }

  /* ---------------------- compression (scanned PDFs) ----------------------
     Oversized scanned PDFs are rasterised page-by-page with pdf.js and
     re-encoded as JPEG-in-PDF with jsPDF, stepping down resolution/quality
     until the result fits. Only files over the limit are touched, so files
     that already pass keep their original quality. ---------------------- */
  function buildPdf(JsPDF, canvases, dims, q) {
    var doc = null;
    for (var i = 0; i < canvases.length; i++) {
      var w = dims[i].w, h = dims[i].h;
      var durl = canvases[i].toDataURL("image/jpeg", q);
      if (i === 0) doc = new JsPDF({ unit: "pt", format: [w, h], orientation: w > h ? "l" : "p", compress: true });
      else doc.addPage([w, h], w > h ? "l" : "p");
      doc.addImage(durl, "JPEG", 0, 0, w, h, undefined, "FAST");
    }
    return doc.output("blob");
  }

  function cleanup(pdf, canvases) {
    try { if (pdf) { pdf.cleanup(); if (pdf.destroy) pdf.destroy(); } } catch (e) {}
    if (canvases) canvases.forEach(function (c) { c.width = c.height = 0; });
  }

  function compressPdf(file) {
    var scales = [2.0, 1.5, 1.15, 0.9];
    var quals = [0.72, 0.6, 0.5, 0.42];
    var JsPDF = window.jspdf.jsPDF;
    return file.arrayBuffer().then(function (buf) {
      var task = window.pdfjsLib.getDocument({ data: buf, disableAutoFetch: true, disableStream: true });
      return task.promise.then(function (pdf) {
        var n = pdf.numPages;
        var best = null;

        function tryScale(si) {
          if (si >= scales.length) {
            cleanup(pdf, null);
            if (best && best.size <= LIMIT_BYTES) return new File([best], file.name, { type: "application/pdf" });
            return null;
          }
          var canvases = [], dims = [];
          function renderPage(p) {
            if (p > n) return Promise.resolve();
            return pdf.getPage(p).then(function (page) {
              var vp1 = page.getViewport({ scale: 1 });
              var vp = page.getViewport({ scale: scales[si] });
              var cv = document.createElement("canvas");
              cv.width = Math.max(1, Math.ceil(vp.width));
              cv.height = Math.max(1, Math.ceil(vp.height));
              var ctx = cv.getContext("2d");
              return page.render({ canvasContext: ctx, viewport: vp }).promise.then(function () {
                canvases.push(cv); dims.push({ w: vp1.width, h: vp1.height });
                return renderPage(p + 1);
              });
            });
          }
          return renderPage(1).then(function () {
            for (var qi = 0; qi < quals.length; qi++) {
              var blob = buildPdf(JsPDF, canvases, dims, quals[qi]);
              if (blob.size <= TARGET_BYTES) {
                cleanup(pdf, canvases);
                return new File([blob], file.name, { type: "application/pdf" });
              }
              if (!best || blob.size < best.size) best = blob;
            }
            canvases.forEach(function (c) { c.width = c.height = 0; });
            return tryScale(si + 1);
          });
        }
        return tryScale(0);
      });
    });
  }

  function processOversized() {
    var targets = BLOCKS.filter(function (b) {
      return mapping[b.num] && mapping[b.num].size > LIMIT_BYTES;
    });
    if (!targets.length) { finalizeStatus(); return; }
    if (!libsReady()) { finalizeStatus(); return; } // no compressor -> just block

    busy = true; updateFillState();

    function next(i) {
      if (i >= targets.length) { busy = false; renderRows(); finalizeStatus(); return; }
      var b = targets[i], f = mapping[b.num];
      status("Compressing block " + b.num + " (" + baseName(f) + ", " + fmtSize(f.size) + ")… " +
        (i + 1) + "/" + targets.length, "warn");
      Promise.resolve()
        .then(function () { return compressPdf(f); })
        .then(function (c) {
          if (c && c.size <= LIMIT_BYTES) { compressedInfo[b.num] = f.size; mapping[b.num] = c; }
        })
        .catch(function () { /* leave original -> will show as too big */ })
        .then(function () { renderRows(); next(i + 1); });
    }
    next(0);
  }

  function finalizeStatus() {
    var over = oversizedBlocks();
    var matched = Object.keys(mapping).length;
    var comp = Object.keys(compressedInfo).length;
    if (over.length) {
      var list = over.map(function (n) { return baseName(mapping[n]) + " (" + fmtSize(mapping[n].size) + ")"; }).join(", ");
      status("Still over the 1 MB limit after compression: " + list +
        ". Fill is blocked — replace these with smaller/clearer scans and choose the folder again.", "warn");
    } else {
      var msg = picked.length + " PDF(s) · " + matched + "/" + BLOCKS.length + " matched";
      if (comp) msg += " · " + comp + " compressed to fit";
      msg += ". Review below, then Fill.";
      status(msg, matched === BLOCKS.length ? "ok" : "warn");
    }
    updateFillState();
  }

  /* ---------------------- the fill action ---------------------- */
  function hasSigner() {
    return !!(settings.name || settings.desig || settings.dept || settings.mob || settings.email);
  }

  function doFill() {
    if (!hasSigner()) {
      status("No signing details set. Click the extension’s toolbar icon (top-right of the browser) and enter them.", "warn");
      return;
    }
    var over = oversizedBlocks();
    if (over.length) {
      status("Cannot fill — " + over.length + " file(s) exceed the 1 MB limit. Replace them with smaller PDFs and choose the folder again.", "warn");
      return;
    }
    var files = 0, missing = [];
    BLOCKS.forEach(function (b) {
      setValue(byId(b.f.name), settings.name);
      setValue(byId(b.f.desig), settings.desig);
      setValue(byId(b.f.dept), settings.dept);
      setValue(byId(b.f.mob), settings.mob);
      setValue(byId(b.f.email), settings.email);

      if (b.radio) setRadioYes(b.radio); // DPR / Convergence -> Yes

      var file = mapping[b.num];
      if (file && attachFile(byId(b.file), file)) files++;
      else missing.push(b.num);
    });

    if (missing.length) {
      // keep the mapping open so the user can fix the missing files
      status("Filled details in all " + BLOCKS.length + " blocks, attached " + files +
        " PDF(s). No PDF matched for block(s): " + missing.join(", ") +
        ". Rename those files (number 1–8) and choose the folder again.", "warn");
      return;
    }

    // success — show message and collapse the mapping section
    showMap(false);
    picked = []; mapping = {}; compressedInfo = {};
    if (sel.vbg_folder) sel.vbg_folder.value = "";
    if (sel.vbg_pick) sel.vbg_pick.textContent = "Choose folder for the next entry…";
    status("✓ Done — all " + BLOCKS.length + " blocks filled and " + files +
      " PDF(s) attached. Review the form and click the page’s Save.", "ok");
  }

  /* ---------------------- settings load / live update ----------------------
     Options are stored in chrome.storage.local AND mirrored to
     chrome.storage.sync. Sync is account-backed, so the details survive a
     full uninstall/reinstall and a browser restart, and carry across the same
     signed-in Chrome profile. We read local first (fast), then fall back to
     sync and re-hydrate local. ------------------------------------------- */
  function hasAny(o) { return !!(o && (o.name || o.desig || o.dept || o.mob || o.email)); }

  function loadSettings(cb) {
    try {
      chrome.storage.local.get("vbgCert", function (r) {
        if (r && hasAny(r.vbgCert)) {
          settings = Object.assign({}, DEFAULTS, r.vbgCert);
          cb();
        } else {
          try {
            chrome.storage.sync.get("vbgCert", function (r2) {
              if (r2 && hasAny(r2.vbgCert)) {
                settings = Object.assign({}, DEFAULTS, r2.vbgCert);
                try { chrome.storage.local.set({ vbgCert: settings }); } catch (e) {}
              }
              cb();
            });
          } catch (e) { cb(); }
        }
      });
    } catch (e) { cb(); }

    try {
      chrome.storage.onChanged.addListener(function (changes, area) {
        if ((area === "local" || area === "sync") && changes.vbgCert) {
          var nv = changes.vbgCert.newValue;
          if (hasAny(nv)) { settings = Object.assign({}, DEFAULTS, nv); renderSigner(); }
        }
      });
    } catch (e) {}
  }

  /* ---------------------- panel UI (shadow DOM) ---------------------- */
  var root, sel = {};
  function status(text, kind) {
    var s = sel.vbg_status;
    if (!s) return;
    s.textContent = text;
    s.className = "st " + (kind || "");
  }

  function showMap(on) {
    if (sel.vbg_map) sel.vbg_map.style.display = on ? "block" : "none";
  }

  function renderSigner() {
    var s = sel.vbg_signer;
    if (!s) return;
    if (hasSigner()) {
      var bits = [settings.name, settings.desig, settings.dept].filter(Boolean).join(", ");
      s.className = "signer ok";
      s.innerHTML = "Signing as <b>" + esc(bits || "(details set)") + "</b> · " +
        "<span class='edit'>change in extension settings</span>";
    } else {
      s.className = "signer warn";
      s.innerHTML = "⚠ No signing details set — click the extension’s <b>toolbar icon</b> and enter them once.";
    }
  }

  function renderRows() {
    var wrap = sel.vbg_rows;
    if (!wrap) return;
    wrap.innerHTML = "";
    BLOCKS.forEach(function (b) {
      var file = mapping[b.num];
      var over = file && file.size > LIMIT_BYTES;
      var state = !file ? "miss" : (over ? "over" : "ok");
      var right;
      if (!file) right = "no PDF matched";
      else if (compressedInfo[b.num]) right = esc(baseName(file)) + " · " + fmtSize(compressedInfo[b.num]) + " → " + fmtSize(file.size) + " ✓";
      else right = esc(baseName(file)) + " · " + fmtSize(file.size) + (over ? " · too big" : "");
      var row = document.createElement("div");
      row.className = "row";
      row.innerHTML =
        '<span class="num">' + b.num + '</span>' +
        '<span class="ttl">' + b.title + '</span>' +
        '<span class="fn ' + state + '">' + right + '</span>';
      wrap.appendChild(row);
    });
    updateFillState();
  }

  function updateFillState() {
    var fb = sel.vbg_fill;
    if (!fb) return;
    fb.disabled = busy || oversizedBlocks().length > 0;
    fb.textContent = busy ? "Compressing…" : "② Fill form";
  }
  function esc(s) { return (s || "").replace(/[&<>"]/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]; }); }

  function build() {
    var host = document.createElement("div");
    host.id = "vbg-cert-autofill-host";
    host.style.all = "initial";
    document.documentElement.appendChild(host);
    root = host.attachShadow({ mode: "open" });

    var css = document.createElement("style");
    css.textContent = STYLE;
    root.appendChild(css);

    var box = document.createElement("div");
    box.className = "panel";
    box.innerHTML = HTML;
    root.appendChild(box);

    ["vbg_head", "vbg_body", "vbg_signer", "vbg_pick", "vbg_folder",
     "vbg_map", "vbg_rows", "vbg_fill", "vbg_status", "vbg_min"].forEach(function (id) {
      sel[id] = root.getElementById(id);
    });

    sel.vbg_pick.addEventListener("click", function () { sel.vbg_folder.click(); });
    sel.vbg_folder.addEventListener("change", function (e) {
      var all = Array.prototype.slice.call(e.target.files || []);
      picked = all.filter(isPdf);
      compressedInfo = {};
      matchFiles(); // shows the mapping with original sizes right away
      if (picked.length) {
        showMap(true);
        sel.vbg_pick.textContent = "① Choose a different folder…";
        processOversized(); // compresses any file > 1 MB, then finalises the status
      } else {
        showMap(false);
        status("No PDF files found in that folder. Choose a folder that contains the certificate PDFs.", "warn");
      }
    });
    sel.vbg_fill.addEventListener("click", doFill);

    sel.vbg_min.addEventListener("click", function () {
      var b = sel.vbg_body;
      b.style.display = (b.style.display === "none") ? "block" : "none";
      sel.vbg_min.textContent = (b.style.display === "none") ? "+" : "–";
    });

    makeDraggable(box, sel.vbg_head);
    renderSigner();
    showMap(false); // start with just the folder chooser
  }

  function makeDraggable(box, handle) {
    var sx, sy, ox, oy, drag = false;
    handle.style.cursor = "move";
    handle.addEventListener("mousedown", function (e) {
      if (e.target === sel.vbg_min) return;
      drag = true; sx = e.clientX; sy = e.clientY;
      var r = box.getBoundingClientRect(); ox = r.left; oy = r.top;
      box.style.right = "auto"; e.preventDefault();
    });
    document.addEventListener("mousemove", function (e) {
      if (!drag) return;
      box.style.left = (ox + e.clientX - sx) + "px";
      box.style.top = (oy + e.clientY - sy) + "px";
    });
    document.addEventListener("mouseup", function () { drag = false; });
  }

  var STYLE =
    ".panel{position:fixed;top:70px;right:16px;width:340px;z-index:2147483647;" +
    "font-family:Segoe UI,Arial,sans-serif;font-size:13px;color:#1a1a1a;" +
    "background:#fff;border:1px solid #224aaa;border-radius:10px;" +
    "box-shadow:0 8px 28px rgba(0,0,0,.28);overflow:hidden}" +
    ".hd{background:#224aaa;color:#fff;padding:8px 10px;display:flex;align-items:center;justify-content:space-between}" +
    ".hd b{font-size:13px;font-weight:600}" +
    ".mn{cursor:pointer;background:rgba(255,255,255,.2);border:none;color:#fff;width:22px;height:22px;border-radius:5px;font-size:15px;line-height:1}" +
    ".bd{padding:10px;max-height:78vh;overflow:auto}" +
    ".signer{font-size:11.5px;padding:7px 9px;border-radius:7px;margin-bottom:8px;line-height:1.35}" +
    ".signer.ok{background:#eef3fb;color:#224aaa}" +
    ".signer.warn{background:#fef7e0;color:#9a6700}" +
    ".signer .edit{color:#5b6472}" +
    ".sec{font-weight:700;color:#224aaa;margin:6px 0 6px;border-top:1px solid #e6e9f0;padding-top:8px}" +
    ".btn{width:100%;padding:9px;border:none;border-radius:7px;font-size:13px;font-weight:600;cursor:pointer;margin-top:4px}" +
    ".btn.pick{background:#eef2fb;color:#224aaa;border:1px solid #224aaa}" +
    ".btn.fill{background:#0A66C2;color:#fff}" +
    ".btn.fill:hover{background:#0952a0}" +
    ".btn.fill:disabled{background:#9bbce0;cursor:not-allowed}" +
    ".rows{margin:8px 0}" +
    ".row{display:flex;align-items:center;gap:6px;padding:4px 0;border-bottom:1px dashed #eee}" +
    ".num{flex:0 0 18px;height:18px;line-height:18px;text-align:center;background:#224aaa;color:#fff;border-radius:4px;font-size:11px}" +
    ".ttl{flex:1;font-size:11px;line-height:1.2}" +
    ".fn{flex:0 0 96px;font-size:10px;text-align:right;word-break:break-all}" +
    ".fn.ok{color:#137333}.fn.miss{color:#c5221f}.fn.over{color:#c5221f;font-weight:700}" +
    ".st{margin-top:8px;font-size:12px;padding:7px 9px;border-radius:6px;background:#f2f4f8;min-height:16px;line-height:1.35}" +
    ".st.ok{background:#e6f4ea;color:#137333}.st.warn{background:#fef7e0;color:#9a6700}" +
    ".hint{font-size:11px;color:#666;margin-top:6px;line-height:1.35}";

  var HTML =
    '<div class="hd" id="vbg_head"><b>VB-G RAM G · Certificate Auto-Fill</b>' +
    '<button class="mn" id="vbg_min" title="Minimise">–</button></div>' +
    '<div class="bd" id="vbg_body">' +
      '<div class="signer" id="vbg_signer"></div>' +
      '<div class="sec">Certificates (PDF)</div>' +
      '<button class="btn pick" id="vbg_pick">① Choose certificate folder…</button>' +
      '<input id="vbg_folder" type="file" webkitdirectory directory multiple style="display:none">' +
      '<div id="vbg_map" style="display:none">' +
        '<div class="rows" id="vbg_rows"></div>' +
        '<button class="btn fill" id="vbg_fill">② Fill form</button>' +
      '</div>' +
      '<div class="st" id="vbg_status">Choose the folder that holds this scheme’s certificate PDFs.</div>' +
      '<div class="hint">Each PDF just needs its block number <b>1–8</b> in the name — <b>1.pdf</b>, <b>02.pdf</b>, <b>cert-3.pdf</b> all work. Scans over the <b>1 MB</b> server limit are <b>compressed automatically</b> to fit. DPR &amp; Convergence are set to <b>Yes</b> automatically.</div>' +
    '</div>';

  /* ---------------------- go ---------------------- */
  loadSettings(build);
})();
