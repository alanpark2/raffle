import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { dedupeNames, flipFirstLast, namesFromText, namesFromWorkbook } from "./parseNames";

describe("namesFromText", () => {
  it("reads one name per line and strips numbering", () => {
    const result = namesFromText("\uFEFF1. Ava Martinez\r\n2) Noah Patel\n\nSofía Núñez\n");
    expect(result.names).toEqual(["Ava Martinez", "Noah Patel", "Sofía Núñez"]);
  });

  it("uses first and last columns", () => {
    const result = namesFromText("First Name,Last Name,Grade\nAva,Martinez,4\nNoah,Patel,4\n");
    expect(result.names).toEqual(["Ava Martinez", "Noah Patel"]);
  });

  it("puts last name first when those headers are reversed", () => {
    const result = namesFromText("Last Name,First Name\nGarcia,Sofia\nPatel,Noah\n");
    expect(result.names).toEqual(["Sofia Garcia", "Noah Patel"]);
  });

  it("uses a name column and ignores grade", () => {
    const result = namesFromText('Student Name,Grade\n"Lee, Jordan",4\nMaya Chen,5\n');
    expect(result.names).toEqual(["Jordan Lee", "Maya Chen"]);
  });

  it("treats an unheaded two-column list as last, first", () => {
    const result = namesFromText("Garcia,Sofia\nPatel,Noah\n");
    expect(result.names).toEqual(["Sofia Garcia", "Noah Patel"]);
    expect(result.notes.some((note) => /last name first/i.test(note))).toBe(true);
  });

  it("keeps a multi-word first name ahead of a last name", () => {
    const result = namesFromText("Maria Elena,Garcia\n");
    expect(result.names).toEqual(["Maria Elena Garcia"]);
  });

  it("flips a single-word last name with a multi-word first name", () => {
    const result = namesFromText("Garcia,Maria Elena\n");
    expect(result.names).toEqual(["Maria Elena Garcia"]);
  });

  it("reads semicolons, tabs, and pipes", () => {
    expect(namesFromText("Name;Grade\nAva Martinez;4\n").names).toEqual(["Ava Martinez"]);
    expect(namesFromText("Name\tGrade\nNoah Patel\t4\n").names).toEqual(["Noah Patel"]);
    expect(namesFromText("Name|Grade\nMia Chen|4\n").names).toEqual(["Mia Chen"]);
  });

  it("reads JSON arrays, objects, and wrappers", () => {
    expect(namesFromText('["Ava Martinez","Noah Patel"]').names).toEqual(["Ava Martinez", "Noah Patel"]);
    expect(namesFromText('[{"firstName":"Ava","lastName":"Martinez"}]').names).toEqual(["Ava Martinez"]);
    expect(namesFromText('{"className":"Room 4","students":[{"name":"Mia Chen"}]}').names).toEqual(["Mia Chen"]);
  });

  it("keeps duplicate names and reports them", () => {
    const result = namesFromText("Ava Martinez\nAva Martinez\nNoah Patel\n");
    expect(result.names).toEqual(["Ava Martinez", "Ava Martinez", "Noah Patel"]);
    expect(result.duplicates).toEqual(["Ava Martinez"]);
  });

  it("reports an empty file", () => {
    const result = namesFromText("  \n");
    expect(result.names).toEqual([]);
    expect(result.notes[0]).toMatch(/empty/i);
  });

  it("ignores a header with no students", () => {
    const result = namesFromText("Name,Grade\n");
    expect(result.names).toEqual([]);
  });
});

describe("name edits", () => {
  it("swaps the first and last word, and doing it twice restores the name", () => {
    const once = flipFirstLast(["Garcia Sofia", "Maria Elena Garcia"]);
    expect(once).toEqual(["Sofia Garcia", "Garcia Elena Maria"]);
    expect(flipFirstLast(once)).toEqual(["Garcia Sofia", "Maria Elena Garcia"]);
  });

  it("drops exact duplicates without changing case of the first one", () => {
    expect(dedupeNames(["Ava Martinez", "ava martinez", "Noah Patel"])).toEqual(["Ava Martinez", "Noah Patel"]);
  });
});

describe("spreadsheets", () => {
  it("reads the fullest sheet", async () => {
    const bytes = workbook({
      Cover: [["Notes"]],
      Students: [
        ["First Name", "Last Name", "Grade"],
        ["Ava", "Martinez", "4"],
        ["Noah", "Patel", "4"],
      ],
    });
    const result = await namesFromWorkbook(bytes);
    expect(result.names).toEqual(["Ava Martinez", "Noah Patel"]);
  });
});

function workbook(sheets: Record<string, string[][]>): Uint8Array {
  const names = Object.keys(sheets);
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": xml(`<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  ${names.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}
</Types>`),
    "_rels/.rels": xml(`<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`),
    "xl/workbook.xml": xml(`<?xml version="1.0" encoding="UTF-8"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    ${names.map((name, index) => `<sheet name="${escapeXml(name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join("")}
  </sheets>
</workbook>`),
    "xl/_rels/workbook.xml.rels": xml(`<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${names.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join("")}
</Relationships>`),
  };
  names.forEach((name, index) => {
    const rows = sheets[name].map((row, rowIndex) => {
      const cells = row.map((value, column) => {
        const ref = `${String.fromCharCode(65 + column)}${rowIndex + 1}`;
        return `<c r="${ref}" t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`;
      }).join("");
      return `<row r="${rowIndex + 1}">${cells}</row>`;
    }).join("");
    files[`xl/worksheets/sheet${index + 1}.xml`] = xml(
      `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData></worksheet>`,
    );
  });
  return zipSync(files);
}

function xml(value: string): Uint8Array {
  return strToU8(value);
}

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
