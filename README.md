# VB-G RAM G — Certificate Auto-Fill

A small **Chrome / Edge** add-on that fills all **8 certificate blocks** on the
VB-G RAM G *Work Entry* page (`work_entry.aspx`) in one click — the same
signing-authority details in every block — and attaches the certificate PDFs
from a folder. Oversized scans are compressed on your PC to fit the server’s
~1 MB limit.

- **Download:** see the [latest release](https://github.com/visiontech-com-ai/vbgramg-cert-uploader/releases/latest) or the
  [project page](https://visiontech-com-ai.github.io/vbgramg-cert-uploader/).
- **Install & use guide:** [illustrated guide](https://visiontech-com-ai.github.io/vbgramg-cert-uploader/vbg-cert-autofill/install-guide.html)

## What it does

- Fills Name / Designation / Department / Mobile / Email into all 8 blocks
  (set once in the add-on’s settings, remembered across restarts and updates).
- Matches each PDF to its block by the number **1–8** in the file name.
- Sets the **DPR** and **Convergence** options to *Yes* automatically.
- **Compresses** any scan over the ~1 MB server limit locally (pdf.js + jsPDF);
  blocks Fill only if a file still can’t fit.
- Runs entirely in the browser — no data leaves the PC.

## Install (Load unpacked)

1. Download and unzip the release to a permanent folder.
2. Open `chrome://extensions` / `edge://extensions` → enable **Developer mode**.
3. **Load unpacked** → select the `vbg-cert-autofill` folder.
4. Click the toolbar icon, enter your signing details once, then open the Work
   Entry page.

## Contents

- `vbg-cert-autofill/` — the extension source (manifest, scripts, icons, bundled
  `pdf.js` + `jsPDF`, and the printable install guide).
- `index.html` — the project landing page (GitHub Pages).

## Third-party libraries

- **pdf.js** — Mozilla, Apache License 2.0.
- **jsPDF** — MIT License.
