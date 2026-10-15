# Module Home Screens

Approved by Austen on 2026-10-15.

## Problem

The desktop sidebar listed "All methods" as a row under Create. It read as a
separate destination rather than the module's own front door. Browse had no
front door at all.

## Design

- A module with a `home` opens it when its sidebar header is clicked. The
  sidebar package (`@austencloud/sidebar` 1.2.0) gained an opt-in
  `opensOnTap` flag for this; the header still expands its sub-rows.
- The "All methods" row is gone. Create's header opens All Methods.
- Browse has a home at bare `/browse`. Its tiles are Explore sequences,
  Explore collections, Explore visuals, and You. Visuals is one tile with
  type chips (tunnels, mandalas) instead of one tile per type, so the board
  does not grow with every new visual type.
- The phone drawer opens a module's home directly instead of drilling into a
  list that repeats it.
- The in-module tab bars on phones keep their home entry. There is no module
  header to tap there, so it is the one-tap way back.

## Behavior notes

- A tab-less switch into Browse means the home. Programmatic handoffs into
  Browse always name a tab, so they skip it.
- The home keeps Browse's inner location underneath it. A tile writes the
  exact inner address even when it matches the location underneath.
- Explore visuals is a development-only surface today, so production shows
  three tiles.

## Out of scope

Live thumbnails on tiles, changes inside Explore and You, and the Mandala and
Playground modules.
