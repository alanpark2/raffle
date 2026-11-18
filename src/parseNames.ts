export type ParseResult = {
  names: string[];
  notes: string[];
  duplicates: string[];
};

const NAME_COL =
  /^(name|student|student name|child|child name|kid|kids|full name|fullname|preferred name|display name|nombre|learner|participant)$/i;
const FIRST_COL = /^(first|first name|firstname|given|given name|given names)$/i;
const LAST_COL = /^(last|last name|lastname|surname|family|family name)$/i;
const META_COL =
  /^(grade|gr|class|teacher|email|e-mail|id|student id|studentid|number|#|no\.?|age|dob|birthday|gender|room|homeroom|parent|phone|address)$/i;
const HEADER_WORD =
  /^(name|student|students|first name|last name|firstname|lastname|full name|fullname|grade|email|teacher|class|homeroom)$/i;

type RowMode =
  | { kind: "first-last"; first: number; last: number }
  | { kind: "column"; index: number }
  | { kind: "plain" };

export function cleanName(raw: string): string | null {
  let name = raw.replace(/[\u0000-\u001F\u007F]/g, "").replace(/\s+/g, " ").trim();
  name = name.replace(/^["']+|["']+$/g, "").trim();
  name = name.replace(/^\d+[\.\)\-]\s+/, "").trim();
  if (!name || name.length > 80) return null;
  if (!/\p{L}/u.test(name)) return null;
  if (HEADER_WORD.test(name)) return null;
  return name;
}

export function dedupeNames(names: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const name of names) {
    const key = name.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(name);
  }
  return unique;
}

export function flipFirstLast(names: string[]): string[] {
  return names.map((name) => {
    const parts = name.split(/\s+/);
    if (parts.length < 2) return name;
    const swapped = parts.slice();
    const first = swapped[0];
    swapped[0] = swapped[swapped.length - 1];
    swapped[swapped.length - 1] = first;
    return swapped.join(" ");
  });
}

export function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  const src = text.replace(/^\uFEFF/, "");

  for (let i = 0; i < src.length; i++) {
    const char = src[i];
    if (inQuotes) {
      if (char === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
      continue;
    }
    if (char === delimiter) {
      row.push(cell.trim());
      cell = "";
      continue;
    }
    if (char === "\n" || char === "\r") {
      if (char === "\r" && src[i + 1] === "\n") i++;
      row.push(cell.trim());
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    cell += char;
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell.trim());
    if (row.some((value) => value.length > 0)) rows.push(row);
  }
  return rows;
}

export function detectDelimiter(text: string): string {
  const sample = text.replace(/^\uFEFF/, "").split(/\r?\n/).slice(0, 15).join("\n");
  let best = ",";
  let bestScore = 0;
  for (const delimiter of ["\t", ";", "|", ","]) {
    const rows = parseDelimited(sample, delimiter);
    const widths = rows.map((row) => row.length).filter((width) => width > 1);
    if (!widths.length) continue;
    const mode = modeOf(widths);
    const consistent = widths.filter((width) => width === mode).length;
    const score = consistent * 20 + mode;
    if (score > bestScore) {
      bestScore = score;
      best = delimiter;
    }
  }
  return best;
}

export function namesFromText(text: string, hint = ""): ParseResult {
  const trimmed = text.replace(/^\uFEFF/, "").trim();
  if (!trimmed) return { names: [], notes: ["That file is empty."], duplicates: [] };
  if (hint === "json" || trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return namesFromJson(trimmed);
  }
  const delimiter = detectDelimiter(trimmed);
  const result = namesFromRows(parseDelimited(trimmed, delimiter));
  if (delimiter === "\t") result.notes.unshift("Read as a tab-separated file.");
  if (delimiter === ";") result.notes.unshift("Read as a semicolon-separated file.");
  if (delimiter === "|") result.notes.unshift("Read as a pipe-separated file.");
  return result;
}

export function namesFromRows(input: string[][]): ParseResult {
  const rows = input
    .map((row) => row.map((cell) => String(cell ?? "").trim()))
    .filter((row) => row.some((cell) => cell.length > 0));
  const notes: string[] = [];
  if (!rows.length) return finalize([], ["No rows found in that file."]);

  if (rows.length === 1 && rows[0].length > 2 && !looksLikeHeader(rows[0])) {
    return finalize(rows[0], ["Read one row of names."]);
  }

  let data = rows;
  let mode: RowMode = { kind: "plain" };
  if (looksLikeHeader(rows[0])) {
    const header = rows[0];
    const first = header.findIndex((cell) => FIRST_COL.test(normalizeHeader(cell)));
    const last = header.findIndex((cell) => LAST_COL.test(normalizeHeader(cell)));
    const nameIndexes = header
      .map((cell, index) => ({ cell, index }))
      .filter(({ cell }) => isNameHeader(cell))
      .map(({ index }) => index);
    data = rows.slice(1);
    if (!data.length) return finalize([], ["That file has a header but no names under it."]);
    if (nameIndexes.length > 1) {
      return namesFromColumns(data, nameIndexes, notes);
    }
    if (first >= 0 && last >= 0) {
      mode = { kind: "first-last", first, last };
      notes.push("Used the first name and last name columns.");
    } else if (nameIndexes.length === 1) {
      mode = { kind: "column", index: nameIndexes[0] };
      notes.push(`Used the “${header[nameIndexes[0]]}” column.`);
    } else {
      const fallback = header.findIndex((cell) => cell && !isMetaHeader(cell));
      if (fallback >= 0) {
        mode = { kind: "column", index: fallback };
        notes.push(`Used the “${header[fallback]}” column.`);
      }
    }
  } else if (rows[0].length > 1) {
    notes.push("No header row found, so the columns were combined.");
  }

  const candidates: string[] = [];
  let flipped = 0;
  for (const row of data) {
    const extracted = extractName(row, mode);
    if (!extracted) continue;
    candidates.push(extracted.name);
    if (extracted.flipped) flipped++;
  }
  if (flipped > 0) {
    notes.push(
      `${flipped === 1 ? "One name was" : `${flipped} names were`} written last name first, so they are shown as first name then last name. Use Swap if that looks backwards.`,
    );
  }
  return finalize(candidates, notes);
}

export async function namesFromWorkbook(buffer: ArrayBuffer | Uint8Array): Promise<ParseResult> {
  try {
    const { default: readXlsxFile } = await import("read-excel-file/universal");
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    const sheets = await readXlsxFile(new Blob([Uint8Array.from(bytes)]));
    let best: string[][] = [];
    let bestScore = 0;
    for (const sheet of sheets) {
      const normalized = sheet.data.map((row) => row.map((cell) => (cell == null ? "" : String(cell))));
      const score = normalized.filter((row) => row.some((cell) => cell.trim())).length;
      if (score > bestScore) {
        bestScore = score;
        best = normalized;
      }
    }
    const result = namesFromRows(best);
    result.notes.unshift("Read the fullest sheet in the spreadsheet.");
    return result;
  } catch {
    return {
      names: [],
      notes: ["Could not read that spreadsheet. Save it as .xlsx or CSV and try again."],
      duplicates: [],
    };
  }
}

export async function namesFromFile(file: File): Promise<ParseResult> {
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  if (["xlsx", "xls", "ods", "xlsb"].includes(ext)) {
    return namesFromWorkbook(await file.arrayBuffer());
  }
  const hint = ext === "json" ? "json" : "";
  return namesFromText(await file.text(), hint);
}

function namesFromJson(text: string): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return finalize([], ["That JSON could not be read."]);
  }
  const names = collectJsonNames(data);
  const notes = names.length ? ["Read names from JSON."] : ["No names found in that JSON."];
  return finalize(names, notes);
}

