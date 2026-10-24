<script lang="ts">
  import { onMount, tick } from 'svelte'
  import type { ResolvedEvent, Unit } from '../../domain/timeline.ts'
  import { parseDate } from '../../domain/dates.ts'
  import type { CreateTimelineRenderer, TimelineRenderer } from '../canvas/TimelineRenderer.ts'
  import type { DotHit, ViewRange } from '../canvas/types.ts'
  import { displayDate } from '../dateLabels.ts'
  import Icon from './Icon.svelte'

  let { unit, zoom, initialDate, events, disabled, createRenderer, onviewchange }: {
    unit: Unit
    zoom: number | undefined
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
  let tooltipMaxHeight = $state(320)
  let hideTimer: ReturnType<typeof setTimeout> | undefined
  const label = (date: string) => displayDate(parseDate(date))

  async function showTooltip(next: DotHit | null): Promise<void> {
    clearTimeout(hideTimer)
    if (!next) {
      hideTimer = setTimeout(() => { hit = null }, 100)
      return
    }
    hit = next
    const area = canvas.getBoundingClientRect()
    const gap = Math.max(16, (range?.cellSize ?? 22) * 0.5 + 8)
    const aboveSpace = Math.max(0, next.y - gap - 8)
    const belowSpace = Math.max(0, area.height - next.y - gap - 8)
    tooltipMaxHeight = Math.min(320, Math.max(aboveSpace, belowSpace))
    await tick()
    if (hit !== next) return
    tooltipX = Math.max(8, Math.min(next.x - tooltip.offsetWidth / 2, area.width - tooltip.offsetWidth - 8))
    tooltipY = aboveSpace >= tooltip.offsetHeight ? next.y - tooltip.offsetHeight - gap : next.y + gap
  }

  export function scrollToDate(date: string, animate = true): void { renderer?.scrollToDate(date, animate) }
  export function scrollToToday(): void { renderer?.scrollToToday() }
  export function setZoom(size: number): void { renderer?.setZoom(size) }
  export function fit(): void { renderer?.fit() }

  onMount(() => {
    const engine = createRenderer(canvas, unit)
    engine.setUnit(unit, zoom)
    engine.setEvents(events)
    engine.scrollToDate(initialDate, false)
    const unsubscribeHover = engine.onHover((next) => { void showTooltip(next) })
    const unsubscribeView = engine.onViewChange((next) => { range = next; onviewchange(next) })
    renderer = engine
    return () => {
      clearTimeout(hideTimer)
      unsubscribeHover()
      unsubscribeView()
      engine.destroy()
      renderer = undefined
      hit = null
    }
  })

  $effect(() => { renderer?.setUnit(unit, zoom) })
  $effect(() => { renderer?.setEvents(events) })
</script>

<canvas bind:this={canvas} id="timeline" class="block size-full touch-none cursor-grab outline-offset-[-5px] active:cursor-grabbing" aria-describedby="canvas-help"></canvas>
<p id="canvas-help" class="sr-only">Scroll up into the past and down into the future. Use arrow keys or Page Up and Page Down to navigate, and Home to return to today. Use plus or minus, Ctrl or Command with the wheel, or pinch to zoom. Press Enter or Space to inspect the centre dot and Escape to dismiss its tooltip. Open Events to add date ranges.</p>
<div class="pointer-events-none absolute inset-x-0 top-0 z-2 h-20 bg-linear-to-b from-canvas via-canvas/80 to-transparent"></div>
<div class="pointer-events-none absolute inset-x-0 bottom-0 z-2 h-20 bg-linear-to-t from-canvas via-canvas/80 to-transparent"></div>
{#if range && range.today.y > 80 && range.today.y < range.height - 140 && !hit?.today}
  <div class="pointer-events-none absolute z-3 flex max-w-[calc(100%-16px)] -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-lg border border-line bg-white px-3 py-1.5 shadow-lg {range.cellSize >= 24 ? 'text-sm' : 'text-xs'}" style:left="clamp(80px, {range.today.x}px, calc(100% - 80px))" style:top="{range.today.y - range.cellSize * 0.5 - 38}px" aria-hidden="true">
    <span class="size-2 rounded-full bg-red-500"></span><strong class="font-semibold">Today</strong>
    <span class="font-mono text-xs text-muted">{range.cellSize >= 56 ? label(range.today.date) : displayDate(parseDate(range.today.date), true)}</span>
  </div>
{/if}
<div bind:this={tooltip} id="tooltip" class="absolute z-6 w-max max-w-[min(300px,calc(100%-16px))] overflow-y-auto rounded-lg bg-ink px-4 py-3 text-sm leading-6 text-white shadow-[0_12px_24px_#20212433]" role="tooltip" hidden={!hit || disabled} style:left="{tooltipX}px" style:top="{tooltipY}px" style:max-height="{tooltipMaxHeight}px" onpointerenter={() => clearTimeout(hideTimer)} onpointerleave={() => { hit = null }}>
  {#if hit}
    {#if hit.today}
      <strong class="flex items-center gap-2"><span class="size-2 rounded-full bg-red-500" aria-hidden="true"></span>Today · {label(hit.today)}</strong>
      <p class="mb-1 font-mono text-xs text-zinc-300">{label(hit.start)} — {label(hit.end)}</p>
    {:else}
      <p class="mb-1 font-mono text-xs text-zinc-300">{unit === '1y' ? displayDate(parseDate(hit.start), true) : `${label(hit.start)} — ${label(hit.end)}`} · {hit.events.length} {hit.events.length === 1 ? 'event' : 'events'}</p>
    {/if}
    {#each hit.events as event (event.id)}
      <p class="flex items-center gap-2 font-medium"><span class="h-1 w-4 shrink-0 rounded-full" style:background={event.color}></span><span class="wrap-anywhere">{event.name}</span></p>
    {:else}
      <p class="text-zinc-300">A little piece of time.</p>
    {/each}
  {/if}
</div>
{#if range && range.cellSize >= 40}
  <div class="pointer-events-none absolute bottom-24 left-1/2 z-3 flex max-w-[calc(100%-24px)] -translate-x-1/2 items-center gap-2 rounded-full border border-line bg-white/95 px-3 py-1.5 text-center text-xs text-muted">
    {#if range.cellSize >= 56}
      <span class="flex w-4 shrink-0 flex-col gap-0.5" aria-hidden="true"><span class="h-0.5 rounded-full bg-teal-700"></span><span class="h-0.5 rounded-full bg-blue-600"></span></span>
      A bar under each dot for every event in that {unit === '1y' ? 'year' : 'span'}
    {:else}
      <Icon name="zoom" size={14} />Short dates at this size · zoom in to see every overlapping event
    {/if}
  </div>
{/if}
<p id="visible-range" class="sr-only">{range ? `${label(range.from)} — ${label(range.to)}` : ''}</p>
