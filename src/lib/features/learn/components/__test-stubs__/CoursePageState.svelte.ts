// A reactive stand-in for $app/state's page. The shared test stub is a plain
// object, so nothing re-derives when a test moves it the way SvelteKit's
// router does.
export const page = $state({
  url: new URL("https://tkaflowarts.test/learn/concepts"),
  state: {} as App.PageState,
});
