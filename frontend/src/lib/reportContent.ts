export interface ParsedCsv {
  headers: string[];
  rows: string[][];
}

export type JsonParseResult =
  | { success: true; value: unknown }
  | { success: false; message: string };

export function parseJsonContent(content: string): JsonParseResult {
  try {
    return { success: true, value: JSON.parse(content) as unknown };
  } catch {
    return { success: false, message: "This report does not contain valid JSON." };
  }
}

export function parseCsvContent(content: string): ParsedCsv {
  const source = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
  if (source.length === 0) return { headers: [], rows: [] };

  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let inQuotes = false;
  let closedQuote = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index] ?? "";
    if (inQuotes) {
      if (character === '"') {
        if (source[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
          closedQuote = true;
        }
      } else {
        field += character;
      }
      continue;
    }

    if (closedQuote && character !== "," && character !== "\r" && character !== "\n") {
      throw new Error("CSV contains characters after a quoted field.");
    }
    if (character === '"') {
      if (field.length > 0 || closedQuote) {
        throw new Error("CSV contains a quote inside an unquoted field.");
      }
      inQuotes = true;
    } else if (character === ",") {
      record.push(field);
      field = "";
      closedQuote = false;
    } else if (character === "\r" || character === "\n") {
      record.push(field);
      records.push(record);
      record = [];
      field = "";
      closedQuote = false;
      if (character === "\r" && source[index + 1] === "\n") index += 1;
    } else {
      field += character;
    }
  }

  if (inQuotes) throw new Error("CSV contains an unterminated quoted field.");
  if (field.length > 0 || record.length > 0 || !/[\r\n]$/.test(source)) {
    record.push(field);
    records.push(record);
  }

  const [headerRecord = [], ...dataRows] = records;
  const columnCount = Math.max(
    headerRecord.length,
    ...dataRows.map((row) => row.length),
  );
  const headers = Array.from({ length: columnCount }, (_, index) =>
    headerRecord[index] || `Column ${index + 1}`,
  );
  const rows = dataRows.map((row) =>
    Array.from({ length: columnCount }, (_, index) => row[index] ?? ""),
  );
  return { headers, rows };
}

export function safeReportFileName(
  name: string,
  extension: "json" | "csv" | "md",
): string {
  const baseName = name.split(/[\\/]/).pop() ?? "";
  const withoutExtension = baseName.replace(/\.[^.]*$/, "");
  const safeBase = withoutExtension
    .replace(/[^A-Za-z0-9._-]/g, "_")
    .replace(/^\.+/, "")
    .slice(0, 100);
  return `${safeBase || "report"}.${extension}`;
}
