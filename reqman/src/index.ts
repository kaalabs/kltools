import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { parse as parseToml, stringify as stringifyToml } from "@iarna/toml";
import {
  createCliRenderer,
  BoxRenderable,
  InputRenderable,
  InputRenderableEvents,
  SelectRenderable,
  SelectRenderableEvents,
  TabSelectRenderable,
  TabSelectRenderableEvents,
  TextRenderable,
  type KeyEvent,
  type Renderable,
} from "@opentui/core";

type FieldType = "number" | "text" | "boolean" | "date" | "time" | "choice";

type FieldSchema = {
  name: string;
  type: FieldType;
  label?: string;
  required?: boolean;
  options?: string[];
};

type DatabaseSchema = {
  name: string;
  fields: FieldSchema[];
  primaryKey?: string;
  description?: string;
};

type FormValue = string | boolean;

type FieldControl = {
  field: FieldSchema;
  container: BoxRenderable;
  input: InputRenderable | TabSelectRenderable | SelectRenderable;
  label: TextRenderable;
};

type LoadedDatabase = {
  data: Record<string, unknown>;
  records: Record<string, unknown>[];
};

type Mode = "list" | "new" | "edit";

const FIELD_TYPES: FieldType[] = ["number", "text", "boolean", "date", "time", "choice"];
const REQMAN_META_TABLE = "__reqman";
const REQMAN_SCHEMA_VERSION = 1;
const REQMAN_SCHEMA_VERSION_KEY = "schema_version";
const REQMAN_SCHEMA_JSON_KEY = "schema_json";

function parseArgs(argv: string[]) {
  let schemaPath: string | undefined;
  let dbPath: string | undefined;
  const positionals: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") {
      printUsageAndExit(0);
    }

    if (arg === "--schema" || arg === "-s") {
      const value = argv[i + 1];
      if (!value) {
        console.error(`Missing value for ${arg}.`);
        printUsageAndExit(1);
      }
      schemaPath = value;
      i += 1;
      continue;
    }

    if (arg.startsWith("--schema=")) {
      schemaPath = arg.slice("--schema=".length);
      continue;
    }

    if (arg === "--db" || arg === "-d") {
      const value = argv[i + 1];
      if (!value) {
        console.error(`Missing value for ${arg}.`);
        printUsageAndExit(1);
      }
      dbPath = value;
      i += 1;
      continue;
    }

    if (arg.startsWith("--db=")) {
      dbPath = arg.slice("--db=".length);
      continue;
    }

    if (arg.startsWith("-")) {
      console.error(`Unknown option: ${arg}`);
      printUsageAndExit(1);
    }

    positionals.push(arg);
  }

  if (!schemaPath && !dbPath) {
    if (positionals.length === 1) {
      dbPath = positionals[0];
    } else if (positionals.length >= 2) {
      schemaPath = positionals[0];
      dbPath = positionals[1];
    }
  } else if (!dbPath) {
    dbPath = positionals[0];
  } else if (!schemaPath) {
    schemaPath = positionals[0];
  }

  if (!dbPath) {
    printUsageAndExit(1);
  }

  return {
    schemaPath: schemaPath ? path.resolve(schemaPath) : undefined,
    dbPath: path.resolve(dbPath),
  };
}

function printUsageAndExit(code: number): never {
  const usage = `Usage:
  reqman --db ./data.toml
  reqman ./data.toml

  reqman --schema ./schema.json --db ./data.toml
  reqman ./schema.json ./data.toml

Options:
  -s, --schema   Path to JSON schema
  -d, --db       Path to TOML database
  -h, --help     Show this help

Notes:
  - If the database contains an embedded schema, you can omit --schema.
  - New databases created with --schema will embed it under [${REQMAN_META_TABLE}].${REQMAN_SCHEMA_JSON_KEY}.
`;
  console.log(usage);
  process.exit(code);
}

function getAppVersion() {
  try {
    const raw = fs.readFileSync(path.resolve("package.json"), "utf8");
    const pkg = JSON.parse(raw) as { version?: string };
    if (pkg.version && typeof pkg.version === "string") {
      return pkg.version;
    }
  } catch {
    // ignore
  }
  return "0.0.0";
}

