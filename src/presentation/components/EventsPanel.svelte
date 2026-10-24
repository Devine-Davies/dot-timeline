<script lang="ts">
  import { tick } from 'svelte'
  import { searchEvents } from '../../domain/events.ts'
  import { CATEGORIES, type TimelineEvent } from '../../domain/timeline.ts'
  import type { ActiveEventEntry, EventActions } from '../eventPanelTypes.ts'
  import { iconButton } from '../styles.ts'
  import ActiveEvents from './ActiveEvents.svelte'
  import EventLibrary from './EventLibrary.svelte'
  import Icon from './Icon.svelte'

  let { open, mobile, modalOpen, entries, activeIds, catalogue, libraryState, actions, onclose, oncreate }: {
    open: boolean
    mobile: boolean
    modalOpen: boolean
    entries: ActiveEventEntry[]
    activeIds: string[]
    catalogue: TimelineEvent[]
    libraryState: 'loading' | 'ready' | 'error'
    actions: EventActions
    onclose: () => void
    oncreate: () => void
  } = $props()
  let panel: HTMLElement
  let closeButton: HTMLButtonElement
  let createButton: HTMLButtonElement
  let activeList: { focusEvent(id: string): void }
  let search = $state('')
  let category = $state('all')
  let results = $derived(searchEvents(catalogue, category, search))

  export function focusClose(): void { closeButton.focus() }

  function handleKeydown(event: KeyboardEvent): void {
    if (!open || modalOpen) return
    if (event.key === 'Escape') { onclose(); return }
    if (event.key !== 'Tab' || !mobile) return
    const focusable = [...panel.querySelectorAll<HTMLElement>('button:not(:disabled), input, a[href]')]
      .filter((element) => element.getClientRects().length > 0)
    const first = focusable[0], last = focusable.at(-1)
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
  }

  async function add(event: TimelineEvent): Promise<void> {
    actions.add(event)
    await tick()
    activeList.focusEvent(event.id)
  }
</script>

<svelte:document onkeydown={handleKeydown} />

<aside bind:this={panel} id="panel" class="fixed inset-y-0 left-0 z-20 flex w-[min(360px,calc(100%-16px))] shrink-0 flex-col border-r border-line bg-white max-md:shadow-xl md:relative md:w-[360px]" aria-labelledby="panel-title" hidden={!open} role={open && mobile ? 'dialog' : undefined} aria-modal={open && mobile ? 'true' : undefined}>
  <div class="min-h-0 flex-1 overflow-y-auto px-6 pt-7 [scrollbar-width:thin]">
    <div class="flex items-center justify-between">
      <a href="./" class="text-[11px] font-semibold tracking-[.18em]" aria-label="Dot Timeline home">DOT TIMELINE</a>
      <button bind:this={closeButton} id="close-panel" type="button" class={iconButton} aria-label="Close event panel" onclick={onclose}><Icon name="close" /></button>
    </div>
    <h1 id="panel-title" class="mt-6 text-[28px] font-semibold tracking-tight">Events</h1>
    <p class="mt-2 text-sm leading-6 text-muted">Highlight spans of time on your timeline.</p>
    <label for="search" class="mt-7 block text-xs font-medium">Search library</label>
    <div class="mt-2 flex items-center gap-2.5 rounded-lg border border-line px-3 text-muted focus-within:ring-2 focus-within:ring-ink">
      <Icon name="search" size={17} /><input bind:value={search} id="search" class="min-h-11 w-full min-w-0 bg-transparent text-[13px] text-ink placeholder:text-muted focus:outline-none" type="search" placeholder="e.g. Olympics, tax year, summer" />
    </div>
    <div id="categories" class="my-5 flex flex-wrap gap-1.5" role="group" aria-label="Filter by category">
      {#each ['all', ...CATEGORIES] as value (value)}
        <button type="button" class="chip min-h-11 rounded-full border border-line px-3 text-xs hover:bg-canvas aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-white" data-category={value} aria-pressed={category === value} onclick={() => { category = value }}>{value === 'all' ? 'All' : value[0]!.toUpperCase() + value.slice(1)}</button>
      {/each}
    </div>
    <section class="border-b border-line pb-5" aria-labelledby="active-title">
      <div class="mb-2 flex items-center justify-between"><h2 id="active-title" class="text-sm font-semibold">On your timeline</h2><span id="active-count" class="font-mono text-xs text-muted">{activeIds.length}</span></div>
      <ActiveEvents bind:this={activeList} {entries} count={activeIds.length} {actions} onemptyfocus={() => createButton.focus()} />
      <p id="active-empty" class="py-5 text-sm leading-6 text-muted" hidden={activeIds.length > 0}>No events yet. Add one from the library<br />or create something of your own.</p>
    </section>
    <section class="py-5" aria-labelledby="library-title">
      <div class="mb-1 flex items-center justify-between"><h2 id="library-title" class="text-sm font-semibold">Library</h2><span id="result-count" class="text-[10px] font-medium tracking-wide text-muted">{results.length} EVENTS</span></div>
      <EventLibrary {results} {activeIds} state={libraryState} onadd={add} ondeletecustom={(event) => { actions.deleteCustom(event); createButton.focus() }} />
    </section>
  </div>
  <div class="shrink-0 border-t border-line bg-white px-6 pt-4 pb-[max(20px,env(safe-area-inset-bottom))]">
    <button bind:this={createButton} id="create-event" type="button" class="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-zinc-400 text-sm font-medium hover:bg-canvas" onclick={oncreate}><Icon name="plus" size={16} /> Create custom event</button>
  </div>
</aside>
