<script lang="ts">
  import { onMount, tick } from 'svelte'
  import type { ResolvedEvent, Unit } from '../../domain/timeline.ts'
  import { parseDate } from '../../domain/dates.ts'
  import type { CreateTimelineRenderer, TimelineRenderer } from '../canvas/TimelineRenderer.ts'
  import type { DotHit, ViewRange } from '../canvas/types.ts'
  import { displayDate } from '../dateLabels.ts'

  let { unit, initialDate, events, disabled, createRenderer, onviewchange }: {
    unit: Unit
    initialDate: string
    events: ResolvedEvent[]
    disabled: boolean
    createRenderer: CreateTimelineRenderer
    onviewchange: (range: ViewRange) => void
  } = $props()
  let canvas: HTMLCanvasElement
  let tooltip: HTMLDivElement
  let renderer = $state.raw<TimelineRenderer | undefined>()
  let hit = $state.raw<DotHit | null>(null)
  let range = $state.raw<ViewRange | undefined>()
  let tooltipX = $state(8)
  let tooltipY = $state(8)
  const label = (date: string) => displayDate(parseDate(date))

  async function showTooltip(next: DotHit | null): Promise<void> {
    hit = next
    if (!next) return
    await tick()
    if (hit !== next) return
    const area = canvas.getBoundingClientRect()
    tooltipX = Math.max(8, Math.min(next.x - tooltip.offsetWidth / 2, area.width - tooltip.offsetWidth - 8))
    tooltipY = Math.max(8, Math.min(next.y - tooltip.offsetHeight - 16, area.height - tooltip.offsetHeight - 8))
  }

  export function scrollToDate(date: string, animate = true): void { renderer?.scrollToDate(date, animate) }
  export function scrollToToday(): void { renderer?.scrollToToday() }

  onMount(() => {
    const engine = createRenderer(canvas, unit)
    engine.setEvents(events)
    engine.scrollToDate(initialDate, false)
    const unsubscribeHover = engine.onHover((next) => { void showTooltip(next) })
    const unsubscribeView = engine.onViewChange((next) => { range = next; onviewchange(next) })
    renderer = engine
    return () => {
      unsubscribeHover()
      unsubscribeView()
      engine.destroy()
      renderer = undefined
      hit = null
    }
  })

  $effect(() => { renderer?.setUnit(unit) })
  $effect(() => { renderer?.setEvents(events) })
</script>

<canvas bind:this={canvas} id="timeline" class="block size-full touch-none cursor-grab outline-offset-[-5px] active:cursor-grabbing" aria-describedby="canvas-help"></canvas>
<p id="canvas-help" class="sr-only">Scroll up into the past and down into the future. Use arrow keys or Page Up and Page Down to navigate, and Home to return to today. Press Enter or Space to inspect the centre dot and Escape to dismiss its tooltip. Open Events to add date ranges.</p>
<div class="pointer-events-none absolute inset-x-0 top-0 z-2 h-20 bg-linear-to-b from-canvas via-canvas/80 to-transparent"></div>
<div class="pointer-events-none absolute inset-x-0 bottom-0 z-2 h-20 bg-linear-to-t from-canvas via-canvas/80 to-transparent"></div>
<div bind:this={tooltip} id="tooltip" class="pointer-events-none absolute z-6 max-w-[min(300px,calc(100%-16px))] rounded-lg bg-zinc-800 px-4 py-3 text-xs leading-6 text-white shadow-lg [&_strong]:font-medium [&_p]:mt-1 [&_p]:text-zinc-300 [&_p]:wrap-anywhere" role="tooltip" hidden={!hit || disabled} style:left="{tooltipX}px" style:top="{tooltipY}px">
  {#if hit}
    {#if hit.today}
      <strong class="flex items-center gap-2"><span class="size-2 rounded-full bg-red-500" aria-hidden="true"></span>Today · {label(hit.today)}</strong>
      <p>{label(hit.start)} — {label(hit.end)}</p>
    {:else}
      <strong>{label(hit.start)} — {label(hit.end)}</strong>
    {/if}
    <p>{hit.events.length ? hit.events.map((event) => event.name).join(' · ') : 'A little piece of time.'}</p>
  {/if}
</div>
<p id="visible-range" class="sr-only">{range ? `${label(range.from)} — ${label(range.to)}` : ''}</p>