function parseSchema(raw: unknown): DatabaseSchema {
  if (!raw || typeof raw !== "object") {
    throw new Error("Schema must be a JSON object.");
  }
  const obj = raw as Record<string, unknown>;
  const name = typeof obj.name === "string" && obj.name.trim() ? obj.name.trim() : "records";
  if (name === REQMAN_META_TABLE) {
    throw new Error(`Schema name '${REQMAN_META_TABLE}' is reserved for Reqman metadata.`);
  }
  const fieldsRaw = obj.fields;
  if (!Array.isArray(fieldsRaw)) {
    throw new Error("Schema.fields must be an array.");
  }
  const fields: FieldSchema[] = fieldsRaw.map((field, index) => {
    if (!field || typeof field !== "object") {
      throw new Error(`Schema field at index ${index} must be an object.`);
    }
    const entry = field as Record<string, unknown>;
    const fieldName = typeof entry.name === "string" ? entry.name.trim() : "";
    if (!fieldName) {
      throw new Error(`Schema field at index ${index} is missing a name.`);
    }
    const fieldType = typeof entry.type === "string" ? entry.type.trim() : "";
    if (!FIELD_TYPES.includes(fieldType as FieldType)) {
      throw new Error(`Schema field '${fieldName}' has unsupported type '${fieldType}'.`);
    }
    const optionsRaw = entry.options;
    let options: string[] | undefined;
    if (fieldType === "choice") {
      if (!Array.isArray(optionsRaw) || optionsRaw.length === 0) {
        throw new Error(`Schema field '${fieldName}' requires a non-empty options array.`);
      }
      const parsedOptions = optionsRaw.map((option, optionIndex) => {
        if (typeof option !== "string") {
          throw new Error(`Schema field '${fieldName}' has non-string option at index ${optionIndex}.`);
        }
        const trimmed = option.trim();
        if (!trimmed) {
          throw new Error(`Schema field '${fieldName}' has empty option at index ${optionIndex}.`);
        }
        return trimmed;
      });
      const seenOptions = new Set<string>();
      for (const option of parsedOptions) {
        if (seenOptions.has(option)) {
          throw new Error(`Schema field '${fieldName}' has duplicate option '${option}'.`);
        }
        seenOptions.add(option);
      }
      options = parsedOptions;
    } else if (optionsRaw !== undefined) {
      throw new Error(`Schema field '${fieldName}' has options but is not of type 'choice'.`);
    }
    const label = typeof entry.label === "string" ? entry.label.trim() : undefined;
    const required = typeof entry.required === "boolean" ? entry.required : undefined;
    return {
      name: fieldName,
      type: fieldType as FieldType,
      label,
      required,
      options,
    };
  });
  if (fields.length === 0) {
    throw new Error("Schema.fields must include at least one field.");
  }
  const primaryKey = typeof obj.primaryKey === "string" ? obj.primaryKey.trim() : undefined;
  if (primaryKey && !fields.find((field) => field.name === primaryKey)) {
    throw new Error(`Schema primaryKey '${primaryKey}' is not defined in fields.`);
  }
  const description = typeof obj.description === "string" ? obj.description.trim() : undefined;
  const fieldNames = new Set<string>();
  for (const field of fields) {
    if (fieldNames.has(field.name)) {
      throw new Error(`Schema contains duplicate field name '${field.name}'.`);
    }
    fieldNames.add(field.name);
  }
  return {
    name,
    fields,
    primaryKey,
    description,
  };
}

function ensureSchemaMetadata(data: Record<string, unknown>, schema: DatabaseSchema) {
  const current = data[REQMAN_META_TABLE];
  const next: Record<string, unknown> =
    current && typeof current === "object" && !Array.isArray(current)
      ? { ...(current as Record<string, unknown>) }
      : {};
  next[REQMAN_SCHEMA_VERSION_KEY] = REQMAN_SCHEMA_VERSION;
  next[REQMAN_SCHEMA_JSON_KEY] = JSON.stringify(schema, null, 2);
  data[REQMAN_META_TABLE] = next;
}

