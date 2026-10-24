<script lang="ts">
  import { dialogClass, iconButton } from '../styles.ts'
  import Icon from './Icon.svelte'

  let { onopenchange }: { onopenchange: (open: boolean) => void } = $props()
  let dialog: HTMLDialogElement

  export function open(): void { dialog.showModal(); onopenchange(true) }
</script>

<dialog bind:this={dialog} id="help-dialog" class={dialogClass} aria-labelledby="help-title" onclose={() => onopenchange(false)}>
  <div class="flex items-center justify-between gap-2">
    <h2 id="help-title" class="text-xl font-semibold tracking-tight">One dot. A little time.</h2>
    <button id="close-help" type="button" class={iconButton} aria-label="Close help" onclick={() => dialog.close()}><Icon name="close" /></button>
  </div>
  <p class="my-4 text-sm leading-6 text-muted">Zoom out to see the bigger picture. Put your own life alongside the moments that shaped the world.</p>
  <dl class="text-sm leading-6 [&_dt]:mt-4 [&_dt]:font-semibold [&_dd]:mt-1 [&_dd]:text-muted">
    <dt>Move through time</dt><dd>Scroll or drag the grid. On the grid, use ↑ / ↓, ← / → or Page Up / Down.</dd>
    <dt>Find your way back</dt><dd>Press Home on the grid, or choose Today.</dd>
    <dt>Zoom into the detail</dt><dd>Use the size slider, − / +, or Fit. On the grid, press + / −, hold Ctrl or Command while scrolling, or pinch. At 40 px dots show short dates; at 56 px they show full dates and a bar for every overlapping event. Zoom is remembered separately for each time unit.</dd>
    <dt>Explore a dot</dt><dd>Hover with a mouse or tap on a touch screen. With the grid focused, press Enter or Space to inspect the centre dot; Escape dismisses the tooltip.</dd>
    <dt>Make it personal</dt><dd>Open Events. Add, hide, recolour, or reorder events. The highest event in your list colours overlapping dots. Use the arrow buttons to reorder without dragging.</dd>
    <dt>Keep a view</dt><dd>The address bar follows your view. Bookmark or copy it to keep a place in time. Your events stay on this device.</dd>
  </dl>
  <p class="mt-5 text-xs text-muted">Weeks start on Monday. All date calculations use UTC.</p>
</dialog>
