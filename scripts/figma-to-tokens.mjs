/**
 * Transform: Figma raw exports -> Style Dictionary (W3C) token files.
 *
 * Reads every source listed in tokens/sources.json (highest priority first),
 * merges their variables and writes, into build/:
 *   - tokens/theme.<slug>.json  (one file per Theme mode, aliases as references)
 *   - meta.json                 (themes + source description for the CSS/TS build)
 *   - migration-report.json     (which source each token came from)
 *
 * Merge rules:
 *   - A variable is identified by collection name + variable name, never by
 *     Figma id, because ids differ between files.
 *   - The first source that defines a variable wins. Lower-priority (legacy)
 *     sources only contribute variables the higher-priority ones lack.
 *   - Aliases are resolved by name against the merged set, so a legacy alias
 *     to `text/primary` points at the winning `text/primary`.
 *   - Theme modes are matched by name. A mode missing from the winning source
 *     falls back to the next source that defines that variable and mode.
 *   - Non-Theme collections (e.g. Brand, Primitives) must have a single mode;
 *     they are emitted under their collection slug in every theme file.
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const TOKENS_DIR = resolve(ROOT, "tokens");
const BUILD = resolve(ROOT, "build");
const OUT_TOKENS = resolve(BUILD, "tokens");

const THEME_COLLECTION = "theme";

/** Figma resolvedType -> W3C `$type`. */
const TYPE_MAP = {
  COLOR: "color",
  FLOAT: "number",
  STRING: "string",
  BOOLEAN: "boolean",
};

