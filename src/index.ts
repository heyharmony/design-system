/**
 * @heyharmony/design-system — design tokens from the Figma Harmony-2026 file.
 *
 * - Import the CSS once to register the custom properties:
 *     import "@heyharmony/design-system/css";
 * - Use the typed values / helpers from this module for programmatic access.
 */
export {
  themes,
  defaultTheme,
  themeVars,
} from "./generated/tokens";

export type {
  Theme,
  ThemeSlug,
  ThemeVar,
  CssVar,
} from "./generated/tokens";

import {
  themeVars,
  defaultTheme,
  type ThemeSlug,
  type CssVar,
} from "./generated/tokens";

/** The data-attribute used on the root element to select a theme. */
export const THEME_ATTRIBUTE = "data-theme";

/**
 * All CSS custom properties for the given theme as a `{ "--name": value }`
 * map with concrete, resolved values. Defaults to the default theme.
 */
export function getThemeVars(
  theme: ThemeSlug = defaultTheme
): Record<CssVar, string> {
  return { ...themeVars[theme] } as Record<CssVar, string>;
}

/** Read a single resolved token value for a theme (defaults to the default theme). */
export function getToken(
  name: CssVar,
  theme: ThemeSlug = defaultTheme
): string | undefined {
  return getThemeVars(theme)[name];
}

/**
 * Apply a theme by setting `data-theme` on the target element
 * (defaults to `document.documentElement`). No-op outside the browser.
 */
export function setTheme(
  theme: ThemeSlug,
  element?: HTMLElement
): void {
  const el =
    element ??
    (typeof document !== "undefined" ? document.documentElement : undefined);
  if (el) el.setAttribute(THEME_ATTRIBUTE, theme);
}
