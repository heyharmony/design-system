# @heyharmony/design-system

Design tokens (themes, variables, colors) extracted from Figma.
The primary source is the **Application - Main** file in the Harmony Global Inc. organization.
The legacy **Harmony-2026** file still fills in tokens that have not been migrated yet (see [Sources and migration](#sources-and-migration)).
Outputs:

- **CSS custom properties** (`dist/css/tokens.css`) — `:root` defaults plus one
  `[data-theme="..."]` block per theme.
- **Typed TypeScript** (`dist/index.{js,cjs,d.ts}`) — token values, the theme
  list, and helpers, fully typed.
- **JSON** (`dist/tokens.json`) — resolved values per theme, for any tooling.

There is a single `Theme` collection with **15 themes**: semantic tokens
(`--surface-page`, `--text-primary`, `--tab-*`, `--composer-*`, `--dropdown-*`, …) across the
modes: `light` (default), `dark`, `white`, `black`, `doodles`, `ocean-light`,
`ocean-dark`, `ayu-light`, `ayu-dark`, `berry-light`, `berry-dark`,
`forest-light`, `forest-dark`, `sand-light`, `sand-dark`.

## Install

Installed straight from GitHub with pnpm — no registry needed. The package
builds itself on install via the `prepare` script.

```bash
pnpm add github:heyharmony/design-system
```

Pin to a specific tag/branch/commit if you want a stable version:

```bash
pnpm add github:heyharmony/design-system#v0.1.0
```

If you install with lifecycle scripts disabled (`--ignore-scripts`, which npm 11
also applies to git dependencies), use the prebuilt `dist` branch instead. CI
rebuilds it on every push to `main`:

```bash
npm install github:heyharmony/design-system#dist
```

## Usage in a React / TypeScript app

### 1. Load the CSS once (e.g. in your app entry)

```ts
import "@heyharmony/design-system/css";
```

This registers every custom property. `:root` carries the default (`light`)
theme, so the variables work immediately.

### 2. Reference the variables in CSS

```css
.card {
  background: var(--surface-page);
  color: var(--text-primary);
  border: 1px solid var(--border-subtle);
}

.tab--active {
  background: var(--tab-bg-active);
  color: var(--tab-text-active);
}
```

Focus state for inputs is driven by the per-component focus tokens
(`--input-border-focus`, `--composer-border-focus`, `--dropdown-border-focus`),
which all alias the foundation accent `--border-focus`. Width and offset stay in
app CSS (tokens are color-only):

```css
.input:focus-visible {
  outline: 2px solid var(--input-border-focus);
  outline-offset: 1px;
}
```

### 3. Switch themes at runtime

Themes are activated by a `data-theme` attribute on the root element.

```tsx
import { setTheme, themes, defaultTheme, type ThemeSlug } from "@heyharmony/design-system";

function ThemePicker() {
  return (
    <select
      defaultValue={defaultTheme}
      onChange={(e) => setTheme(e.target.value as ThemeSlug)}
    >
      {themes.map((t) => (
        <option key={t.slug} value={t.slug}>
          {t.name}
        </option>
      ))}
    </select>
  );
}
```

`setTheme("dark")` sets `data-theme="dark"` on `document.documentElement`. Pass a
second argument to scope a theme to a subtree:

```ts
setTheme("ocean-dark", document.getElementById("panel")!);
```

### 4. Read resolved values programmatically

```ts
import { getToken, getThemeVars } from "@heyharmony/design-system";

getToken("--text-primary");          // default theme -> "#0a0a0a"
getToken("--text-primary", "dark");  // -> "#ffffff"

getThemeVars("dark");                // { "--surface-page": "#171717", ... }
```

All token names (`CssVar`), theme slugs (`ThemeSlug`) and values are typed, so
typos are caught at compile time.

## How tokens are extracted and built

The Figma variables `variables/local` REST endpoint requires an Enterprise
plan, so this package instead snapshots the variables through the Figma plugin
API and transforms that snapshot locally.

```
Figma files listed in tokens/sources.json
  └─ scripts/figma-export.js          # Plugin API snippet, run via the Figma MCP
       └─ tokens/<source>.raw.json    # one committed snapshot per source
            └─ scripts/figma-to-tokens.mjs   # merge by priority -> build/tokens/*.json + build/migration-report.json
                 └─ style-dictionary.config.mjs  # -> dist/css/tokens.css, dist/tokens.json, src/generated/tokens.ts
                      └─ tsup + tsc               # -> dist/index.{js,cjs}, dist/**/*.d.ts
```

### Build

```bash
npm run build        # tokens -> css/json/ts -> bundle
```

Individual steps:

| Script             | Output                                                        |
| ------------------ | ------------------------------------------------------------- |
| `npm run tokens`   | `build/tokens/*.json`, `build/meta.json`, `build/migration-report.json` |
| `npm run build:css`| `dist/css/tokens.css`, `dist/tokens.json`, generated TS data  |
| `npm run build:ts` | `dist/index.{js,cjs}` (tsup), `dist/**/*.d.ts` (tsc)           |

### Sources and migration

[`tokens/sources.json`](tokens/sources.json) lists the Figma files the tokens come from, highest priority first:

| Priority | Source | fileKey | Snapshot |
| -------- | ------ | ------- | -------- |
| 1 | Application - Main (Harmony Global Inc.) | `3ydPIEBYQf60Fgm1TcjTIS` | `tokens/application-main.raw.json` |
| 2, legacy | Harmony-2026 | `AA8bwpQKSB21xbeNgDR8wu` | `tokens/harmony-2026.raw.json` |

`npm run tokens` merges the snapshots into one token set:

- Variables are matched by collection name + variable name, not by Figma id.
- The first source that defines a variable wins; a legacy source only contributes variables the sources above it lack.
- Aliases resolve by name against the merged set, so a legacy alias such as `tab/bar-bg -> surface/canvas` picks up the new file's `surface/canvas`.
- Aliases to a linked library (exported as collections with `remote: true`) resolve the same way, by collection name + variable name.
- Theme modes are matched by name; a mode missing from the winning source falls back to the next source that has it.
- Collections other than `Theme` (for example `Brand`, `Primitives`) must have a single mode and are emitted with their collection as a prefix, e.g. `--primitives-orange-500`.

The build prints a migration report and writes it to `build/migration-report.json`:

- `pendingMigration`: tokens that still come only from a legacy source. These need to be created in the primary file.
- `fallbacks`: tokens whose winning source lacks some modes, borrowed from a lower-priority source.
- `overrides`: tokens defined in several sources with different values, showing which value is used.

The build fails, rather than silently dropping a value, when an alias target exists in no source, when two variables map to the same CSS custom property, or when a variable changes type between sources.

To finish the migration, create every `pendingMigration` token in the primary file, re-export it and rebuild.
When the legacy source contributes 0 tokens, remove it from `tokens/sources.json` and delete its snapshot.
Removing it earlier fails the build if a primary token still aliases a token that only the legacy source defines.

### Refreshing from Figma

Each snapshot is committed.
To update one after its Figma variables change, run the exporter snippet in [`scripts/figma-export.js`](scripts/figma-export.js) via the Figma MCP `use_figma` tool against that source's `fileKey`.
Save the returned JSON over the source's snapshot file, keep its `$meta` block, then run `npm run build` and review the migration report.

The focus border tokens (`border/focus` + `*/border-focus`) exist only in the legacy snapshot.
They could not be written to Harmony-2026 because the editing account's plan capped mode edits at 10, while the Theme collection has 15 modes.
They should now be created in the primary file, which belongs to an organization plan.

## Notes

- Color values preserve Figma's exact hex (including 8-digit alpha such as
  `#ffffff66`).
- Alias variables (e.g. `--tab-bg-active`, `--composer-background`,
  `--dropdown-bg`) are emitted as `var(--…)` references in CSS to stay DRY, and as
  resolved concrete values in `tokens.json` / the TS API.
- The `--dropdown-*` group themes dropdown/select menus: `--dropdown-bg`,
  `--dropdown-border`, `--dropdown-option-bg-hover`,
  `--dropdown-option-bg-selected`, `--dropdown-option-text`,
  `--dropdown-option-text-selected`, `--dropdown-icon`. A matching **Dropdown**
  component (closed trigger + open menu with Default/Hover/Selected options) is
  published in the Figma file, bound to these variables.
- Focus borders use an accent color: `--border-focus` is the foundation accent
  (per theme), and `--composer-border-focus`, `--dropdown-border-focus`,
  `--input-border-focus` alias it. Apply on `:focus-visible`; the ring width and
  offset live in app CSS since tokens are color-only.
