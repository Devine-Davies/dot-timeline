<script lang="ts">
  import { onMount, tick, untrack } from 'svelte'
  import type { Writable } from 'svelte/store'
  import type { TimelineApplication } from '../application/TimelineApplication.ts'
  import { UNIT_SPECS, type TimelineEvent, type Unit } from '../domain/timeline.ts'
  import type { CreateTimelineRenderer } from './canvas/TimelineRenderer.ts'
  import type { ViewRange } from './canvas/types.ts'
  import type { ActiveEventEntry, EventActions, GroupActions } from './eventPanelTypes.ts'
  import CustomEventDialog from './components/CustomEventDialog.svelte'
  import EventsPanel from './components/EventsPanel.svelte'
  import HelpDialog from './components/HelpDialog.svelte'
  import TimelineCanvas from './components/TimelineCanvas.svelte'
  import TimelineControls from './components/TimelineControls.svelte'

  let { application, createRenderer, notifications }: {
    application: TimelineApplication
    createRenderer: CreateTimelineRenderer
    notifications: Writable<string>
  } = $props()

  function readEvents() {
    const entries: ActiveEventEntry[] = application.active.flatMap((selection) => {
      const event = application.eventById(selection.eventId)
      return event ? [{ selection, event }] : []
    })
    return {
      entries,
      activeIds: application.active.map((item) => item.eventId),
      catalogue: application.searchEvents('all', ''),
      overlays: application.resolvedEvents(),
      groups: application.groups,
      activeGroup: application.activeGroup,
      groupChanges: application.groupChanges,
      groupPreview: application.active.map((item) => ({
        id: item.eventId, name: application.eventById(item.eventId)?.name ?? `Unavailable event (${item.eventId})`, color: item.color,
      })),
    }
  }

  let events = $state.raw(readEvents())
  let view = $state.raw(untrack(() => ({ ...application.view })))
  let mobile = $state(false)
  let modalOpen = $state(false)
  let libraryState = $state<'loading' | 'ready' | 'error'>('loading')
  let layout = $state.raw<ViewRange | undefined>()
  let canvas: { scrollToDate(date: string, animate?: boolean): void; scrollToToday(): void; setZoom(size: number): void; fit(): void }
  let panel: { focusClose(): void }
  let controls: { focusPanelButton(): void }
  let customDialog: { open(): Promise<void> }
  let helpDialog: { open(): void }
  let persistTimer: ReturnType<typeof setTimeout> | undefined
  const announce = (message: string) => notifications.set(message)
  const refreshEvents = () => { events = readEvents() }

  const actions: EventActions = {
    add(event) {
      application.addEvent(event.id)
      refreshEvents()
      announce(`${event.name} added to your timeline.`)
    },
    remove(event) {
      application.removeEvent(event.id)
      refreshEvents()
      announce(`${event.name} removed. You can add it again from the library.`)
    },
    deleteCustom(event) { application.deleteCustomEvent(event.id); refreshEvents() },
    recolor(id, color) { application.setEventColor(id, color); refreshEvents() },
    toggle(id) { application.toggleEventVisibility(id); refreshEvents() },
    reorder(id, offset) {
      if (!application.reorderEvent(id, offset)) return false
      refreshEvents()
      announce('Event priority updated.')
      return true
    },
    goTo(date) { canvas.scrollToDate(date, true) },
  }

  const groupActions: GroupActions = {
    save(name, makeActive) {
      const group = application.saveGroup(name, makeActive)
      refreshEvents()
      announce(`${group.name} saved${makeActive ? ' and active' : ''}.`)
    },
    select(id, changes) {
      application.selectGroup(id, changes)
      refreshEvents()
      announce(`${application.activeGroup!.name} loaded. Timeline events replaced.`)
    },
    update() { application.updateGroup(); refreshEvents(); announce('Group updated.') },
    rename(name) { application.renameGroup(name); refreshEvents(); announce('Group renamed.') },
    discard() { application.discardGroupChanges(); refreshEvents(); announce('Changes discarded. Saved group restored.') },
    leave() { application.leaveGroup(); refreshEvents(); announce('Group left. Your timeline events are unchanged.') },
    delete() { application.deleteGroup(); refreshEvents(); announce('Group deleted. Your timeline events are unchanged.') },
  }

  async function setPanel(open: boolean): Promise<void> {
    application.setPanelOpen(open)
    view = { ...application.view }
    await tick()
    if (open) panel.focusClose()
    else controls.focusPanelButton()
  }

  function setUnit(unit: Unit): void {
    application.setUnit(unit)
    view = { ...application.view }
  }

  function viewChanged(range: ViewRange): void {
    layout = range
    application.setCenterDate(range.centerDate)
    application.setZoom(range.cellSize)
    view = { ...application.view }
    clearTimeout(persistTimer)
    persistTimer = setTimeout(() => application.rememberView(), 180)
  }

  function restoreLocation(): void {
    const restored = application.restoreLocation()
    view = { ...application.view }
    if (restored.centerDate) canvas.scrollToDate(restored.centerDate, false)
  }

  function createCustomEvent(input: Pick<TimelineEvent, 'name' | 'start' | 'end' | 'color'>): void {
    const event = application.createCustomEvent(input)
    refreshEvents()
    announce(`${event.name} added to your timeline.`)
  }

  onMount(() => {
    let disposed = false
    const query = window.matchMedia('(max-width: 767px)')
    mobile = query.matches
    const resize = async () => {
      mobile = query.matches
      await tick()
      if (!disposed && view.panelOpen) panel.focusClose()
    }
    query.addEventListener('change', resize)
    if (mobile && view.panelOpen) void tick().then(() => { if (!disposed) panel.focusClose() })
    void application.loadLibrary().then(() => {
      if (disposed) return
      libraryState = 'ready'
      refreshEvents()
    }).catch((error: unknown) => {
      if (disposed) return
      console.error('Could not load the event library.', error)
      libraryState = 'error'
    })
    return () => {
      disposed = true
      clearTimeout(persistTimer)
      application.flush()
      query.removeEventListener('change', resize)
      document.body.classList.remove('panel-open', 'mobile-panel')
    }
  })

  $effect(() => {
    document.body.classList.toggle('panel-open', view.panelOpen)
    document.body.classList.toggle('mobile-panel', view.panelOpen && mobile)
  })
