import { useRef, useState, useCallback } from "react";

export function usePdfExport(filename: string) {
  const ref = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);

  const exportPdf = useCallback(async () => {
    const el = ref.current;
    if (!el) return;
    setIsExporting(true);
    try {
      const [html2canvas, { default: jsPDF }] = await Promise.all([
        import("html2canvas").then(m => m.default),
        import("jspdf"),
      ]);

      const canvas = await html2canvas(el, {
        backgroundColor: "#0f0a1e",
        scale: 1.5,
        logging: false,
        useCORS: true,
        allowTaint: true,
        scrollY: 0,
        windowHeight: el.scrollHeight,
        height: el.scrollHeight,
      });

      const imgData = canvas.toDataURL("image/png");
      const pxPerMm = 3.7795;
      const pageW = 210;
      const pageH = Math.ceil((canvas.height / canvas.width) * pageW);

      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: [pageW, pageH] });
      pdf.addImage(imgData, "PNG", 0, 0, pageW, pageH);
      pdf.save(filename);
    } finally {
      setIsExporting(false);
    }
  }, [filename]);

  return { ref, exportPdf, isExporting };
}
