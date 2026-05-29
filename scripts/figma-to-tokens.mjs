/**
 * Transform: Figma raw export -> Style Dictionary (W3C) token files.
 *
 * Reads tokens/figma.raw.json and writes, into build/tokens/:
 *   - theme.<slug>.json     (one file per Theme mode, with aliases as references)
 * plus build/meta.json describing the themes for the CSS/TS build steps.
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const RAW = resolve(ROOT, "tokens/figma.raw.json");
const OUT_TOKENS = resolve(ROOT, "build/tokens");

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

/**
 * Path prefix contributed by a collection. The "Theme" collection is the
 * semantic default and gets no prefix (so `text/primary` -> `--text-primary`),
 * matching Figma dev-mode variable names. Any other collection is namespaced
 * under its slug.
 */
function collectionPrefix(collectionName) {
  if (collectionName.toLowerCase() === "theme") return [];
  return [slugify(collectionName)];
}

/** "surface/page" -> ["surface", "page"] (each segment slugified). */
function nameToPath(name) {
  return name.split("/").map((seg) => slugify(seg));
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

function main() {
  const raw = JSON.parse(readFileSync(RAW, "utf8"));

  const collectionsById = new Map();
  for (const c of raw.collections) collectionsById.set(c.id, c);

  // name -> path lookup per collection, for resolving aliases to references.
  const aliasPath = new Map(); // key: `${collectionId}::${name}` -> dotted path
  for (const v of raw.variables) {
    const col = collectionsById.get(v.c);
    const path = [...collectionPrefix(col.name), ...nameToPath(v.name)];
    aliasPath.set(`${v.c}::${v.name}`, path.join("."));
  }

  /** Resolve a single variable value (for one mode) into a W3C `$value`. */
  function toValue(val) {
    if (val && typeof val === "object" && "a" in val) {
      const key = `${val.ac}::${val.a}`;
      const path = aliasPath.get(key);
      if (!path) {
        throw new Error(`Unresolved alias target: ${val.a} in ${val.ac}`);
      }
      return `{${path}}`;
    }
    return val;
  }

  /** Get the value of a variable for a given modeId (handles "*"). */
  function valueForMode(variable, modeId) {
    if ("*" in variable.values) return variable.values["*"];
    return variable.values[modeId];
  }

  // Reset output dir.
  rmSync(OUT_TOKENS, { recursive: true, force: true });
  mkdirSync(OUT_TOKENS, { recursive: true });

  // --- Theme collection: one file per mode ---------------------------------
  const themeCol = raw.collections.find((c) => c.name.toLowerCase() === "theme");
  const themeVars = raw.variables.filter((x) => x.c === themeCol.id);

  const themes = themeCol.modes.map((m) => ({
    name: m.name,
    slug: slugify(m.name),
    modeId: m.modeId,
  }));

  for (const mode of themes) {
    const tokens = {};
    for (const v of themeVars) {
      const path = [...collectionPrefix(themeCol.name), ...nameToPath(v.name)];
      setNested(tokens, path, {
        $type: TYPE_MAP[v.type] ?? "string",
        $value: toValue(valueForMode(v, mode.modeId)),
      });
    }
    writeFileSync(
      resolve(OUT_TOKENS, `theme.${mode.slug}.json`),
      JSON.stringify(tokens, null, 2)
    );
  }

  // --- Build metadata -------------------------------------------------------
  const meta = {
    source: raw.$meta?.source ?? "Figma",
    defaultTheme: slugify(
      themeCol.modes.find((m) => m.modeId === themeCol.defaultModeId).name
    ),
    themes,
  };
  mkdirSync(resolve(ROOT, "build"), { recursive: true });
  writeFileSync(
    resolve(ROOT, "build/meta.json"),
    JSON.stringify(meta, null, 2)
  );

  console.log(`Wrote ${themes.length} theme files to build/tokens/`);
}

main();
