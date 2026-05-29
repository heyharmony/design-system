/**
 * Figma variable exporter (Plugin API snippet).
 *
 * This is NOT a standalone Node script — the official REST `variables/local`
 * endpoint requires an Enterprise plan, so instead this snippet runs inside the
 * Figma file via the Figma MCP `use_figma` tool (Plugin API). It dumps every
 * local variable collection, mode and variable into the compact JSON shape that
 * `scripts/figma-to-tokens.mjs` consumes.
 *
 * HOW TO REFRESH `tokens/figma.raw.json`:
 *   1. Ask the assistant (with the Figma MCP enabled) to run this snippet via
 *      `use_figma` against the Harmony-2026 file
 *      (fileKey: AA8bwpQKSB21xbeNgDR8wu).
 *   2. Save the returned JSON to `tokens/figma.raw.json`.
 *   3. Run `npm run build`.
 *
 * Output shape (compact):
 *   - colors are emitted as hex strings (`#rrggbb` or `#rrggbbaa`)
 *   - `"*"` under `values` means the value is identical across every mode
 *   - `{ a, ac }` is an alias to variable name `a` in collection id `ac`
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

  function conv(val) {
    if (val && typeof val === "object" && val.type === "VARIABLE_ALIAS") {
      const t = idToName[val.id];
      return { a: t ? t.name : val.id, ac: t ? t.c : null };
    }
    if (val && typeof val === "object" && "r" in val) return toHex(val);
    return val;
  }

  function compact(valuesByMode) {
    const out = {};
    const keys = Object.keys(valuesByMode);
    const serialized = keys.map((k) => JSON.stringify(conv(valuesByMode[k])));
    const allSame = serialized.every((x) => x === serialized[0]);
    if (allSame) {
      out["*"] = conv(valuesByMode[keys[0]]);
      return out;
    }
    for (const k of keys) out[k] = conv(valuesByMode[k]);
    return out;
  }

  return {
    collections: collections.map((c) => ({
      id: c.id,
      name: c.name,
      defaultModeId: c.defaultModeId,
      modes: c.modes,
    })),
    variables: variables.map((v) => ({
      id: v.id,
      name: v.name,
      type: v.resolvedType,
      c: v.variableCollectionId,
      scopes: v.scopes,
      values: compact(v.valuesByMode),
    })),
  };
}
// --- End Plugin API snippet ---------------------------------------------------

if (process.argv.includes("--help")) {
  console.log(
    [
      "figma-export.js is a Figma Plugin API snippet, not a standalone CLI.",
      "Run the `exportFigmaVariables()` body via the Figma MCP `use_figma` tool,",
      "then save the returned JSON to tokens/figma.raw.json and run `npm run build`.",
    ].join("\n")
  );
}

export { exportFigmaVariables };
