<script lang="ts">
  import { tick } from 'svelte'
  import { InvalidCustomEventError } from '../../application/TimelineApplication.ts'
  import { formatISO } from '../../domain/dates.ts'
  import type { TimelineEvent } from '../../domain/timeline.ts'
  import { dialogClass, fieldClass, iconButton } from '../styles.ts'
  import Icon from './Icon.svelte'

  let { oncreate, onopenchange }: {
    oncreate: (input: Pick<TimelineEvent, 'name' | 'start' | 'end' | 'color'>) => void
    onopenchange: (open: boolean) => void
  } = $props()
  let dialog: HTMLDialogElement
  let nameInput: HTMLInputElement
  let name = $state('')
  let start = $state('')
  let end = $state('')
  let color = $state('#6366f1')
  let error = $state('')

  export async function open(): Promise<void> {
    name = ''
    start = end = formatISO(new Date())
    color = '#6366f1'
    error = ''
    await tick()
    dialog.showModal()
    onopenchange(true)
    nameInput.focus()
  }

  function submit(event: SubmitEvent): void {
    event.preventDefault()
    try {
      oncreate({ name, start, end, color })
      dialog.close()
    } catch (cause) {
      if (!(cause instanceof InvalidCustomEventError)) throw cause
      error = cause.message
    }
  }
</script>

<dialog bind:this={dialog} id="event-dialog" class={dialogClass} aria-labelledby="event-dialog-title" onclose={() => onopenchange(false)}>
  <form id="event-form" onsubmit={submit}>
    <div class="flex items-center justify-between gap-2">
      <h2 id="event-dialog-title" class="text-xl font-semibold tracking-tight">Create custom event</h2>
      <button type="button" class={iconButton} id="cancel-event" aria-label="Close custom event form" onclick={() => dialog.close()}><Icon name="close" /></button>
    </div>
    <p class="my-4 text-sm leading-6 text-muted">A chapter of your life, a project, or something worth remembering.</p>
    <label class="my-4 block text-sm font-medium">Event name<input bind:this={nameInput} bind:value={name} class={fieldClass} name="name" id="event-name" required maxlength="120" placeholder="e.g. My university years" autocomplete="off" /></label>
    <div class="flex gap-3">
      <label class="min-w-0 flex-1 text-sm font-medium">Start date<input bind:value={start} class={fieldClass} name="start" id="event-start" type="date" required /></label>
      <label class="min-w-0 flex-1 text-sm font-medium">End date<input bind:value={end} class={fieldClass} name="end" id="event-end" type="date" required /></label>
    </div>
    <label class="my-4 flex items-center justify-between text-sm font-medium">Event colour<input bind:value={color} class="size-11 cursor-pointer bg-transparent p-2" name="color" type="color" /></label>
    <p id="form-error" class="my-3 text-sm text-red-700" role="alert">{error}</p>
    <button type="submit" class="min-h-12 w-full rounded-lg bg-ink text-sm font-medium text-white hover:bg-zinc-700">Add to my timeline</button>
  </form>
</dialog>
