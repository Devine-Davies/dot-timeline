<script lang="ts">
  import { tick } from 'svelte'
  import { parseDate } from '../../domain/dates.ts'
  import type { EventGroup } from '../../domain/timeline.ts'
  import type { GroupActions, GroupDialogRequest, GroupEventPreview } from '../eventPanelTypes.ts'
  import GroupDialog from './GroupDialog.svelte'
  import Icon from './Icon.svelte'

  let { groups, activeGroup, changes, preview, count, panelOpen, actions, onopenchange }: {
    groups: EventGroup[]
    activeGroup: EventGroup | undefined
    changes: number
    preview: GroupEventPreview[]
    count: number
    panelOpen: boolean
    actions: GroupActions
    onopenchange: (open: boolean) => void
  } = $props()
  let root: HTMLDivElement
  let pickerButton: HTMLButtonElement
  let manageButton = $state<HTMLButtonElement>()
  let dialog: { open(request: GroupDialogRequest): Promise<void> }
  let popup = $state<'picker' | 'manage' | null>(null)
  const menuButton = 'flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm hover:bg-canvas disabled:opacity-40'
  const savedDate = (value: string) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(parseDate(value))

  export function closePopup(): boolean {
    if (!popup) return false
    const button = popup === 'picker' ? pickerButton : manageButton
    popup = null
    button?.focus()
    return true
  }

  function openDialog(request: GroupDialogRequest): void {
    closePopup()
    void dialog.open(request)
  }

  function select(group: EventGroup): void {
    closePopup()
    if (activeGroup?.id === group.id) return
    if (changes) openDialog({ kind: 'switch', group })
    else actions.select(group.id)
  }

  async function run(action: () => void): Promise<void> {
    closePopup()
    action()
    await tick()
    if (!activeGroup) pickerButton.focus()
  }

  function outside(event: PointerEvent): void {
    if (event.target instanceof Node && !root.contains(event.target)) popup = null
  }

  async function dialogChanged(open: boolean): Promise<void> {
    onopenchange(open)
    if (!open) {
      await tick()
      pickerButton.focus()
    }
  }

  $effect(() => { if (!panelOpen) popup = null })
</script>

<svelte:document onpointerdown={outside} />

{#snippet swatches(colors: string[])}
  <span class="flex shrink-0 -space-x-1.5" aria-hidden="true">
    {#each [...new Set(colors)].slice(0, 3) as color (color)}
      <span class="size-3.5 rounded-full ring-2 ring-white" style:background={color}></span>
    {/each}
  </span>
{/snippet}

<div bind:this={root} class="relative mb-3">
  <div class="mb-2 flex flex-wrap items-center justify-between gap-1">
    <h2 id="active-title" class="text-xs font-semibold text-muted">{activeGroup ? 'Active group' : 'On your timeline'}</h2>
    {#if activeGroup && changes}
      <span id="group-edited" class="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-semibold text-amber-900">Edited · {changes} {changes === 1 ? 'change' : 'changes'}</span>
    {/if}
  </div>
  <div class="flex gap-2">
    <button bind:this={pickerButton} id="group-picker" type="button" class="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-lg border border-line px-3 text-left text-sm font-medium hover:bg-canvas" aria-expanded={popup === 'picker'} aria-controls="group-picker-list" onclick={() => { popup = popup === 'picker' ? null : 'picker' }}>
      {#if activeGroup}
        {@render swatches(preview.map((event) => event.color))}
        <span class="min-w-0 flex-1 truncate">{activeGroup.name}</span>
      {:else}
        <span>No group</span>
        <span id="active-count" class="flex-1 whitespace-nowrap font-mono text-[10px] text-muted">{count} {count === 1 ? 'event' : 'events'}</span>
      {/if}
      <span class:rotate-180={popup === 'picker'}><Icon name="chevron" size={16} /></span>
    </button>
    {#if activeGroup}
      <button bind:this={manageButton} id="manage-group" type="button" class="flex size-11 shrink-0 items-center justify-center rounded-lg border border-line hover:bg-canvas" aria-label="Manage active group" aria-expanded={popup === 'manage'} aria-controls="group-manage-menu" onclick={() => { popup = popup === 'manage' ? null : 'manage' }}><Icon name="more" /></button>
    {:else}
      <button id="save-group" type="button" class="flex min-h-11 items-center gap-1.5 rounded-lg bg-ink px-3 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-40" disabled={!count} onclick={() => openDialog({ kind: 'save' })}><Icon name="bookmark" size={16} />Save</button>
    {/if}
  </div>
  {#if popup === 'picker'}
    <div id="group-picker-list" class="absolute inset-x-0 top-full z-10 mt-2 rounded-xl border border-line bg-white p-2 shadow-xl" role="group" aria-label="Saved groups">
      <p class="px-3 pt-2 pb-1 text-xs font-semibold text-muted">Saved groups</p>
      <div class="max-h-64 overflow-y-auto">
        {#each groups as group (group.id)}
          <button type="button" class="{menuButton} aria-pressed:bg-canvas" aria-pressed={activeGroup?.id === group.id} onclick={() => select(group)}>
            {@render swatches(group.events.map((event) => event.color))}
            <span class="min-w-0">
              <span class="block wrap-anywhere">{group.name}</span>
              <span class="mt-0.5 block font-mono text-[10px] text-muted">{group.events.length} {group.events.length === 1 ? 'event' : 'events'} · saved {savedDate(group.savedAt)}</span>
            </span>
          </button>
        {:else}
          <p class="px-3 py-4 text-xs leading-5 text-muted">No saved groups yet. Save your current events to reuse them later.</p>
        {/each}
      </div>
      <div class="mt-2 border-t border-line pt-2">
        <button type="button" class={menuButton} disabled={!count} onclick={() => openDialog({ kind: 'save' })}><Icon name="plus" size={16} /><span>Save current {count} {count === 1 ? 'event' : 'events'} as a group</span></button>
      </div>
    </div>
  {:else if popup === 'manage' && activeGroup}
    <div id="group-manage-menu" class="absolute inset-x-0 top-full z-10 mt-2 rounded-xl border border-line bg-white p-2 shadow-xl" role="group" aria-label="Manage active group">
      <button type="button" class="{menuButton} bg-canvas" disabled={!changes} onclick={() => run(actions.update)}><Icon name="check" /><span>Update group<span class="block text-xs text-muted">{changes ? `Save ${changes} ${changes === 1 ? 'change' : 'changes'} to this group` : 'No unsaved changes'}</span></span></button>
      <button type="button" class={menuButton} disabled={!count} onclick={() => openDialog({ kind: 'save' })}><Icon name="copy" />Save as new group...</button>
      <button type="button" class={menuButton} onclick={() => openDialog({ kind: 'rename' })}><Icon name="edit" />Rename...</button>
      <button type="button" class={menuButton} disabled={!changes} onclick={() => openDialog({ kind: 'discard' })}><Icon name="undo" />Discard changes</button>
      <button type="button" class={menuButton} onclick={() => run(actions.leave)}><Icon name="leave" />Leave group, keep events</button>
      <div class="mt-2 border-t border-line pt-2">
        <button type="button" class="{menuButton} text-red-700" onclick={() => openDialog({ kind: 'delete' })}><Icon name="trash" />Delete group</button>
      </div>
    </div>
  {/if}
</div>
<GroupDialog bind:this={dialog} {activeGroup} {preview} {actions} onopenchange={dialogChanged} />