function ensureDatabaseFile(dbPath: string, schema: DatabaseSchema) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const createFresh = () => {
    const data: Record<string, unknown> = {};
    ensureSchemaMetadata(data, schema);
    data[schema.name] = [];
    const output = stringifyToml(data as Record<string, any>);
    fs.writeFileSync(dbPath, output, "utf8");
  };

  if (!fs.existsSync(dbPath)) {
    createFresh();
    return;
  }

  const raw = fs.readFileSync(dbPath, "utf8");
  if (!raw.trim()) {
    createFresh();
    return;
  }

  let data: Record<string, unknown>;
  try {
    data = parseToml(raw) as Record<string, unknown>;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse database TOML '${dbPath}': ${message}`);
  }

  ensureSchemaMetadata(data, schema);
  const output = stringifyToml(data as Record<string, any>);
  fs.writeFileSync(dbPath, output, "utf8");
}

function loadDatabase(dbPath: string, schema: DatabaseSchema): LoadedDatabase {
  const raw = fs.readFileSync(dbPath, "utf8");
  const content = raw.trim();
  let data: Record<string, unknown> = {};
  if (content) {
    data = parseToml(raw) as Record<string, unknown>;
  }
  const tableValue = data[schema.name];
  const records = Array.isArray(tableValue)
    ? tableValue.map((entry) => normalizeRecord(entry))
    : [];
  data[schema.name] = records;
  return { data, records };
}

function normalizeRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return { ...(value as Record<string, unknown>) };
}

function saveDatabase(dbPath: string, data: Record<string, unknown>, schema: DatabaseSchema, records: Record<string, unknown>[]) {
  data[schema.name] = records;
  ensureSchemaMetadata(data, schema);
  const output = stringifyToml(data as Record<string, any>);
  fs.writeFileSync(dbPath, output, "utf8");
}

function formatFieldLabel(field: FieldSchema) {
  const requiredMark = field.required ? " *" : "";
  return `${field.label ?? field.name} (${field.type})${requiredMark}`;
}

function formatValue(field: FieldSchema, value: unknown) {
  if (value === undefined || value === null) {
    return "—";
  }
  if (field.type === "boolean") {
    return value ? "true" : "false";
  }
  if (field.type === "number") {
    return typeof value === "number" ? String(value) : String(value);
  }
  if (value instanceof Date) {
    return formatDateValue(field.type, value);
  }
  return String(value);
}

function formatDateValue(type: FieldType, value: Date) {
  const pad = (input: number) => String(input).padStart(2, "0");
  if (type === "date") {
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  }
  if (type === "time") {
    return `${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`;
  }
  return value.toISOString();
}

function isValidDate(input: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    return false;
  }
  const [year, month, day] = input.split("-").map((part) => Number(part));
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function isValidTime(input: string) {
  const match = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(input);
  if (!match) {
    return false;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = match[3] ? Number(match[3]) : 0;
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59 && seconds >= 0 && seconds <= 59;
}

function filterRecords(records: Record<string, unknown>[], schema: DatabaseSchema, filterValue: string) {
  const trimmed = filterValue.trim();
  if (!trimmed) {
    return records.map((_record, index) => index);
  }
  const lower = trimmed.toLowerCase();
  const delimiterIndex = lower.indexOf(":");
  if (delimiterIndex > 0) {
    const field = lower.slice(0, delimiterIndex).trim();
    const value = lower.slice(delimiterIndex + 1).trim();
    if (!value) {
      return records.map((_record, index) => index);
    }
    const schemaField = schema.fields.find((entry) => entry.name.toLowerCase() === field);
    if (!schemaField) {
      return [];
    }
    return records
      .map((record, index) => ({ record, index }))
      .filter(({ record }) => {
        const recordValue = record[schemaField.name];
        if (recordValue === undefined || recordValue === null) {
          return false;
        }
        return String(recordValue).toLowerCase().includes(value);
      })
      .map(({ index }) => index);
  }
  return records
    .map((record, index) => ({ record, index }))
    .filter(({ record }) => {
      return schema.fields.some((field) => {
        const value = record[field.name];
        if (value === undefined || value === null) {
          return false;
        }
        return String(value).toLowerCase().includes(lower);
      });
    })
    .map(({ index }) => index);
}

function buildRecordFromForm(schema: DatabaseSchema, values: Record<string, FormValue>) {
  const record: Record<string, unknown> = {};
  const errors: string[] = [];

  for (const field of schema.fields) {
    const raw = values[field.name];
    if (field.type === "boolean") {
      record[field.name] = Boolean(raw);
      continue;
    }

    if (field.type === "choice") {
      const rawString = typeof raw === "string" ? raw.trim() : "";
      if (!rawString) {
        if (field.required) {
          errors.push(`${field.name} is required.`);
        }
        continue;
      }
      const options = field.options ?? [];
      if (!options.includes(rawString)) {
        errors.push(`${field.name} must be one of: ${options.join(", ")}.`);
        continue;
      }
      record[field.name] = rawString;
      continue;
    }

    const rawString = typeof raw === "string" ? raw.trim() : "";
    if (!rawString) {
      if (field.required) {
        errors.push(`${field.name} is required.`);
      }
      continue;
    }

    if (field.type === "number") {
      const parsed = Number(rawString);
      if (Number.isNaN(parsed)) {
        errors.push(`${field.name} must be a valid number.`);
        continue;
      }
      record[field.name] = parsed;
      continue;
    }

    if (field.type === "date") {
      if (!isValidDate(rawString)) {
        errors.push(`${field.name} must be a valid date (YYYY-MM-DD).`);
        continue;
      }
      record[field.name] = rawString;
      continue;
    }

    if (field.type === "time") {
      if (!isValidTime(rawString)) {
        errors.push(`${field.name} must be a valid time (HH:MM or HH:MM:SS).`);
        continue;
      }
      record[field.name] = rawString;
      continue;
    }

    record[field.name] = rawString;
  }

  return { record, errors };
}

function recordSummary(schema: DatabaseSchema, record: Record<string, unknown>, index: number) {
  const primaryKey = schema.primaryKey;
  const nameField = primaryKey ?? schema.fields[0]?.name;
  const nameValue = nameField ? formatValue(schema.fields.find((f) => f.name === nameField) ?? schema.fields[0], record[nameField]) : "Record";
  const name = `#${index + 1} ${nameField ?? "record"}: ${nameValue}`;
  const description = schema.fields
    .filter((field) => field.name !== nameField)
    .map((field) => `${field.name}=${formatValue(field, record[field.name])}`)
    .join(" · ");
  return { name, description: description || "(no additional fields)" };
}

function buildDetailsText(schema: DatabaseSchema, record: Record<string, unknown> | null) {
  if (!record) {
    return "No record selected.";
  }
  return schema.fields
    .map((field) => `${field.name}: ${formatValue(field, record[field.name])}`)
    .join("\n");
}

function formPlaceholder(field: FieldSchema) {
  if (field.type === "date") {
    return "YYYY-MM-DD";
  }
  if (field.type === "time") {
    return "HH:MM or HH:MM:SS";
  }
  if (field.type === "number") {
    return "123";
  }
  if (field.type === "text") {
    return "";
  }
  return "";
}

function isTextEntry(renderable: Renderable | null): renderable is InputRenderable {
  return Boolean(renderable && renderable instanceof InputRenderable);
}

async function startApp(
  schema: DatabaseSchema,
  schemaDisplay: string,
  dbPath: string,
  loaded: LoadedDatabase,
  version: string,
) {
  const renderer = await createCliRenderer({
    exitOnCtrlC: true,
    useConsole: false,
  });

  const app = new BoxRenderable(renderer, {
    id: "app",
    width: "100%",
    height: "100%",
    flexDirection: "column",
    gap: 1,
    padding: 1,
  });

  const headerDescription = schema.description ? ` — ${schema.description}` : "";
  const header = new TextRenderable(renderer, {
    id: "header",
    content: `Reqman v${version} · ${schema.name}${headerDescription}`,
    height: 1,
  });

  const meta = new TextRenderable(renderer, {
    id: "meta",
    content: `Schema: ${schemaDisplay}\nDB: ${dbPath}`,
    height: 2,
  });

  const tabs = new TabSelectRenderable(renderer, {
    id: "tabs",
    height: 3,
    tabWidth: 14,
    showDescription: false,
    showUnderline: true,
    options: [
      { name: "List", description: "Browse records", value: "list" },
      { name: "New", description: "Create record", value: "new" },
      { name: "Edit", description: "Edit selected", value: "edit" },
    ],
  });

  const body = new BoxRenderable(renderer, {
    id: "body",
    flexDirection: "row",
    flexGrow: 1,
    gap: 1,
  });

  const leftPanel = new BoxRenderable(renderer, {
    id: "left-panel",
    flexDirection: "column",
    flexGrow: 1,
    flexBasis: 0,
    minWidth: 0,
    border: true,
    title: "Records",
    padding: 1,
    gap: 1,
  });

  const rightPanel = new BoxRenderable(renderer, {
    id: "right-panel",
    flexDirection: "column",
    flexGrow: 1,
    flexBasis: 0,
    minWidth: 0,
    border: true,
    title: "Details",
    padding: 1,
    gap: 1,
  });

  const listContainer = new BoxRenderable(renderer, {
    id: "list-container",
    flexDirection: "column",
    flexGrow: 1,
    gap: 1,
  });

  const filterRow = new BoxRenderable(renderer, {
    id: "filter-row",
    flexDirection: "row",
    gap: 1,
  });

  const filterLabel = new TextRenderable(renderer, {
    id: "filter-label",
    content: "Filter",
    height: 1,
  });

  const filterInput = new InputRenderable(renderer, {
    id: "filter-input",
    placeholder: "field:value or search term",
    flexGrow: 1,
    height: 1,
  });

  const list = new SelectRenderable(renderer, {
    id: "record-list",
    flexGrow: 1,
    wrapSelection: true,
    showDescription: true,
    showScrollIndicator: true,
  });

  filterRow.add(filterLabel);
  filterRow.add(filterInput);
  listContainer.add(filterRow);
  listContainer.add(list);

  const formContainer = new BoxRenderable(renderer, {
    id: "form-container",
    flexDirection: "column",
    flexGrow: 1,
    gap: 1,
    visible: false,
  });

  const detailsContainer = new BoxRenderable(renderer, {
    id: "details-container",
    flexDirection: "column",
    flexGrow: 1,
    gap: 1,
  });

  const detailsText = new TextRenderable(renderer, {
    id: "details-text",
    content: "No record selected.",
  });

  detailsContainer.add(detailsText);

  const previewContainer = new BoxRenderable(renderer, {
    id: "preview-container",
    flexDirection: "column",
    flexGrow: 1,
    gap: 1,
    visible: false,
  });

  const previewText = new TextRenderable(renderer, {
    id: "preview-text",
    content: "",
  });

  previewContainer.add(previewText);

  const footer = new BoxRenderable(renderer, {
    id: "footer",
    flexDirection: "column",
    height: 2,
  });

  const helpText = new TextRenderable(renderer, {
    id: "help-text",
    content: "",
    height: 1,
  });

  const statusText = new TextRenderable(renderer, {
    id: "status-text",
    content: "",
    height: 1,
  });

  footer.add(helpText);
  footer.add(statusText);

  leftPanel.add(listContainer);
  leftPanel.add(formContainer);
  rightPanel.add(detailsContainer);
  rightPanel.add(previewContainer);
  body.add(leftPanel);
  body.add(rightPanel);
  app.add(header);
  app.add(meta);
  app.add(tabs);
  app.add(body);
  app.add(footer);
  renderer.root.add(app);

  let mode: Mode = "list";
  let records = loaded.records;
  let filteredIndices = records.map((_record, index) => index);
  let filterValue = "";
  let selectedRecordIndex: number | null = null;
  let editingIndex: number | null = null;
  let focusedRenderable: Renderable | null = null;
  let focusOrder: Renderable[] = [];
  let focusIndex = 0;
  const formValues: Record<string, FormValue> = {};

  const fieldControls: FieldControl[] = schema.fields.map((field) => {
    const container = new BoxRenderable(renderer, {
      id: `field-${field.name}`,
      flexDirection: "column",
      gap: 0,
    });
    const label = new TextRenderable(renderer, {
      id: `label-${field.name}`,
      content: formatFieldLabel(field),
      height: 1,
    });

    let input: InputRenderable | TabSelectRenderable | SelectRenderable;
    if (field.type === "boolean") {
      input = new TabSelectRenderable(renderer, {
        id: `input-${field.name}`,
        height: 3,
        tabWidth: 8,
        showDescription: false,
        showUnderline: true,
        options: [
          { name: "true", description: "true", value: true },
          { name: "false", description: "false", value: false },
        ],
      });
    } else if (field.type === "choice") {
      const options = field.options ?? [];
      const height = Math.min(6, Math.max(3, options.length));
      input = new SelectRenderable(renderer, {
        id: `input-${field.name}`,
        height,
        wrapSelection: true,
        showDescription: false,
        showScrollIndicator: options.length > height,
        options: options.map((option) => ({
          name: option,
          description: option,
          value: option,
        })),
      });
    } else {
      input = new InputRenderable(renderer, {
        id: `input-${field.name}`,
        height: 1,
        placeholder: formPlaceholder(field),
      });
    }

    container.add(label);
    container.add(input);
    formContainer.add(container);

    return { field, container, input, label };
  });

  function setStatus(message: string) {
    statusText.content = message;
    statusText.requestRender();
  }

  function setHelp(message: string) {
    helpText.content = message;
    helpText.requestRender();
  }

  function setFocus(order: Renderable[], index = 0) {
    focusOrder = order;
    focusIndex = Math.max(0, Math.min(order.length - 1, index));
    if (order.length === 0) {
      focusedRenderable = null;
      return;
    }
    focusRenderable(order[focusIndex]);
  }

  function cycleFocus(delta: number) {
    if (focusOrder.length === 0) {
      return;
    }
    focusIndex = (focusIndex + delta + focusOrder.length) % focusOrder.length;
    focusRenderable(focusOrder[focusIndex]);
  }

  function focusRenderable(renderable: Renderable) {
    const nextIndex = focusOrder.indexOf(renderable);
    if (nextIndex !== -1) {
      focusIndex = nextIndex;
    }
    focusedRenderable = renderable;
    renderable.focus();
  }

  function updateHelpForMode() {
    if (mode === "list") {
      setHelp("Keys: n=new  e=edit  d=delete  f=filter  tab=focus  ctrl+q=quit");
    } else {
      setHelp("Keys: ctrl+s=save  esc=cancel  tab=next  shift+tab=prev  ctrl+q=quit");
    }
  }

  function updateList() {
    filteredIndices = filterRecords(records, schema, filterValue);
    const options = filteredIndices.map((index) => {
      const record = records[index];
      return recordSummary(schema, record, index);
    });
    list.options = options;
    if (options.length === 0) {
      selectedRecordIndex = null;
      detailsText.content = "No records found.";
      detailsText.requestRender();
      return;
    }
    const boundedIndex = Math.max(0, Math.min(list.getSelectedIndex(), options.length - 1));
    list.setSelectedIndex(boundedIndex);
    selectedRecordIndex = filteredIndices[boundedIndex] ?? null;
    detailsText.content = buildDetailsText(schema, selectedRecordIndex !== null ? records[selectedRecordIndex] : null);
    detailsText.requestRender();
  }

  function updatePreview() {
    const lines = schema.fields.map((field) => {
      const value = formValues[field.name];
      const displayValue = value === undefined ? "" : String(value);
      return `${field.name}: ${displayValue}`;
    });
    previewText.content = `Preview\n${lines.join("\n")}`;
    previewText.requestRender();
  }

  function setMode(nextMode: Mode) {
    mode = nextMode;
    tabs.setSelectedIndex(nextMode === "list" ? 0 : nextMode === "new" ? 1 : 2);
    const inForm = nextMode !== "list";
    listContainer.visible = !inForm;
    formContainer.visible = inForm;
    detailsContainer.visible = !inForm;
    previewContainer.visible = inForm;
    leftPanel.title = inForm ? (nextMode === "new" ? "New Record" : "Edit Record") : "Records";
    rightPanel.title = inForm ? "Preview" : "Details";
    updateHelpForMode();
    if (inForm) {
      const inputs = fieldControls.map((control) => control.input);
      setFocus(inputs, 0);
    } else {
      setFocus([list, filterInput], 0);
    }
    renderer.requestRender();
  }

  function resetFormValues(record?: Record<string, unknown>) {
    for (const control of fieldControls) {
      const { field, input } = control;
      const value = record?.[field.name];
      if (input instanceof InputRenderable) {
        const textValue = value === undefined || value === null ? "" : String(value instanceof Date ? formatDateValue(field.type, value) : value);
        input.value = textValue;
        formValues[field.name] = textValue;
      } else if (input instanceof TabSelectRenderable) {
        const boolValue = Boolean(value);
        input.setSelectedIndex(boolValue ? 0 : 1);
        formValues[field.name] = boolValue;
      } else {
        const options = field.options ?? [];
        const valueString = value === undefined || value === null ? "" : String(value);
        const selectedIndex = Math.max(0, options.findIndex((option) => option === valueString));
        input.setSelectedIndex(selectedIndex);
        formValues[field.name] = options[selectedIndex] ?? "";
      }
    }
    updatePreview();
  }

  function openNewRecord() {
    editingIndex = null;
    resetFormValues();
    setStatus("Creating new record.");
    setMode("new");
  }

  function openEditRecord() {
    if (selectedRecordIndex === null) {
      setStatus("Select a record to edit.");
      return;
    }
    editingIndex = selectedRecordIndex;
    resetFormValues(records[selectedRecordIndex]);
    setStatus(`Editing record #${selectedRecordIndex + 1}.`);
    setMode("edit");
  }

  function deleteRecord() {
    if (selectedRecordIndex === null) {
      setStatus("Select a record to delete.");
      return;
    }
    records.splice(selectedRecordIndex, 1);
    saveDatabase(dbPath, loaded.data, schema, records);
    setStatus(`Deleted record #${selectedRecordIndex + 1}.`);
    updateList();
  }

  function saveForm() {
    const { record, errors } = buildRecordFromForm(schema, formValues);
    if (errors.length > 0) {
      setStatus(`Validation errors: ${errors.join(" ")}`);
      return;
    }
    if (mode === "new") {
      records.push(record);
      saveDatabase(dbPath, loaded.data, schema, records);
      setStatus(`Added record #${records.length}.`);
    } else if (mode === "edit" && editingIndex !== null) {
      records[editingIndex] = record;
      saveDatabase(dbPath, loaded.data, schema, records);
      setStatus(`Updated record #${editingIndex + 1}.`);
    }
    updateList();
    setMode("list");
  }

  function cancelForm() {
    setStatus("Edit cancelled.");
    setMode("list");
  }

  filterInput.on(InputRenderableEvents.INPUT, (value: string) => {
    filterValue = value;
    updateList();
  });

  list.on(SelectRenderableEvents.SELECTION_CHANGED, (index: number) => {
    selectedRecordIndex = filteredIndices[index] ?? null;
    detailsText.content = buildDetailsText(schema, selectedRecordIndex !== null ? records[selectedRecordIndex] : null);
    detailsText.requestRender();
  });

  for (const control of fieldControls) {
    if (control.input instanceof InputRenderable) {
      control.input.on(InputRenderableEvents.INPUT, (value: string) => {
        formValues[control.field.name] = value;
        updatePreview();
      });
    } else if (control.input instanceof TabSelectRenderable) {
      control.input.on(TabSelectRenderableEvents.SELECTION_CHANGED, (_index: number, option: { value?: unknown }) => {
        formValues[control.field.name] = Boolean(option.value);
        updatePreview();
      });
    } else {
      control.input.on(SelectRenderableEvents.SELECTION_CHANGED, (index: number) => {
        const options = control.field.options ?? [];
        formValues[control.field.name] = options[index] ?? "";
        updatePreview();
      });
    }
  }

  renderer.keyInput.on("keypress", (event: KeyEvent) => {
    if (event.ctrl && event.name === "q") {
      event.preventDefault();
      renderer.destroy();
      return;
    }

    if (event.name === "tab") {
      event.preventDefault();
      cycleFocus(event.shift ? -1 : 1);
      return;
    }

    if (mode !== "list") {
      if (event.name === "escape" || event.name === "esc") {
        event.preventDefault();
        cancelForm();
        return;
      }
      if (event.ctrl && event.name === "s") {
        event.preventDefault();
        saveForm();
        return;
      }
    }

    if (mode === "list") {
      if (event.name === "f" && !isTextEntry(focusedRenderable)) {
        event.preventDefault();
        focusRenderable(filterInput);
        return;
      }

      if (!isTextEntry(focusedRenderable)) {
        if (event.name === "n") {
          event.preventDefault();
          openNewRecord();
          return;
        }
        if (event.name === "e") {
          event.preventDefault();
          openEditRecord();
          return;
        }
        if (event.name === "d") {
          event.preventDefault();
          deleteRecord();
          return;
        }
      }

      if ((event.name === "return" || event.name === "enter") && focusedRenderable === list) {
        event.preventDefault();
        openEditRecord();
      }
    }
  });

  filterValue = "";
  updateList();
  updateHelpForMode();
  setStatus(`Loaded ${records.length} record(s) from ${path.basename(dbPath)}.`);
  setMode("list");
  renderer.start();
}

function loadSchemaFromDatabase(dbPath: string): DatabaseSchema {
  const raw = fs.readFileSync(dbPath, "utf8");
  const content = raw.trim();
  if (!content) {
    throw new Error(
      `Database '${dbPath}' is empty and does not include an embedded schema. Provide --schema to create it.`,
    );
  }

  let data: Record<string, unknown>;
  try {
    data = parseToml(raw) as Record<string, unknown>;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse database TOML: ${message}`);
  }

  const metaValue = data[REQMAN_META_TABLE];
  if (!metaValue || typeof metaValue !== "object" || Array.isArray(metaValue)) {
    throw new Error(
      `Database '${dbPath}' does not include an embedded schema. Provide --schema to create or update it.`,
    );
  }

  const meta = metaValue as Record<string, unknown>;
  const schemaVersion = meta[REQMAN_SCHEMA_VERSION_KEY];
  if (schemaVersion !== undefined && typeof schemaVersion !== "number") {
    throw new Error(
      `Database '${dbPath}' has invalid embedded schema version metadata.`,
    );
  }
  if (typeof schemaVersion === "number" && schemaVersion !== REQMAN_SCHEMA_VERSION) {
    throw new Error(
      `Database '${dbPath}' has unsupported embedded schema_version=${schemaVersion}.`,
    );
  }

  const schemaJson = meta[REQMAN_SCHEMA_JSON_KEY];
  if (typeof schemaJson !== "string" || !schemaJson.trim()) {
    throw new Error(
      `Database '${dbPath}' does not include an embedded schema. Provide --schema to create or update it.`,
    );
  }

  let schemaRaw: unknown;
  try {
    schemaRaw = JSON.parse(schemaJson.trim());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Embedded schema in '${dbPath}' is not valid JSON: ${message}`);
  }

  return parseSchema(schemaRaw);
}

async function main() {
  const version = getAppVersion();
  const { schemaPath, dbPath } = parseArgs(process.argv.slice(2));

  let schema: DatabaseSchema;
  let schemaDisplay: string;
  if (schemaPath) {
    const schemaRaw = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
    schema = parseSchema(schemaRaw);
    schemaDisplay = schemaPath;
    ensureDatabaseFile(dbPath, schema);
  } else {
    if (!fs.existsSync(dbPath)) {
      throw new Error(`Database file not found: ${dbPath}\nProvide --schema to create it.`);
    }
    schema = loadSchemaFromDatabase(dbPath);
    schemaDisplay = "embedded in database";
  }

  const loaded = loadDatabase(dbPath, schema);
  await startApp(schema, schemaDisplay, dbPath, loaded, version);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