function collectJsonNames(data: unknown): string[] {
  if (typeof data === "string") return [data];
  if (Array.isArray(data)) return data.flatMap((item) => collectJsonNames(item));
  if (!data || typeof data !== "object") return [];

  const record = data as Record<string, unknown>;
  let bestArray: string[] = [];
  for (const value of Object.values(record)) {
    if (!Array.isArray(value)) continue;
    const found = value.flatMap((item) => collectJsonNames(item));
    if (found.length > bestArray.length) bestArray = found;
  }

  const person = personFromObject(record);
  if (bestArray.length > 1) return bestArray;
  if (person) return [person];
  return bestArray;
}

function personFromObject(record: Record<string, unknown>): string | null {
  const first = stringField(record, ["firstName", "first", "givenName"]);
  const last = stringField(record, ["lastName", "last", "surname", "familyName"]);
  if (first || last) return `${first} ${last}`.trim();
  return stringField(record, ["name", "studentName", "fullName", "displayName", "nombre", "student", "child"]);
}

function stringField(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function namesFromColumns(rows: string[][], indexes: number[], notes: string[]): ParseResult {
  notes.push(
    indexes.length === 1
      ? "Used 1 name column."
      : `Used ${indexes.length} name columns. The timestamp was skipped.`,
  );
  const names: string[] = [];
  for (const row of rows) {
    for (const index of indexes) {
      const name = cleanName(row[index] || "");
      if (name) names.push(name);
    }
  }
  return finalize(names, notes, "tickets");
}

function normalizeHeader(cell: string): string {
  return cell
    .trim()
    .replace(/:+$/g, "")
    .trim()
    .replace(/\s+#\s*\d+$/g, "")
    .replace(/\s+\d+$/g, "")
    .trim()
    .toLowerCase();
}

function isNameHeader(cell: string): boolean {
  const label = normalizeHeader(cell);
  return NAME_COL.test(label) || /^(nominee|nominee name|nomination)$/.test(label);
}

function isMetaHeader(cell: string): boolean {
  const label = normalizeHeader(cell);
  return META_COL.test(label) || /^(timestamp|email address|score|points)$/.test(label);
}

function looksLikeHeader(cells: string[]): boolean {
  return cells.some(
    (cell) =>
      isNameHeader(cell) ||
      FIRST_COL.test(normalizeHeader(cell)) ||
      LAST_COL.test(normalizeHeader(cell)) ||
      isMetaHeader(cell),
  );
}

function extractName(row: string[], mode: RowMode): { name: string; flipped: boolean } | null {
  if (mode.kind === "first-last") {
    const name = cleanName(`${row[mode.first] || ""} ${row[mode.last] || ""}`);
    return name ? { name, flipped: false } : null;
  }

  if (mode.kind === "column") {
    const cell = row[mode.index] || "";
    const flipped = lastCommaFirst(cell);
    if (flipped) return flipped;
    const name = cleanName(cell);
    return name ? { name, flipped: false } : null;
  }

  const cells = row.map((cell) => cell.trim()).filter(Boolean);
  if (cells.length === 0) return null;
  if (cells.length === 1) {
    const flipped = lastCommaFirst(cells[0]);
    if (flipped) return flipped;
    const name = cleanName(cells[0]);
    return name ? { name, flipped: false } : null;
  }
  if (cells.length === 2) {
    const [left, right] = cells;
    const leftWords = left.split(/\s+/).length;
    const rightWords = right.split(/\s+/).length;
    if (leftWords === 1 && rightWords >= 1) {
      const name = cleanName(`${right} ${left}`);
      return name ? { name, flipped: true } : null;
    }
    const name = cleanName(`${left} ${right}`);
    return name ? { name, flipped: false } : null;
  }

  const parts = cells.filter((cell) => !/^[\d\s.#-]+$/.test(cell));
  const name = cleanName(parts.join(" "));
  return name ? { name, flipped: false } : null;
}

function lastCommaFirst(cell: string): { name: string; flipped: true } | null {
  if (!cell.includes(",")) return null;
  const parts = cell.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length !== 2) return null;
  if (!/\p{L}/u.test(parts[0]) || !/\p{L}/u.test(parts[1])) return null;
  const name = cleanName(`${parts[1]} ${parts[0]}`);
  return name ? { name, flipped: true } : null;
}

function finalize(candidates: string[], notes: string[], repeats: "share" | "tickets" = "share"): ParseResult {
  const names: string[] = [];
  const seen = new Map<string, number>();
  const duplicates: string[] = [];
  for (const candidate of candidates) {
    const name = cleanName(candidate);
    if (!name) continue;
    const key = name.toLocaleLowerCase();
    const count = (seen.get(key) ?? 0) + 1;
    seen.set(key, count);
    if (count === 2) duplicates.push(name);
    names.push(name);
  }
  if (names.length > 5000) {
    names.length = 5000;
    notes.push("Only the first 5,000 names were kept.");
  }
  if (!names.length) notes.push("No names found. Paste one name per line, or use a column called Name.");
  if (duplicates.length && repeats === "tickets") {
    const extra = names.length - seen.size;
    notes.push(
      extra === 1
        ? "1 extra nomination was kept as its own ticket, so that student has another chance."
        : `${extra} extra nominations were kept as their own tickets. A name entered more often has more chances.`,
    );
  } else if (duplicates.length) {
    const sample = duplicates.slice(0, 4).join(", ");
    notes.push(
      `Kept repeated names in case two kids share one (${sample}${duplicates.length > 4 ? "…" : ""}). Remove the extras if the file doubled them.`,
    );
  }
  return { names, notes, duplicates };
}

function modeOf(values: number[]): number {
  const counts = new Map<number, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  let best = values[0];
  let bestCount = 0;
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}
