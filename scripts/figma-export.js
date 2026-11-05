/**
 * Figma variable exporter (Plugin API snippet).
 *
 * This is NOT a standalone Node script — the official REST `variables/local`
 * endpoint requires an Enterprise plan, so instead this snippet runs inside the
 * Figma file via the Figma MCP `use_figma` tool (Plugin API). It dumps every
 * local variable collection, mode and variable into the compact JSON shape that
 * `scripts/figma-to-tokens.mjs` consumes.
 *
 * HOW TO REFRESH A SNAPSHOT:
 *   1. Pick the source in `tokens/sources.json` and ask the assistant (with the
 *      Figma MCP enabled) to run this snippet via `use_figma` against that
 *      source's `fileKey`.
 *   2. Save the returned JSON over the source's `snapshot` file, keeping its
 *      `$meta` block.
 *   3. Run `npm run build` and read the migration report it prints.
 *
 * Output shape (compact):
 *   - colors are emitted as hex strings (`#rrggbb` or `#rrggbbaa`)
 *   - `"*"` under `values` means the value is identical across every mode
 *   - `{ a, ac }` is an alias to variable name `a` in collection id `ac`
 *   - aliases to variables from a linked library point at a collection listed
 *     with `remote: true` (name only, no modes); the build resolves them by
 *     collection name + variable name against the merged token set
 */

// --- Begin Plugin API snippet (paste as the `code` arg of use_figma) ---------
/* eslint-disable */
async function exportFigmaVariables() {
  function toHex(c) {
    const f = (x) => Math.round(x * 255).toString(16).padStart(2, "0");
    let s = "#" + f(c.r) + f(c.g) + f(c.b);
    if (c.a !== undefined && c.a < 1) s += f(c.a);
    return s;
  }

  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  const variables = await figma.variables.getLocalVariablesAsync();

  const idToName = {};
  for (const v of variables) {
    idToName[v.id] = { name: v.name, c: v.variableCollectionId };
  }

  // Library variables are not returned by getLocalVariablesAsync, so alias
  // targets that live in a linked library are looked up one by one.
  const remoteCollections = {};
  async function aliasTarget(id) {
    if (!(id in idToName)) {
      const v = await figma.variables.getVariableByIdAsync(id);
      if (!v) {
        idToName[id] = null;
      } else {
        if (!(v.variableCollectionId in remoteCollections)) {
          const c = await figma.variables.getVariableCollectionByIdAsync(
            v.variableCollectionId
          );
          remoteCollections[v.variableCollectionId] = {
            id: v.variableCollectionId,
            name: c ? c.name : null,
            remote: true,
          };
        }
        idToName[id] = { name: v.name, c: v.variableCollectionId };
      }
    }
    return idToName[id];
  }

  async function conv(val) {
    if (val && typeof val === "object" && val.type === "VARIABLE_ALIAS") {
      const t = await aliasTarget(val.id);
      return { a: t ? t.name : val.id, ac: t ? t.c : null };
    }
    if (val && typeof val === "object" && "r" in val) return toHex(val);
    return val;
  }

  async function compact(valuesByMode) {
    const out = {};
    const keys = Object.keys(valuesByMode);
    const converted = [];
    for (const k of keys) converted.push(await conv(valuesByMode[k]));
    const serialized = converted.map((x) => JSON.stringify(x));
    const allSame = serialized.every((x) => x === serialized[0]);
    if (allSame) {
      out["*"] = converted[0];
      return out;
    }
    keys.forEach((k, i) => (out[k] = converted[i]));
    return out;
  }

  const exportedVariables = [];
  for (const v of variables) {
    exportedVariables.push({
      id: v.id,
      name: v.name,
      type: v.resolvedType,
      c: v.variableCollectionId,
      scopes: v.scopes,
      values: await compact(v.valuesByMode),
    });
  }

  return {
    collections: [
      ...collections.map((c) => ({
        id: c.id,
        name: c.name,
        defaultModeId: c.defaultModeId,
        modes: c.modes,
      })),
      ...Object.values(remoteCollections),
    ],
    variables: exportedVariables,
  };
}
// --- End Plugin API snippet ---------------------------------------------------

if (process.argv.includes("--help")) {
  console.log(
    [
      "figma-export.js is a Figma Plugin API snippet, not a standalone CLI.",
      "Run the `exportFigmaVariables()` body via the Figma MCP `use_figma` tool",
      "against a source listed in tokens/sources.json, save the returned JSON",
      "over that source's snapshot file, then run `npm run build`.",
    ].join("\n")
  );
}

export { exportFigmaVariables };
