/**
 * Build step: Style Dictionary -> multi-theme CSS + resolved JSON + typed TS.
 *
 * Consumes build/tokens/*.json (produced by scripts/figma-to-tokens.mjs) and
 * writes:
 *   - dist/css/tokens.css      (:root defaults + one [data-theme] block per mode)
 *   - dist/tokens.json         (resolved values, per theme, machine-readable)
 *   - src/generated/tokens.ts  (typed data consumed by src/index.ts)
 *
 * Style Dictionary is used as the engine that parses the W3C token files,
 * resolves aliases, formats CSS custom properties and resolves references to
 * concrete values for the JSON/TS output.
 */
import StyleDictionary from "style-dictionary";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const TOKENS_DIR = resolve(ROOT, "build/tokens");
const DIST = resolve(ROOT, "dist");

// --- Custom hooks -----------------------------------------------------------

// CSS var name = token path joined with "-" (e.g. ["surface","page"]
// -> "surface-page"), with no global prefix.
StyleDictionary.registerTransform({
  name: "name/figma-kebab",
  type: "name",
  transform: (token) => token.path.join("-"),
});

// Preserve the exact hex string from Figma (incl. 8-digit alpha like #ffffff66)
// instead of Style Dictionary's default rgba() conversion.
StyleDictionary.registerTransform({
  name: "color/figma-hex",
  type: "value",
  transitive: true,
  filter: (token) => (token.$type ?? token.type) === "color",
  transform: (token) => token.$value ?? token.value,
});

const TRANSFORMS = ["attribute/cti", "name/figma-kebab", "color/figma-hex"];

/** Build a Style Dictionary instance for a set of token files. */
function makeSD(sources, selector) {
  return new StyleDictionary({
    source: sources,
    platforms: {
      css: {
        transforms: TRANSFORMS,
        files: [
          {
            destination: "tokens.css",
            format: "css/variables",
            options: { selector, outputReferences: true },
          },
        ],
      },
    },
    log: { verbosity: "silent", warnings: "disabled" },
  });
}

function stripHeader(css) {
  return css.replace(/^\/\*\*[\s\S]*?\*\/\s*/, "").trimEnd();
}

/** Resolved { "--name": value } map for a set of token files. */
async function resolvedVars(sources) {
  const sd = makeSD(sources, ":root");
  const dict = await sd.getPlatformTokens("css");
  const out = {};
  for (const t of dict.allTokens) out[`--${t.name}`] = t.$value ?? t.value;
  return out;
}

/** CSS block (string) for a set of token files under a selector. */
async function cssBlock(sources, selector) {
  const sd = makeSD(sources, selector);
  const files = await sd.formatPlatform("css");
  return stripHeader(files[0].output);
}

async function main() {
  const meta = JSON.parse(readFileSync(resolve(ROOT, "build/meta.json"), "utf8"));
  const themeFile = (slug) => resolve(TOKENS_DIR, `theme.${slug}.json`);
  const defaultSlug = meta.defaultTheme;

  // --- CSS ------------------------------------------------------------------
  const blocks = [];

  // :root => default theme defaults.
  blocks.push(await cssBlock([themeFile(defaultSlug)], ":root"));

  // One [data-theme="..."] block per mode (including the default, so it can be
  // re-selected explicitly).
  for (const theme of meta.themes) {
    blocks.push(
      await cssBlock([themeFile(theme.slug)], `[data-theme="${theme.slug}"]`)
    );
  }

  const header = [
    "/**",
    ` * ${meta.source} — design tokens.`,
    " * AUTO-GENERATED — do not edit by hand. Run `npm run build`.",
    " */",
  ].join("\n");

  mkdirSync(resolve(DIST, "css"), { recursive: true });
  writeFileSync(
    resolve(DIST, "css/tokens.css"),
    `${header}\n\n${blocks.join("\n\n")}\n`
  );

  // --- Resolved values (JSON + TS) -----------------------------------------
  const themeVars = {};
  for (const theme of meta.themes) {
    themeVars[theme.slug] = await resolvedVars([themeFile(theme.slug)]);
  }

  const jsonOut = {
    $meta: {
      source: meta.source,
      generated: new Date().toISOString(),
    },
    defaultTheme: defaultSlug,
    themes: meta.themes.map(({ name, slug }) => ({ name, slug })),
    themeVars,
  };
  writeFileSync(resolve(DIST, "tokens.json"), JSON.stringify(jsonOut, null, 2));

  // Typed TS data module.
  const themesLiteral = JSON.stringify(
    meta.themes.map(({ name, slug }) => ({ name, slug }))
  );
  const ts = `// ${meta.source} — design tokens.
// AUTO-GENERATED — do not edit by hand. Run \`npm run build\`.

export const themes = ${themesLiteral} as const;

export type Theme = (typeof themes)[number];
export type ThemeSlug = Theme["slug"];

export const defaultTheme = ${JSON.stringify(defaultSlug)} as ThemeSlug;

export const themeVars = ${JSON.stringify(themeVars, null, 2)} as const;

export type ThemeVar = keyof (typeof themeVars)[ThemeSlug];

export type CssVar = ThemeVar;
`;
  mkdirSync(resolve(ROOT, "src/generated"), { recursive: true });
  writeFileSync(resolve(ROOT, "src/generated/tokens.ts"), ts);

  console.log(
    `Built dist/css/tokens.css (${blocks.length} blocks), dist/tokens.json and src/generated/tokens.ts`
  );
}

main();
