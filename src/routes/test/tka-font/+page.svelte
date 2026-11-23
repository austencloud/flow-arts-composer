<script lang="ts">
  /**
   * Dev harness for the TKA Letters webfont. Type in the field and watch ASCII
   * names + dash sequences resolve to TKA glyphs (the underlying text stays what
   * you typed — select it to confirm). Samples below render fixed strings.
   */
  let typed = $state("ABCD  alpha beta gamma  Sigma Phi  W- Sigma-  MU mu  terra");

  const samples: { label: string; text: string }[] = [
    { label: "Type 1 (A–V)", text: "ABCDEFGHIJKLMNOPQRSTUV" },
    { label: "Type 2 (W–Z, Greek)", text: "WXYZ Sigma Delta Theta Omega mu nu" },
    { label: "Type 3 (cross / dash)", text: "W- X- Y- Z- Sigma- Delta- Theta- Omega-" },
    { label: "Type 4/5 (Greek + dash)", text: "Phi Psi Lambda tau- Phi- Psi- Lambda-" },
    { label: "Type 6 (static)", text: "alpha beta gamma zeta eta tau terra" },
    { label: "Word MU vs letter mu", text: "MU  mu" },
    { label: "Word NU vs letter nu", text: "NU  nu" },
  ];
</script>

<div class="wrap">
  <h1>TKA Letters font</h1>
  <p class="hint">
    Type below. ALL-CAPS = literal letters (so <code>MU</code> = M+U); lowercase name =
    lowercase Greek (<code>mu</code> → μ); Capitalized name = uppercase Greek
    (<code>Sigma</code> → Σ); base + <code>-</code> = dash letter (<code>W-</code>).
    Underlying text stays selectable.
  </p>

  <label class="field">
    <span>Live input</span>
    <textarea class="tka-font" bind:value={typed} rows="2" spellcheck="false"></textarea>
  </label>
  <div class="raw">raw text: <code>{typed}</code></div>

  <div class="grid">
    {#each samples as s (s.label)}
      <div class="row">
        <div class="lbl">{s.label}</div>
        <div class="glyphs tka-font">{s.text}</div>
        <div class="src">{s.text}</div>
      </div>
    {/each}
  </div>
</div>

<style>
  .wrap {
    max-width: 900px;
    margin: 0 auto;
    padding: 2rem 1.5rem 5rem;
    color: #16181d;
    background: #fff;
    min-height: 100vh;
  }
  h1 {
    font-size: 1.6rem;
    margin: 0 0 0.5rem;
  }
  .hint {
    color: #55606e;
    line-height: 1.5;
    margin: 0 0 1.5rem;
  }
  code {
    background: #eef1f6;
    padding: 0.05em 0.35em;
    border-radius: 4px;
    font-size: 0.9em;
  }
  .field {
    display: block;
    margin-bottom: 0.5rem;
  }
  .field span {
    display: block;
    font-size: 0.8rem;
    color: #55606e;
    margin-bottom: 0.35rem;
  }
  textarea {
    width: 100%;
    font-size: 2.6rem;
    line-height: 1.25;
    padding: 0.6rem 0.8rem;
    border: 2px solid #c7cdda;
    border-radius: 10px;
    color: #16181d;
    background: #fbfcfe;
    resize: vertical;
  }
  textarea:focus {
    outline: none;
    border-color: #3730a3;
  }
  .raw {
    font-size: 0.85rem;
    color: #55606e;
    margin-bottom: 2rem;
  }
  .grid {
    display: flex;
    flex-direction: column;
    gap: 1.1rem;
  }
  .row {
    border: 1px solid #e6e9f0;
    border-radius: 10px;
    padding: 0.8rem 1rem;
  }
  .lbl {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #7a8494;
    margin-bottom: 0.4rem;
  }
  .glyphs {
    font-size: 3rem;
    line-height: 1.2;
    color: #16181d;
    word-break: break-word;
  }
  .src {
    margin-top: 0.35rem;
    font-size: 0.8rem;
    color: #9aa3b2;
    font-family: ui-monospace, monospace;
  }
  /* the first row clears a phone's status bar; nothing moves when --safe-top is 0 */
  .wrap {
    border-top: var(--safe-top) solid transparent;
  }
</style>
