<script lang="ts">
  import { UNIT_SPECS, type Unit } from '../../domain/timeline.ts'
  import { iconButton } from '../styles.ts'
  import Icon from './Icon.svelte'

  let { unit, panelOpen, activeCount, cellSize, minSize, maxSize, onpanel, onunit, onzoom, onfit, ontoday }: {
    unit: Unit
    panelOpen: boolean
    activeCount: number
    cellSize: number
    minSize: number
    maxSize: number
    onpanel: () => void
    onunit: (unit: Unit) => void
    onzoom: (size: number) => void
    onfit: () => void
    ontoday: () => void
  } = $props()
  let panelButton: HTMLButtonElement

  export function focusPanelButton(): void { panelButton.focus() }
</script>

<nav class="timeline-controls absolute bottom-[max(24px,env(safe-area-inset-bottom))] left-1/2 z-5 flex max-w-[calc(100%-16px)] -translate-x-1/2 items-center gap-1 rounded-full border border-line bg-white p-1.5 shadow-[0_14px_32px_#2021241a]" aria-label="Timeline controls">
  <button bind:this={panelButton} id="panel-toggle" type="button" class="panel-toggle {iconButton} shrink-0 bg-white text-ink hover:bg-zinc-100 aria-pressed:bg-zinc-100" aria-label="Events" aria-controls="panel" aria-expanded={panelOpen} aria-pressed={panelOpen} onclick={onpanel}>
    <Icon name="panel" /><span id="nav-event-count" class="sr-only">{activeCount}</span>
  </button>
  <div id="units" class="unit-buttons flex border-x border-line px-1" role="group" aria-label="Time per dot">
    {#each UNIT_SPECS as spec (spec.id)}
      <button type="button" class="unit-button inline-flex min-h-11 min-w-11 items-center justify-center whitespace-nowrap rounded-full px-2.5 text-sm text-muted hover:bg-canvas aria-pressed:bg-ink aria-pressed:text-white" aria-label={spec.label} aria-pressed={unit === spec.id} data-unit={spec.id} onclick={() => onunit(spec.id)}>
        {spec.label}
      </button>
    {/each}
  </div>
  <select class="unit-select hidden min-h-11 min-w-24 rounded-full border border-line bg-white px-2 text-sm" aria-label="Time per dot" value={unit} onchange={(event) => onunit(event.currentTarget.value as Unit)}>
    {#each UNIT_SPECS as spec (spec.id)}<option value={spec.id}>{spec.label}</option>{/each}
  </select>
  <div class="flex shrink-0 items-center" role="group" aria-label="Dot size">
    <button type="button" class={iconButton} aria-label="Zoom out" disabled={cellSize <= minSize} onclick={() => onzoom(Math.max(minSize, cellSize - 4))}><Icon name="minus" /></button>
    <label class="zoom-slider flex items-center gap-2 px-1">
      <span class="sr-only">Dot size in pixels</span>
      <input class="h-11 w-22 accent-ink" type="range" min={minSize} max={maxSize} step="any" value={cellSize} oninput={(event) => onzoom(Number(event.currentTarget.value))} aria-valuetext={`${Math.round(cellSize)} pixels`} />
      <span class="w-12 whitespace-nowrap font-mono text-xs text-muted" aria-hidden="true">{Math.round(cellSize)} px</span>
    </label>
    <button type="button" class={iconButton} aria-label="Zoom in" disabled={cellSize >= maxSize} onclick={() => onzoom(Math.min(maxSize, cellSize + 4))}><Icon name="plus" /></button>
    <button type="button" class="fit-button mr-1 inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-line text-sm hover:bg-canvas" onclick={onfit}>Fit</button>
  </div>
  <button id="today-button" type="button" class="inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-full border border-line px-3 text-sm font-medium hover:bg-canvas" onclick={ontoday}>
    <Icon name="crosshair" size={14} />Today
  </button>
</nav>

<style>
  @container (max-width: 999px) {
    .zoom-slider { display: none; }
  }
  @container (max-width: 699px) {
    .unit-button { padding-inline: 7px; font-size: 12px; }
  }
  @container (max-width: 599px) {
    .unit-buttons, .fit-button { display: none; }
    .unit-select { display: block; }
  }
</style>
