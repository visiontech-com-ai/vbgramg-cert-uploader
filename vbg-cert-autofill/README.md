# VB-G RAM G — Certificate Auto-Fill (Chrome / Edge)

Fills the **8 certificate blocks** on the *Work Entry* page in one click:
the same **Name / Designation / Department / Mobile / Email** (set once in the
extension’s settings) in every block, and **attaches the 8 PDF certificates**
from a folder you pick once. The **DPR** and **Convergence** blocks are set to
**Yes** automatically so their uploads are included.

No internet tools, no Node, no Python. It is just a small browser add-on.

---

## 1. Install (do this once, ~1 minute)

### Google Chrome
1. Copy the whole **`vbg-cert-autofill`** folder somewhere permanent
   (e.g. `C:\VBG\vbg-cert-autofill`). Do **not** delete it later.
2. Open Chrome and go to **`chrome://extensions`** (type it in the address bar).
3. Turn on **Developer mode** (toggle, top-right).
4. Click **Load unpacked** (top-left).
5. Select the **`vbg-cert-autofill`** folder → **Select Folder**.
6. Done. A blue ✓ icon appears in the toolbar.

### Microsoft Edge
1–2. Copy the folder, then go to **`edge://extensions`**.
3. Turn on **Developer mode** (left side).
4. Click **Load unpacked** → pick the **`vbg-cert-autofill`** folder.

> The extension only activates on the VB-G RAM G Work Entry page
> (`…/vbgramg/work_entry.aspx`). It does nothing on any other website.

---

## 2. Prepare the certificate PDFs

The PDFs change for every scheme — that's fine. Put the 8 certificate PDFs in
**one folder**. Each file only needs its **block number 1–8 somewhere in the
name**; the tool finds it. All of these work and map to the same block:

- `1.pdf`, `01.pdf`
- `cert-2.pdf`, `cert-02.pdf`
- `GP-2026-cert-05.pdf` → block 5 (scheme codes and years are ignored)
- `3rd non splitting.pdf` → block 3

Use this order for the numbers:

| # | Certificate |
|---|-------------|
| 1 | Pre-estimation / Feasibility / Utility report |
| 2 | No duplication / double-counting (BDO) |
| 3 | Non-splitting of work (BDO) |
| 4 | Permissible category of MGNREGA (BDO) |
| 5 | Beneficiary selection per Para 5 (BDO) |
| 6 | DPR preparation |
| 7 | Convergence department clearance |
| 8 | Adherence to non-negotiables (BDO) |

If a file has no number, keyword names also work (e.g. `split.pdf`, `dpr.pdf`,
`permissible.pdf`). After you pick the folder, the panel shows exactly which PDF
landed in each block, so you can always confirm before filling.

**The server accepts about 1 MB per PDF.** The panel shows every file’s size.
If a scan is over the limit, the tool **compresses it automatically** (it
re-renders the pages and re-encodes them smaller) and shows the result, e.g.
`3.pdf · 1.80 MB → 0.62 MB ✓`. Only oversized files are touched; files that
already fit keep their original quality.

If a file **still** can’t get under the limit after compression, it is marked
**“too big”**, **Fill is blocked**, and the message names it — replace that one
with a clearer/smaller scan and choose the folder again.

---

## 3. Set your signing details (once)

Click the extension’s **icon in the browser toolbar** (top-right). A small
settings popup opens — enter **Name, Designation, Department, Mobile, Email**.
They save automatically and are used for every certificate block, on every work
entry, until you change them.

> Icon not visible? Click the puzzle-piece **🧩 Extensions** button next to the
> address bar and **pin** “VB-G RAM G Certificate Auto-Fill”. (You can also open
> the settings from `chrome://extensions` → *Details* → *Extension options*.)

---

## 4. Fill a work entry

1. Log in and open the **Work Entry** page. Choose the work category / heads /
   village etc. at the top yourself (those are per-work).
2. The blue **“Certificate Auto-Fill”** panel appears at the top-right and shows
   who you’re signing as. (Drag its title bar to move it; click **–** to minimise.)
3. Click **① Choose certificate folder…** and select the folder of PDFs. The
   panel then **reveals the 1–8 mapping** — which PDF matched each block
   (green = matched).
4. Click **② Fill form**. DPR and Convergence are set to **Yes** automatically.
   On success the panel shows a **“Done”** message and hides the mapping again.
5. **Check the form**, then click the page’s own **Save** button.

That’s it. The typing of the same details 8 times is gone, and the 8 uploads
become one folder selection.

---

## Notes & troubleshooting

- **A block shows “no PDF matched.”** Rename that PDF so its block number 1–8 is
  in the name (or a keyword), then click *Choose a different folder* again. The
  mapping stays open on a partial match so you can fix it.
- **Oversized scans are compressed automatically.** You’ll see the panel show
  “Compressing block N…”, then a result like `1.80 MB → 0.62 MB ✓`.
- **A file is still “too big” / Fill is greyed out.** Even after compression that
  PDF won’t fit (e.g. many dense pages). Replace it with a clearer/smaller scan
  and choose the folder again — Fill re-enables once every file is under the limit.
- **“No signing details set.”** Click the extension’s toolbar icon and fill the
  settings popup — the panel updates immediately, no page reload needed.
- **DPR / Convergence set to Yes.** The tool always sets these to Yes and
  attaches files 6 and 7. If a particular work genuinely does not need one,
  change that block to **No** on the page and remove its file after filling.
- **Panel didn’t appear.** Make sure the address is `…/work_entry.aspx`, and
  that the extension is enabled in `chrome://extensions` / `edge://extensions`.
- **Nothing is uploaded until you click the page’s Save.** The tool only fills
  the form; you stay in control of submitting.
- **Your signing details persist.** They are kept across browser restarts and
  extension updates. They are also mirrored to your Chrome account (when signed
  in), so they survive a reinstall and carry to the same profile on another PC.

---

*The extension never sends your data anywhere. It runs entirely inside your
browser and only touches the Work Entry form fields. PDF compression happens
locally on your PC — nothing is uploaded to any service.*

---

### Bundled libraries (in `lib/`)

- **pdf.js** (`pdf.min.js`, `pdf.worker.min.js`) — Mozilla, Apache License 2.0.
- **jsPDF** (`jspdf.umd.min.js`) — MIT License.

Both run fully offline; they are used only to re-render and re-save oversized
scans so they fit the server’s size limit.
