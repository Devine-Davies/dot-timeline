<script lang="ts">
  import { tick } from 'svelte'
  import { parseDate } from '../../domain/dates.ts'
  import type { TimelineEvent } from '../../domain/timeline.ts'
  import { displayDate } from '../dateLabels.ts'
  import type { ActiveEventEntry, EventActions } from '../eventPanelTypes.ts'
  import { iconButton } from '../styles.ts'
  import Icon from './Icon.svelte'

  let { entries, count, newIds, actions, onemptyfocus }: {
    entries: ActiveEventEntry[]
    count: number
    newIds: string[]
    actions: EventActions
    onemptyfocus: () => void
  } = $props()
  let list: HTMLOListElement
  let dragId = $state<string | null>(null)
  const label = (date: string) => displayDate(parseDate(date))

  export function focusEvent(id: string): void {
    const row = [...list.children].find((child) => child instanceof HTMLElement && child.dataset.eventId === id)
    row?.querySelector<HTMLButtonElement>('.event-name')?.focus()
  }

  async function reorder(id: string, offset: number): Promise<void> {
    if (!actions.reorder(id, offset)) return
    await tick()
    focusEvent(id)
  }

  function drop(event: DragEvent, target: ActiveEventEntry): void {
    event.preventDefault()
    const source = entries.find((entry) => entry.selection.eventId === dragId)
    if (source) void reorder(source.selection.eventId, target.selection.order - source.selection.order)
    dragId = null
  }

  async function remove(event: TimelineEvent): Promise<void> {
    actions.remove(event)
    await tick()
    const next = list.querySelector<HTMLButtonElement>('.event-name')
    if (next) next.focus()
    else onemptyfocus()
  }
</script>

<ol bind:this={list} id="active-list">
  {#each entries as entry (entry.selection.eventId)}
    {@const item = entry.selection}
    {@const event = entry.event}
    <li data-event-id={item.eventId} class="active-event group border-b border-line/70 py-2 last:border-0 [&.dragging]:opacity-40{item.visible ? '' : ' is-hidden [&_.event-name]:opacity-40 [&_.event-color]:opacity-40 [&_.event-dates]:opacity-40'}" class:dragging={dragId === item.eventId} draggable="true"
      ondragstart={(e) => { dragId = item.eventId; e.dataTransfer?.setData('text/plain', item.eventId); if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move' }}
      ondragend={() => { dragId = null }}
      ondragover={(e) => { if (dragId) e.preventDefault() }}
      ondrop={(e) => drop(e, entry)}>
      <div class="event-topline flex items-center gap-1">
        <span class="shrink-0 cursor-grab text-zinc-400" title="Drag to reorder"><Icon name="grip" size={14} /></span>
        <input type="color" value={item.color} class="event-color size-11 shrink-0 cursor-pointer bg-transparent p-[15px]" aria-label="Colour for {event.name}" oninput={(e) => actions.recolor(item.eventId, e.currentTarget.value)} />
        <button type="button" class="event-name min-h-11 min-w-0 flex-1 rounded text-left text-sm font-medium leading-5 wrap-anywhere hover:text-muted" title="Go to {event.name}" onclick={() => actions.goTo(event.start)}>{event.name}{#if newIds.includes(item.eventId)}<span class="ml-1.5 rounded bg-canvas px-1.5 py-0.5 text-[10px] font-medium text-muted">New</span>{/if}</button>
        <button type="button" class="icon-button visibility-button {iconButton}" aria-label="{item.visible ? 'Hide' : 'Show'} {event.name}" aria-pressed={item.visible} onclick={() => actions.toggle(item.eventId)}>
          <Icon name={item.visible ? 'eye' : 'eyeOff'} size={17} />
        </button>
      </div>
      <p class="event-dates -mt-1 pl-16 font-mono text-[10px] leading-5 text-muted">{label(event.start)} — {label(event.end)}</p>
      <details class="ml-16">
        <summary class="flex min-h-11 cursor-pointer list-none items-center text-[11px] text-muted hover:text-ink [&::-webkit-details-marker]:hidden">Manage event ···</summary>
        <div class="event-actions flex items-center">
          <button type="button" class="icon-button reorder {iconButton} disabled:opacity-30" aria-label="Move {event.name} up" disabled={item.order === 0} onclick={() => reorder(item.eventId, -1)}>↑</button>
          <button type="button" class="icon-button reorder {iconButton} disabled:opacity-30" aria-label="Move {event.name} down" disabled={item.order === count - 1} onclick={() => reorder(item.eventId, 1)}>↓</button>
          <button type="button" class="text-button remove-button ml-auto min-h-11 rounded px-2 text-xs text-muted underline underline-offset-4 hover:bg-canvas" onclick={() => remove(event)}>Remove</button>
        </div>
      </details>
    </li>
  {/each}
</ol>
