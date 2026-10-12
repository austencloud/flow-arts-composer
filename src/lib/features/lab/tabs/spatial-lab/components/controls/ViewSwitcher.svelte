<script lang="ts">
  type View = "wall" | "wheel" | "floor";

  interface Props {
    active: View;
    onchange: (view: View) => void;
  }

  let { active, onchange }: Props = $props();

  const views: { id: View; label: string; axes: string }[] = [
    { id: "wall", label: "Wall", axes: "X · Y" },
    { id: "wheel", label: "Wheel", axes: "Z · Y" },
    { id: "floor", label: "Floor", axes: "X · Z" },
  ];
</script>

<div class="panel-section">
  <span class="panel-label">Viewing Plane</span>
  <div class="view-switcher">
    {#each views as v}
      <button
        class="view-btn"
        class:active={active === v.id}
        aria-pressed={active === v.id}
        onclick={() => onchange(v.id)}
      >
        {v.label}
        <span class="view-axes">{v.axes}</span>
      </button>
    {/each}
  </div>
</div>

<style>
  .panel-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .panel-label {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 1.2px;
    color: #666;
    font-weight: 600;
  }
  .view-switcher {
    display: flex;
    gap: 4px;
  }
  .view-btn {
    flex: 1;
    padding: 8px 4px;
    border: 1px solid #2a2a4a;
    background: #1a1a35;
    color: #aaa;
    font-size: 11px;
    font-weight: 500;
    cursor: pointer;
    border-radius: 6px;
    transition:
      background var(--duration-normal),
      border-color var(--duration-normal),
      color var(--duration-normal),
      opacity var(--duration-normal),
      transform var(--duration-normal),
      box-shadow var(--duration-normal);
    text-align: center;
    display: flex;
    flex-direction: column;
  }
  .view-btn:hover {
    border-color: #4a4a6a;
    color: #ddd;
  }
  .view-btn.active {
    background: #2a2a5a;
    border-color: #6a6aff;
    color: #fff;
    box-shadow: 0 0 12px rgba(106, 106, 255, 0.15);
  }
  .view-axes {
    font-size: 9px;
    color: #666;
    margin-top: 2px;
  }
  .view-btn.active .view-axes {
    color: #8888cc;
  }
</style>