/** Lowercase, hyphenate a label (e.g. "Ocean Light" -> "ocean-light"). */
function slugify(label) {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function isThemeCollection(collectionName) {
  return collectionName.toLowerCase() === THEME_COLLECTION;
}

/**
 * Path prefix contributed by a collection. The "Theme" collection is the
 * semantic default and gets no prefix (so `text/primary` -> `--text-primary`),
 * matching Figma dev-mode variable names. Any other collection is namespaced
 * under its slug.
 */
function collectionPrefix(collectionName) {
  if (isThemeCollection(collectionName)) return [];
  return [slugify(collectionName)];
}

/** "surface/page" -> ["surface", "page"] (each segment slugified). */
function nameToPath(name) {
  return name.split("/").map((seg) => slugify(seg));
}

function tokenPath(collectionName, name) {
  return [...collectionPrefix(collectionName), ...nameToPath(name)];
}

function variableKey(collectionName, name) {
  return `${collectionName.toLowerCase()}::${name}`;
}

function setNested(obj, path, value) {
  let cur = obj;
  for (let i = 0; i < path.length - 1; i++) {
    const k = path[i];
    cur[k] ??= {};
    cur = cur[k];
  }
  cur[path[path.length - 1]] = value;
}

function isAlias(value) {
  return value !== null && typeof value === "object" && "alias" in value;
}

/** Comparable string form of a normalized value, for the migration report. */
function describe(value) {
  if (value === undefined) return "(missing)";
  if (isAlias(value)) {
    return `{${value.alias.collection}/${value.alias.name}}`;
  }
  return String(value);
}

/**
 * Load one snapshot and normalize it into collections keyed by name and
 * variables whose values are keyed by mode name, with aliases pointing at
 * collection name + variable name.
 */
function loadSource(source) {
  const raw = JSON.parse(
    readFileSync(resolve(TOKENS_DIR, source.snapshot), "utf8")
  );
  const collectionsById = new Map(raw.collections.map((c) => [c.id, c]));

  const collections = new Map();
  for (const c of raw.collections) {
    if (c.remote) continue;
    if (collections.has(c.name.toLowerCase())) {
      throw new Error(
        `[${source.id}] duplicate local collection name "${c.name}"`
      );
    }
    collections.set(c.name.toLowerCase(), {
      name: c.name,
      modes: c.modes.map((m) => m.name),
      defaultMode: c.modes.find((m) => m.modeId === c.defaultModeId).name,
    });
  }

  function normalizeValue(value, variableName) {
    if (value === null || typeof value !== "object" || !("a" in value)) {
      return value;
    }
    const target = collectionsById.get(value.ac);
    if (!target || !target.name) {
      throw new Error(
        `[${source.id}] ${variableName}: alias target "${value.a}" is in an unknown collection (${value.ac}). Re-export the snapshot with the current scripts/figma-export.js.`
      );
    }
    return { alias: { collection: target.name, name: value.a } };
  }

  const variables = [];
  for (const v of raw.variables) {
    const col = collectionsById.get(v.c);
    const values = {};
    for (const mode of col.modes) {
      const value = "*" in v.values ? v.values["*"] : v.values[mode.modeId];
      if (value === undefined) continue;
      values[mode.name] = normalizeValue(value, v.name);
    }
    variables.push({
      key: variableKey(col.name, v.name),
      collection: col.name,
      name: v.name,
      type: v.type,
      values,
    });
  }

  return { ...source, collections, variables };
}

/** Merge sources (highest priority first) into one variable set. */
function mergeSources(sources) {
  // Collection definitions come from the highest-priority source defining them.
  const collections = new Map();
  for (const src of sources) {
    for (const [key, col] of src.collections) {
      if (!collections.has(key)) collections.set(key, { ...col, source: src.id });
    }
  }

  const merged = new Map();
  for (const src of sources) {
    for (const v of src.variables) {
      const existing = merged.get(v.key);
      if (!existing) {
        merged.set(v.key, { ...v, source: src.id, candidates: [{ source: src.id, values: v.values }] });
        continue;
      }
      if (existing.type !== v.type) {
        throw new Error(
          `${v.collection}/${v.name} is ${existing.type} in "${existing.source}" but ${v.type} in "${src.id}"`
        );
      }
      existing.candidates.push({ source: src.id, values: v.values });
    }
  }

  // Fill each variable's modes from its candidates in priority order.
  for (const v of merged.values()) {
    const col = collections.get(v.collection.toLowerCase());
    v.values = {};
    v.valueSources = {};
    for (const mode of col.modes) {
      const hit = v.candidates.find((c) => mode in c.values);
      if (!hit) {
        throw new Error(
          `${v.collection}/${v.name} has no value for mode "${mode}" in any source`
        );
      }
      v.values[mode] = hit.values[mode];
      v.valueSources[mode] = hit.source;
    }
  }

  return { collections, variables: merged };
}

function buildReport(sources, merged) {
  const contributions = Object.fromEntries(sources.map((s) => [s.id, []]));
  const fallbacks = [];
  const overrides = [];

  for (const v of merged.variables.values()) {
    const id = `${v.collection}/${v.name}`;
    contributions[v.source].push(id);

    const borrowed = Object.entries(v.valueSources).filter(
      ([, src]) => src !== v.source
    );
    if (borrowed.length) {
      fallbacks.push({
        token: id,
        modes: Object.fromEntries(borrowed),
      });
    }

    for (const shadowed of v.candidates.slice(1)) {
      const diff = {};
      for (const [mode, value] of Object.entries(shadowed.values)) {
        if (describe(value) !== describe(v.values[mode])) {
          diff[mode] = { [shadowed.source]: describe(value), used: describe(v.values[mode]) };
        }
      }
      if (Object.keys(diff).length) {
        overrides.push({ token: id, winner: v.source, shadowed: shadowed.source, modes: diff });
      }
    }
  }

  for (const list of Object.values(contributions)) list.sort();
  return {
    sources: sources.map(({ id, name, fileKey, legacy }) => ({
      id,
      name,
      fileKey,
      legacy: Boolean(legacy),
      tokens: contributions[id].length,
    })),
    pendingMigration: sources
      .filter((s) => s.legacy)
      .flatMap((s) => contributions[s.id].map((token) => ({ token, source: s.id }))),
    fallbacks,
    overrides,
  };
}

function printReport(report) {
  console.log("Token sources (highest priority first):");
  for (const s of report.sources) {
    console.log(
      `  ${s.legacy ? "legacy " : "primary"}  ${s.name} (${s.fileKey}): ${s.tokens} tokens`
    );
  }
  if (report.pendingMigration.length) {
    console.log(
      `\n${report.pendingMigration.length} tokens still come only from a legacy source:`
    );
    for (const p of report.pendingMigration) console.log(`  ${p.token}  <- ${p.source}`);
  }
  if (report.fallbacks.length) {
    console.log(`\n${report.fallbacks.length} tokens borrow some modes from a lower-priority source:`);
    for (const f of report.fallbacks) {
      console.log(`  ${f.token}: ${Object.keys(f.modes).join(", ")}`);
    }
  }
  if (report.overrides.length) {
    console.log(`\n${report.overrides.length} tokens differ from a lower-priority source (higher priority wins):`);
    for (const o of report.overrides) {
      const modes = Object.entries(o.modes)
        .map(([mode, d]) => `${mode} ${d[o.shadowed]} -> ${d.used}`)
        .join("; ");
      console.log(`  ${o.token}: ${modes}`);
    }
  }
  console.log("\nFull report: build/migration-report.json");
}

function main() {
  const config = JSON.parse(
    readFileSync(resolve(TOKENS_DIR, "sources.json"), "utf8")
  );
  if (!config.sources?.length) throw new Error("tokens/sources.json lists no sources");
  const sources = config.sources.map(loadSource);
  const merged = mergeSources(sources);

  const themeCol = merged.collections.get(THEME_COLLECTION);
  if (!themeCol) throw new Error('No source defines a "Theme" collection');

  for (const col of merged.collections.values()) {
    if (!isThemeCollection(col.name) && col.modes.length !== 1) {
      throw new Error(
        `Collection "${col.name}" has ${col.modes.length} modes; only the Theme collection may have more than one`
      );
    }
  }

  // Guard against two variables collapsing onto the same CSS custom property.
  const pathOwners = new Map();
  for (const v of merged.variables.values()) {
    const cssName = tokenPath(v.collection, v.name).join("-");
    const owner = pathOwners.get(cssName);
    if (owner) {
      throw new Error(`--${cssName} is produced by both ${owner} and ${v.collection}/${v.name}`);
    }
    pathOwners.set(cssName, `${v.collection}/${v.name}`);
  }

  function toValue(value, from) {
    if (!isAlias(value)) return value;
    const { collection, name } = value.alias;
    if (!merged.variables.has(variableKey(collection, name))) {
      throw new Error(
        `${from}: alias target ${collection}/${name} is not defined by any source`
      );
    }
    return `{${tokenPath(collection, name).join(".")}}`;
  }

  rmSync(OUT_TOKENS, { recursive: true, force: true });
  mkdirSync(OUT_TOKENS, { recursive: true });

  const themes = themeCol.modes.map((mode) => ({ name: mode, slug: slugify(mode) }));

  for (const theme of themes) {
    const tokens = {};
    for (const v of merged.variables.values()) {
      const col = merged.collections.get(v.collection.toLowerCase());
      const mode = isThemeCollection(v.collection) ? theme.name : col.defaultMode;
      setNested(tokens, tokenPath(v.collection, v.name), {
        $type: TYPE_MAP[v.type] ?? "string",
        $value: toValue(v.values[mode], `${v.collection}/${v.name} (${mode})`),
      });
    }
    writeFileSync(
      resolve(OUT_TOKENS, `theme.${theme.slug}.json`),
      JSON.stringify(tokens, null, 2)
    );
  }

  const primary = sources[0];
  const legacy = sources.filter((s) => s.legacy);
  const meta = {
    source:
      `Figma - ${primary.name}` +
      (legacy.length ? ` (+ legacy ${legacy.map((s) => s.name).join(", ")})` : ""),
    defaultTheme: slugify(themeCol.defaultMode),
    themes,
  };
  mkdirSync(BUILD, { recursive: true });
  writeFileSync(resolve(BUILD, "meta.json"), JSON.stringify(meta, null, 2));

  const report = buildReport(sources, merged);
  writeFileSync(
    resolve(BUILD, "migration-report.json"),
    JSON.stringify(report, null, 2)
  );

  console.log(`Wrote ${themes.length} theme files to build/tokens/\n`);
  printReport(report);
}

main();
