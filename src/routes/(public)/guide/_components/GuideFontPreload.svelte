<!--
  Preloads the two guide faces a page header paints first: the Tangerine
  title and the Cormorant italic lede. guide.css declares them with
  font-display: block, so the header waits for these instead of flashing
  Segoe Script and Georgia. Render it only on pages whose header uses them;
  a preload the page never paints is a wasted request and a console warning.
-->
<svelte:head>
  <link
    rel="preload"
    href="/fonts/tangerine/tangerine-700-latin.woff2"
    as="font"
    type="font/woff2"
    crossorigin="anonymous"
  />
  <link
    rel="preload"
    href="/fonts/cormorant/cormorant-garamond-latin-500-700-italic.woff2"
    as="font"
    type="font/woff2"
    crossorigin="anonymous"
  />
</svelte:head>