</script>

<svelte:window onpopstate={restoreLocation} onpagehide={() => application.flush()} />

<div class="flex h-dvh w-full overflow-hidden">
  <EventsPanel bind:this={panel} open={view.panelOpen} {mobile} {modalOpen} entries={events.entries} activeIds={events.activeIds} catalogue={events.catalogue} {libraryState} {actions} groups={events.groups} activeGroup={events.activeGroup} groupChanges={events.groupChanges} groupPreview={events.groupPreview} {groupActions} onmodalchange={(open) => { modalOpen = open }} onclose={() => setPanel(false)} oncreate={() => customDialog.open()} />
  <button id="backdrop" type="button" tabindex="-1" aria-label="Close event panel" class="fixed inset-0 z-15 bg-ink/25 backdrop-blur-xs" hidden={!(view.panelOpen && mobile)} onclick={() => setPanel(false)}></button>
  <main id="timeline-area" class="@container relative h-full min-w-0 flex-1 overflow-hidden bg-canvas" inert={view.panelOpen && mobile}>
    <header class="pointer-events-none absolute inset-x-4 top-4 z-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 @min-[1000px]:inset-x-8 @min-[1000px]:top-6">
      <div class="flex flex-wrap items-center gap-3">
        <button type="button" class="pointer-events-auto min-h-11 text-sm font-semibold tracking-tight @min-[1000px]:text-base" aria-label="How to use Dot Timeline" onclick={() => helpDialog.open()}>Dot Timeline</button>
        <p id="scale-caption" class="whitespace-nowrap rounded-full border border-slate-300 bg-white px-3 py-1.5 font-mono text-[10px] text-muted @min-[1000px]:text-xs">1 dot = {UNIT_SPECS.find((spec) => spec.id === view.unit)!.label} · 1 row = {UNIT_SPECS.find((spec) => spec.id === view.unit)!.rowLabel}</p>
      </div>
      <div class="flex max-w-full min-w-0 items-center gap-4 rounded-full bg-canvas/95 text-xs text-muted" aria-label="Timeline legend">
        <div class="flex min-w-0 items-center gap-4 overflow-hidden">
          {#each events.overlays as event (event.id)}
            <span class="flex shrink-0 items-center gap-1.5"><i class:rounded-full={!(layout && layout.cellSize >= 56)} class="w-3 shrink-0" class:h-1={layout && layout.cellSize >= 56} class:h-2.5={!(layout && layout.cellSize >= 56)} style:background={event.color}></i><span class="max-w-40 truncate">{event.name}</span></span>
          {/each}
        </div>
        <span class="flex shrink-0 items-center gap-1.5"><i class="size-2.5 rounded-full bg-red-500"></i>Today</span>
      </div>
    </header>
    <TimelineCanvas bind:this={canvas} unit={view.unit} zoom={view.zoomByUnit[view.unit]} initialDate={view.centerDate} events={events.overlays} disabled={view.panelOpen && mobile} {createRenderer} onviewchange={viewChanged} />
    <TimelineControls bind:this={controls} unit={view.unit} panelOpen={view.panelOpen} activeCount={events.activeIds.length} cellSize={layout?.cellSize ?? 12} minSize={layout?.minCellSize ?? 6} maxSize={layout?.maxCellSize ?? 72} onpanel={() => setPanel(!view.panelOpen)} onunit={setUnit} onzoom={(size) => canvas.setZoom(size)} onfit={() => canvas.fit()} ontoday={() => canvas.scrollToToday()} />
  </main>
  <div id="status" class="sr-only" role="status" aria-live="polite">{$notifications}</div>
  <CustomEventDialog bind:this={customDialog} oncreate={createCustomEvent} onopenchange={(open) => { modalOpen = open }} />
  <HelpDialog bind:this={helpDialog} onopenchange={(open) => { modalOpen = open }} />
</div>
