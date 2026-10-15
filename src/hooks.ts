import type { Reroute } from "@sveltejs/kit/hooks";
import {
  localizedPageLocale,
  splitLocalePath,
} from "#lib/shared/i18n/seo-locales.js";

/**
 * /de/guide/x renders the /guide/x route. The URL keeps its language folder,
 * which the server hook and the public layout read to pick the page language.
 * Paths with no localized version fall through and 404, since a language
 * folder is not an app module.
 */
export const reroute: Reroute = ({ url }) => {
  if (localizedPageLocale(url.pathname)) {
    return splitLocalePath(url.pathname).path;
  }
  return undefined;
};
