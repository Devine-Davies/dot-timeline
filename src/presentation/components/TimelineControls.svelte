<script lang="ts">
  import { UNIT_SPECS, type Unit } from '../../domain/timeline.ts'
  import { iconButton } from '../styles.ts'
  import Icon from './Icon.svelte'

  let { unit, panelOpen, activeCount, onpanel, onunit, ontoday }: {
    unit: Unit
    panelOpen: boolean
    activeCount: number
    onpanel: () => void
    onunit: (unit: Unit) => void
    ontoday: () => void
  } = $props()
  let panelButton: HTMLButtonElement

  export function focusPanelButton(): void { panelButton.focus() }
</script>

<nav class="absolute bottom-[max(20px,env(safe-area-inset-bottom))] left-1/2 z-5 flex -translate-x-1/2 items-center gap-1 rounded-full border border-line bg-white p-1.5 shadow-[0_3px_16px_#18181b0a] max-sm:gap-0 max-sm:p-1" aria-label="Timeline controls">
  <button bind:this={panelButton} id="panel-toggle" type="button" class="panel-toggle {iconButton} bg-white text-ink hover:bg-zinc-100 aria-expanded:bg-zinc-100 aria-expanded:hover:bg-zinc-200" aria-label="Events" aria-controls="panel" aria-expanded={panelOpen} onclick={onpanel}>
    <Icon name="panel" /><span id="nav-event-count" class="sr-only">{activeCount}</span>
  </button>
  <div id="units" class="flex" role="group" aria-label="Time per dot">
    {#each UNIT_SPECS as spec (spec.id)}
      <button type="button" class="unit-button inline-flex min-h-11 min-w-11 items-center justify-center rounded-full px-3 font-mono text-xs text-muted hover:bg-canvas aria-pressed:bg-ink aria-pressed:text-white max-sm:px-0 @min-[600px]:font-sans" aria-label={spec.label} aria-pressed={unit === spec.id} data-unit={spec.id} onclick={() => onunit(spec.id)}>
        <span class="@min-[600px]:hidden">{spec.id}</span>
        <span class="hidden @min-[600px]:inline">{spec.label}</span>
      </button>
    {/each}
  </div>
  <button id="today-button" type="button" class="ml-1 inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full border border-line px-3 text-xs font-medium hover:bg-canvas max-sm:ml-0 max-sm:px-2" onclick={ontoday}>
    <Icon name="crosshair" size={14} />Today
  </button>
</nav>
