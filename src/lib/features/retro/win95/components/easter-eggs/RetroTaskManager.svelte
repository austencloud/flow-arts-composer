<!--
  RetroTaskManager - TKA-OS Task Manager easter egg

  Opens when Ctrl+Alt+Delete is pressed. Shows a table of "running processes"
  - every single one is NOTATION.DLL. Values update every 2 seconds.
  "End Task" refuses to terminate NOTATION.DLL. Obviously.

  Domain: Retro Easter Eggs
-->
<script lang="ts">
  import RetroButton from "../primitives/RetroButton.svelte";
  import RetroStatusBar from "../primitives/RetroStatusBar.svelte";

  /* Props                                                               */

  let {
    onclose,
  }: {
    onclose?: () => void;
  } = $props();

  /* Constants                                                           */

  const PROCESS_COUNT = 6;
  const UPDATE_INTERVAL_MS = 2000;

  /** Fixed PIDs - randomized once at mount, never change. */
  const PIDS: number[] = Array.from({ length: PROCESS_COUNT }, () =>
    Math.floor(Math.random() * 1000) + 1000
  );

  /* State                                                               */

  interface ProcessRow {
    pid: number;
    cpu: string;
    mem: string;
  }

  function generateRows(): ProcessRow[] {
    return PIDS.map((pid) => ({
      pid,
      cpu: `${Math.floor(Math.random() * 60 + 1)}%`,
      mem: `${(Math.pow(2, Math.floor(Math.random() * 6)) * 512).toLocaleString()} K`,
    }));
  }

  let rows = $state<ProcessRow[]>(generateRows());
  let statusMessage = $state("Processes: 6");
  let selectedPid = $state<number | null>(null);

  /* ------------------------------------------------------------------ */
  /* Randomize values every 2 seconds                                   */
  /* ------------------------------------------------------------------ */

  $effect(() => {
    const id = setInterval(() => {
      rows = generateRows();
    }, UPDATE_INTERVAL_MS);
    return () => clearInterval(id);
  });

  /* ------------------------------------------------------------------ */
  /* "End Task" button handler                                           */
  /* ------------------------------------------------------------------ */

  function handleEndTask() {
    statusMessage = "Cannot terminate NOTATION.DLL. This process is critical to system operation.";
  }

  const statusPanels = $derived([{ text: statusMessage }]);
</script>

<div class="taskmgr" role="dialog" aria-label="TKA-OS Task Manager">
  <!-- Tab strip (non-functional, pure decoration) -->
  <div class="tab-strip" role="tablist">
    <button class="tab tab-active" type="button" role="tab" aria-selected="true">
      Processes
    </button>
    <button class="tab" type="button" role="tab" aria-selected="false">
      Performance
    </button>
    <button class="tab" type="button" role="tab" aria-selected="false">
      Networking
    </button>
  </div>

  <!-- Process table -->
  <div class="table-wrapper">
    <table class="process-table" aria-label="Running processes">
      <thead>
        <tr>
          <th class="col-name">Image Name</th>
          <th class="col-pid">PID</th>
          <th class="col-cpu">CPU</th>
          <th class="col-mem">Mem Usage</th>
        </tr>
      </thead>
      <tbody>
        {#each rows as row (row.pid)}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
          <tr
            class="process-row"
            class:selected={selectedPid === row.pid}
            onclick={() => (selectedPid = row.pid)}
          >
            <td class="col-name">NOTATION.DLL</td>
            <td class="col-pid">{row.pid}</td>
            <td class="col-cpu">{row.cpu}</td>
            <td class="col-mem">{row.mem}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <!-- Bottom controls -->
  <div class="controls">
    <RetroButton label="End Task" onclick={handleEndTask} />
    <RetroButton label="Close" onclick={onclose} />
  </div>

  <!-- Status bar -->
  <RetroStatusBar panels={statusPanels} />
</div>

<style>
  /* Root container                                                      */
  .taskmgr {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--retro-button-face, #c0c0c0);
    font-family: var(--retro-font-family, "Microsoft Sans Serif", Arial, sans-serif);
    font-size: var(--retro-font-size, 11px);
    color: var(--retro-black, #000);
    user-select: none;
  }

  /* Tab strip                                                           */
  .tab-strip {
    display: flex;
    gap: 0;
    padding: 4px 4px 0;
    border-bottom: 2px solid var(--retro-button-shadow, #808080);
  }

  .tab {
    padding: 3px 10px 2px;
    border: 2px outset var(--retro-button-face, #c0c0c0);
    background: var(--retro-button-face, #c0c0c0);
    font-family: inherit;
    font-size: inherit;
    cursor: pointer;
    color: var(--retro-black, #000);
    position: relative;
    bottom: -2px;
  }

  /* Its own rule: in one rule with the var() shorthand above, replays lose that shorthand. */
  .tab {
    border-bottom: none;
  }

  .tab-active {
    background: var(--retro-button-face, #c0c0c0);
    border-bottom: 2px solid var(--retro-button-face, #c0c0c0);
    z-index: 1;
    font-weight: bold;
  }

  .tab:not(.tab-active) {
    bottom: 0;
    background: #b0b0b0;
  }

  /* Table area                                                          */
  .table-wrapper {
    flex: 1;
    overflow-y: auto;
    border: 2px inset var(--retro-button-face, #c0c0c0);
    margin: 6px 6px 4px;
    background: #fff;
    min-height: 0;
  }

  .process-table {
    width: 100%;
    border-collapse: collapse;
    font-family: inherit;
    font-size: inherit;
  }

  .process-table thead {
    position: sticky;
    top: 0;
    z-index: 1;
  }

  .process-table th {
    background: var(--retro-button-face, #c0c0c0);
    border-right: 1px solid var(--retro-button-shadow, #808080);
    border-bottom: 2px solid var(--retro-button-shadow, #808080);
    padding: 2px 6px;
    text-align: left;
    font-weight: bold;
    white-space: nowrap;
  }

  .process-table td {
    padding: 1px 6px;
    border-bottom: 1px solid #e0e0e0;
    white-space: nowrap;
  }

  .process-row:hover {
    background: #d0d8ff;
  }

  .process-row.selected {
    background: #000080;
    color: #fff;
  }

  /* Column widths */
  .col-name { width: 40%; }
  .col-pid  { width: 15%; text-align: right; }
  .col-cpu  { width: 15%; text-align: right; }
  .col-mem  { width: 30%; text-align: right; }

  /* Controls row                                                        */
  .controls {
    display: flex;
    justify-content: flex-end;
    gap: 6px;
    padding: 4px 6px;
  }
</style>
