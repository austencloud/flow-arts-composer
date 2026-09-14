export interface CardReviewImage {
  adapter: string;
  png: string;
  diff: string;
  width: number;
  height: number;
  diffPercent: number | null;
}

export interface CardReviewEntry {
  name: string;
  description: string;
  options: unknown;
  composer: string;
  width: number;
  height: number;
  comparisons: CardReviewImage[];
}

/** A review artifact must keep working after its temporary renderer is stopped. */
export function cardReviewDocument(entries: CardReviewEntry[]): string {
  const data = JSON.stringify(entries).replace(/</g, "\\u003c");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Choreo card profiles · side-by-side review</title>
<style>
  :root { color-scheme: dark; font: 16px/1.5 system-ui,sans-serif; background:#14151a; color:#f3f3f5; }
  * { box-sizing:border-box; } body { margin:0; } main { max-width:1800px; margin:auto; padding:clamp(16px,3vw,40px); }
  h1 { font-size:clamp(26px,3vw,40px); line-height:1.15; margin:0 0 14px; } p { max-width:85ch; margin:8px 0; }
  .muted { color:#b9bdc9; } .controls { display:flex; flex-wrap:wrap; gap:16px; padding:24px 0; }
  label { display:flex; flex-direction:column; gap:6px; min-width:0; } select { font:inherit; min-height:44px; max-width:100%; padding:8px 12px; border:1px solid #737987; border-radius:6px; background:#252832; color:inherit; }
  :focus-visible { outline:3px solid #a4caff; outline-offset:3px; }
  .comparison { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:24px; margin-top:24px; align-items:start; }
  figure { margin:0; min-width:0; } figcaption { margin-bottom:12px; font-weight:650; } figcaption span { display:block; font-size:14px; color:#b9bdc9; font-weight:400; }
  img { display:block; max-width:100%; height:auto; margin:0 auto; } .image-well { padding:12px; border:1px solid #414551; border-radius:8px; background:#202228; }
  details { margin-top:24px; } summary { cursor:pointer; min-height:44px; padding:10px 0; } pre { white-space:pre-wrap; overflow-wrap:anywhere; font-size:14px; color:#cbd2df; }
  #difference { max-width:650px; } #verdict { font-weight:600; } footer { margin-top:32px; font-size:14px; color:#b9bdc9; }
  @media(max-width:600px) { .comparison { gap:10px; } .image-well { padding:4px; } .controls label { width:100%; } figcaption { font-size:14px; } }
</style></head><body><main>
<h1>Choreo card profiles</h1>
<p>Compare the app’s card settings with MCP output for the same sequence. Viewer cards, flexible exports, and fixed-size print cards are separate uses, not interchangeable presets.</p>
<p class="muted">This is a saved rendering review. All images are embedded. No server, network access, or account is needed.</p>
<div class="controls"><label>Sequence and profile<select id="fixture"></select></label><label>MCP renderer<select id="adapter"><option value="packaged">Packaged MCP</option><option value="source">Source MCP</option></select></label></div>
<h2 id="name"></h2><p id="description"></p><p id="verdict" role="status"></p>
<div class="comparison"><figure><figcaption>Flow Arts Composer<span id="app-size"></span></figcaption><div class="image-well"><img id="app-image" alt="Flow Arts Composer rendering"></div></figure><figure><figcaption id="mcp-caption">MCP<span id="mcp-size"></span></figcaption><div class="image-well"><img id="mcp-image" alt="MCP rendering of the same sequence"></div></figure></div>
<details><summary>Difference image and exact MCP options</summary><p class="muted">Highlighted pixels show raster differences. An image comparison alone does not prove that the selected preset is the right product preset.</p><img id="difference" alt="Highlighted pixel differences"><pre id="options"></pre></details>
<footer>Generated ${new Date().toISOString().slice(0, 10)}. Images preserve their native aspect ratios and are displayed at matching available widths. Print dimensions include bleed. The sequence viewer’s surrounding controls are not part of the exported image.</footer>
</main><script>
const entries=${data};
const fixture=document.getElementById('fixture');
const adapter=document.getElementById('adapter');
for(const [index,entry] of entries.entries()){const option=document.createElement('option');option.value=String(index);option.textContent=entry.name;fixture.append(option);}
function show(){
 const entry=entries[Number(fixture.value)];const comparison=entry.comparisons.find(item=>item.adapter===adapter.value);
 document.getElementById('name').textContent=entry.name;
 document.getElementById('description').textContent=entry.description;
 document.getElementById('app-image').src=entry.composer;
 document.getElementById('mcp-image').src=comparison.png;
 document.getElementById('app-size').textContent=entry.width+' × '+entry.height+' px';
 document.getElementById('mcp-size').textContent=comparison.width+' × '+comparison.height+' px';
 document.getElementById('verdict').textContent=comparison.diffPercent===null?'Dimensions differ. This is a profile mismatch, not a passing parity result.':comparison.diffPercent+'% of pixels differ at the comparison threshold. Inspect the preset and images below.';
 document.getElementById('difference').hidden=!comparison.diff;
 document.getElementById('difference').src=comparison.diff;
 document.getElementById('options').textContent=JSON.stringify(entry.options,null,2);
}
fixture.addEventListener('change',show);adapter.addEventListener('change',show);show();
</script></body></html>`;
}
