/* Toolbar badge: light up when a saved join's page-set is all open. */
"use strict";
function norm(u) { try { var x = new URL(u); return (x.origin + x.pathname).replace(/\/+$/, "").toLowerCase(); } catch (e) { return String(u || "").split(/[?#]/)[0].toLowerCase(); } }
function evaluate() {
  chrome.storage.local.get("dxRecipes", function (data) {
    var recipes = (data && data.dxRecipes) || [];
    if (!recipes.length) { chrome.action.setBadgeText({ text: "" }); return; }
    chrome.tabs.query({}, function (tabs) {
      var open = {};
      (tabs || []).forEach(function (t) { if (/^https?:/i.test(t.url || "")) open[norm(t.url)] = 1; });
      var match = recipes.some(function (r) { return (r.sources || []).length && r.sources.every(function (s) { return open[s]; }); });
      if (match) {
        chrome.action.setBadgeText({ text: "↻" });
        chrome.action.setBadgeBackgroundColor({ color: "#137333" });
        chrome.action.setTitle({ title: "Saved join available — click to re-run" });
      } else {
        chrome.action.setBadgeText({ text: "" });
        chrome.action.setTitle({ title: "Certificate Auto-Fill & Data Extractor" });
      }
    });
  });
}
chrome.tabs.onUpdated.addListener(function (id, info) { if (info.url || info.status === "complete") evaluate(); });
chrome.tabs.onRemoved.addListener(evaluate);
chrome.tabs.onActivated.addListener(evaluate);
chrome.tabs.onCreated.addListener(evaluate);
chrome.runtime.onStartup.addListener(evaluate);
chrome.runtime.onInstalled.addListener(evaluate);
chrome.storage.onChanged.addListener(function (ch, area) { if (ch.dxRecipes) evaluate(); });
evaluate();
