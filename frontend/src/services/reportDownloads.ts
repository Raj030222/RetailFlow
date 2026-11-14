import type { ReportFormat } from "../types/reports";
import { safeReportFileName } from "../lib/reportContent";

const DOWNLOAD_FORMATS: Record<
  "JSON" | "CSV" | "Markdown",
  { extension: "json" | "csv" | "md"; mimeType: string }
> = {
  JSON: { extension: "json", mimeType: "application/json;charset=utf-8" },
  CSV: { extension: "csv", mimeType: "text/csv;charset=utf-8" },
  Markdown: { extension: "md", mimeType: "text/markdown;charset=utf-8" },
};

export function downloadReportContent(
  fileName: string,
  format: ReportFormat,
  content: string,
): void {
  const downloadFormat = Object.entries(DOWNLOAD_FORMATS).find(
    ([supportedFormat]) => supportedFormat === format,
  )?.[1];
  if (!downloadFormat) {
    throw new Error("This report format cannot be downloaded.");
  }
  const blob = new Blob([content], { type: downloadFormat.mimeType });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = safeReportFileName(fileName, downloadFormat.extension);
  link.hidden = true;
  document.body.append(link);
  try {
    link.click();
  } finally {
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  }
}
