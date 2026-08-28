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
