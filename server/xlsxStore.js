import XLSX from "xlsx";
import fs from "fs";

const COLUMNS = [
  "District",
  "State",
  "Approx. students",
  "Superintendent",
  "Email",
  "Contact no.",
  "Interest Status",
];

const SHEET_NAME = "Sheet1";

function normalize(str) {
  return (str || "").trim().toLowerCase();
}

export function loadRows(filePath) {
  if (!fs.existsSync(filePath)) {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([COLUMNS]);
    XLSX.utils.book_append_sheet(wb, ws, SHEET_NAME);
    XLSX.writeFile(wb, filePath);
    return [];
  }
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[SHEET_NAME] || wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { defval: "" });
}

export function findExisting(filePath, district, state) {
  const rows = loadRows(filePath);
  return rows.find(
    (r) =>
      normalize(r["District"]) === normalize(district) &&
      normalize(r["State"]) === normalize(state)
  );
}

// Interest Status is set manually by whoever contacts the district — every
// caller EXCEPT setInterestStatus() below is blocked from changing it on an
// existing row.
export function upsertRow(filePath, rowData, { allowInterestStatusUpdate = false } = {}) {
  const rows = loadRows(filePath);
  const idx = rows.findIndex(
    (r) =>
      normalize(r["District"]) === normalize(rowData["District"]) &&
      normalize(r["State"]) === normalize(rowData["State"])
  );

  const cleanRow = {};
  for (const col of COLUMNS) {
    if (col === "Interest Status" && idx >= 0 && !allowInterestStatusUpdate) {
      cleanRow[col] = rows[idx][col] ?? "";
    } else {
      cleanRow[col] = rowData[col] ?? (idx >= 0 ? rows[idx][col] ?? "" : "");
    }
  }

  if (idx >= 0) {
    rows[idx] = cleanRow;
  } else {
    rows.push(cleanRow);
  }

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows, { header: COLUMNS });
  XLSX.utils.book_append_sheet(wb, ws, SHEET_NAME);
  XLSX.writeFile(wb, filePath);

  return cleanRow;
}

// The ONE legitimate way to change Interest Status — a human explicitly
// setting it after actually contacting the district.
export function setInterestStatus(filePath, district, state, status) {
  const existing = findExisting(filePath, district, state);
  if (!existing) {
    throw new Error(
      `Cannot set Interest Status: no existing row found for "${district}", "${state}". Look the district up first.`
    );
  }
  return upsertRow(
    filePath,
    { ...existing, "Interest Status": status },
    { allowInterestStatusUpdate: true }
  );
}

export { COLUMNS };