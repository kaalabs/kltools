function pad(value, width) {
  const stringValue = String(value ?? "");
  return stringValue.padEnd(width, " ");
}

export function truncate(value, max) {
  const stringValue = String(value ?? "");
  if (stringValue.length <= max) return stringValue;
  if (max <= 3) return stringValue.slice(0, max);
  return `${stringValue.slice(0, max - 3)}...`;
}

export function renderTable(headers, rows) {
  const widths = headers.map((h, i) => Math.max(String(h).length, ...rows.map((r) => String(r[i] ?? "").length)));
  const headerLine = headers.map((h, i) => pad(h, widths[i])).join("  ");
  const dividerLine = widths.map((w) => "-".repeat(w)).join("  ");
  const lines = [headerLine, dividerLine];
  for (const row of rows) {
    lines.push(row.map((c, i) => pad(c, widths[i])).join("  "));
  }
  return lines.join("\n");
}

export function formatInteger(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return value.toLocaleString("en-US");
}

export function formatCost(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  if (value === 0) return "0";
  if (value >= 1000) return String(value);
  const fixed = value.toFixed(value >= 10 ? 2 : value >= 1 ? 3 : 4);
  return fixed.replace(/0+$/, "").replace(/\.$/, "");
}

export function modelFeaturesShort(model) {
  const flags = [];
  if (model?.reasoning) flags.push("R");
  if (model?.tool_call) flags.push("T");
  if (model?.attachment) flags.push("A");
  if (model?.structured_output) flags.push("S");
  if (model?.temperature) flags.push("Temp");
  if (model?.interleaved) flags.push("I");
  if (model?.open_weights) flags.push("OW");
  return flags.length ? flags.join(" ") : "-";
}

export function modalitiesShort(model) {
  const input = model?.modalities?.input;
  const output = model?.modalities?.output;
  const inStr = Array.isArray(input) && input.length ? input.join(",") : "-";
  const outStr = Array.isArray(output) && output.length ? output.join(",") : "-";
  return `${inStr}->${outStr}`;
}
