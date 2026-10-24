<script lang="ts">
  import { tick } from 'svelte'
  import { InvalidGroupNameError } from '../../application/TimelineApplication.ts'
  import type { EventGroup } from '../../domain/timeline.ts'
  import type { GroupActions, GroupDialogRequest, GroupEventPreview } from '../eventPanelTypes.ts'
  import { dialogClass, fieldClass } from '../styles.ts'

  let { activeGroup, preview, actions, onopenchange }: {
    activeGroup: EventGroup | undefined
    preview: GroupEventPreview[]
    actions: GroupActions
    onopenchange: (open: boolean) => void
  } = $props()
  let dialog: HTMLDialogElement
  let nameInput = $state<HTMLInputElement>()
  let request = $state<GroupDialogRequest>({ kind: 'save' })
  let name = $state('')
  let makeActive = $state(true)
  let error = $state('')
  const primary = 'min-h-11 rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700'
  const secondary = 'min-h-11 rounded-lg border border-line px-4 py-2 text-sm font-medium hover:bg-canvas'
  let title = $derived(
    request.kind === 'save' ? 'Save as group' : request.kind === 'rename' ? 'Rename group' :
    request.kind === 'switch' ? 'Save changes first?' : request.kind === 'discard' ? 'Discard changes?' : 'Delete group?',
  )

  export async function open(next: GroupDialogRequest): Promise<void> {
    request = next
    name = next.kind === 'rename' ? activeGroup?.name ?? '' : ''
    makeActive = true
    error = ''
    await tick()
    dialog.showModal()
    onopenchange(true)
    if (next.kind === 'save' || next.kind === 'rename') nameInput?.focus()
  }

  function submit(event: SubmitEvent): void {
    event.preventDefault()
    try {
      if (request.kind === 'save') actions.save(name, makeActive)
      else if (request.kind === 'rename') actions.rename(name)
      else if (request.kind === 'switch') actions.select(request.group.id, 'save')
      else if (request.kind === 'discard') actions.discard()
      else actions.delete()
      dialog.close()
    } catch (cause) {
      if (!(cause instanceof InvalidGroupNameError)) throw cause
      error = cause.message
      nameInput?.focus()
    }
  }

  function discardAndSwitch(): void {
    if (request.kind !== 'switch') return
    actions.select(request.group.id, 'discard')
    dialog.close()
  }
</script>

<dialog bind:this={dialog} id="group-dialog" class={dialogClass} aria-labelledby="group-dialog-title" aria-describedby="group-dialog-description" onclose={() => onopenchange(false)}>
  <form onsubmit={submit}>
    <h2 id="group-dialog-title" class="text-xl font-semibold tracking-tight">{title}</h2>
    <p id="group-dialog-description" class="mt-2 text-sm leading-6 text-muted">
      {#if request.kind === 'save'}
        Saves these events with their order, colours and visibility.
      {:else if request.kind === 'rename'}
        Give "{activeGroup?.name}" a new name.
      {:else if request.kind === 'switch'}
        "{activeGroup?.name}" has unsaved changes. Switching to "{request.group.name}" replaces the events on your timeline.
      {:else if request.kind === 'discard'}
        Restore the saved events, order, colours and visibility for "{activeGroup?.name}".
      {:else}
        Delete "{activeGroup?.name}" from your saved groups? Your current timeline events will stay.
      {/if}
    </p>
    {#if request.kind === 'save' || request.kind === 'rename'}
      <label class="my-5 block text-sm font-medium">Group name
        <input bind:this={nameInput} bind:value={name} class={fieldClass} name="group-name" required maxlength="120" autocomplete="off" aria-describedby={error ? 'group-form-error' : undefined} />
      </label>
    {/if}
    {#if request.kind === 'save'}
      <div class="my-5 rounded-xl bg-canvas p-4">
        <p class="text-xs font-semibold text-muted">{preview.length} {preview.length === 1 ? 'event' : 'events'}, in this order</p>
        <ol class="mt-2 max-h-56 overflow-y-auto">
          {#each preview as event, index (event.id)}
            <li class="flex items-center gap-3 py-1.5 text-sm">
              <span class="w-4 shrink-0 font-mono text-xs text-muted">{index + 1}</span>
              <span class="size-2.5 shrink-0 rounded-full" style:background={event.color} aria-hidden="true"></span>
              <span class="min-w-0 wrap-anywhere">{event.name}</span>
            </li>
          {/each}
        </ol>
      </div>
      <label class="my-5 flex min-h-11 items-center gap-3 text-sm">
        <input bind:checked={makeActive} type="checkbox" class="size-4 accent-ink" />
        Make this the active group
      </label>
    {/if}
    {#if error}<p id="group-form-error" class="my-3 text-sm text-red-700" role="alert">{error}</p>{/if}
    <div class="mt-6 flex flex-wrap justify-end gap-2">
      <button type="button" class={secondary} onclick={() => dialog.close()}>Cancel</button>
      {#if request.kind === 'switch'}
        <button type="button" class={secondary} onclick={discardAndSwitch}>Discard and switch</button>
      {/if}
      <button type="submit" class={request.kind === 'delete' ? `${primary} bg-red-700 hover:bg-red-800` : primary}>
        {request.kind === 'save' ? 'Save group' : request.kind === 'rename' ? 'Save name' :
          request.kind === 'switch' ? 'Save and switch' : request.kind === 'discard' ? 'Discard changes' : 'Delete group'}
      </button>
    </div>
  </form>
</dialog>
