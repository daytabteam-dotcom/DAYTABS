import { useRef, useState, useCallback } from "react";

/**
 * PDF export via window.open + window.print().
 *
 * Rationale: html2canvas fails on modern CSS (oklab colors, backdrop-filter, etc.).
 * Opening a new window with the results HTML + all document styles lets the native
 * browser renderer handle everything correctly, then window.print() saves as PDF.
 */
export function usePdfExport(filename: string) {
  const ref = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);

  const exportPdf = useCallback(async () => {
    const el = ref.current;
    if (!el) return;
    setIsExporting(true);

    try {
      // Collect all <link rel="stylesheet"> and <style> tags from the host page
      const styleHtml = Array.from(
        document.querySelectorAll<HTMLElement>('link[rel="stylesheet"], style')
      )
        .map((n) => n.outerHTML)
        .join("\n");

      const bodyHtml = el.outerHTML;

      const printDoc = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${filename.replace(".pdf", "")}</title>
  ${styleHtml}
  <style>
    /* Ensure dark background is printed */
    html, body {
      background: #0f0a1e !important;
      color: #ffffff !important;
      margin: 0;
      padding: 16px;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    /* Remove backdrop-blur which some browsers can't print */
    * {
      backdrop-filter: none !important;
      -webkit-backdrop-filter: none !important;
    }
    [data-pdf-export-root="true"] {
      position: static !important;
      inset: auto !important;
      width: auto !important;
      max-width: none !important;
      opacity: 1 !important;
      pointer-events: auto !important;
      overflow: visible !important;
      padding: 0 !important;
      margin: 0 !important;
    }
    [data-pdf-tab-section="true"] {
      break-inside: avoid;
      page-break-inside: avoid;
    }
    /* Ensure tabbed report sections are visible in print/PDF. */
    [data-pdf-export-root="true"] [role="tablist"] {
      display: none !important;
    }
    [data-pdf-export-root="true"] [role="tabpanel"][hidden] {
      display: block !important;
    }
    [data-pdf-export-root="true"] [role="tabpanel"][data-state="inactive"] {
      display: block !important;
    }
    @media print {
      html, body { padding: 0; }
    }
  </style>
</head>
<body>
  ${bodyHtml}
  <script>
    window.onload = function () {
      window.print();
      setTimeout(function () { window.close(); }, 1000);
    };
  </script>
</body>
</html>`;

      const win = window.open("", "_blank", "width=900,height=700");
      if (!win) {
        alert("Pop-up blocked: please allow pop-ups for this site and try again.");
        return;
      }
      win.document.open();
      win.document.write(printDoc);
      win.document.close();
    } finally {
      // Give a moment for the window to open before re-enabling the button
      setTimeout(() => setIsExporting(false), 800);
    }
  }, [filename]);

  return { ref, exportPdf, isExporting };
}
