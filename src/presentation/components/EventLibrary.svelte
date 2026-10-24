<script lang="ts">
  import { parseDate } from '../../domain/dates.ts'
  import type { TimelineEvent } from '../../domain/timeline.ts'
  import { displayDate } from '../dateLabels.ts'

  let { results, activeIds, state, onadd, ondeletecustom }: {
    results: TimelineEvent[]
    activeIds: string[]
    state: 'loading' | 'ready' | 'error'
    onadd: (event: TimelineEvent) => void
    ondeletecustom: (event: TimelineEvent) => void
  } = $props()
  const label = (date: string) => displayDate(parseDate(date))
</script>

<div id="library-list">
  {#each results as event}
    {@const added = activeIds.includes(event.id)}
    <article class="library-event grid grid-cols-[12px_minmax(0,1fr)_auto] items-center gap-x-3 border-b border-line/70 py-4 last:border-0">
      <span class="library-swatch mt-1.5 size-2.5 self-start rounded-full border-2" style:border-color={event.color}></span>
      <div>
        <h4 class="text-sm font-medium leading-5 wrap-anywhere">{event.name}</h4>
        <p class="event-dates mt-1 font-mono text-[10px] leading-5 text-muted">{label(event.start)} — {label(event.end)}</p>
        {#if event.source && /^https?:\/\//.test(event.source)}
          <a href={event.source} target="_blank" rel="noopener noreferrer" class="source-link inline-flex min-h-11 items-center text-[10px] text-muted underline decoration-line underline-offset-4 hover:text-ink" aria-label="Date source for {event.name} (opens in a new tab)">{event.category} · source ↗</a>
        {:else}
          <span class="source-link mt-1 block text-[10px] text-muted">personal · only on this device</span>
        {/if}
      </div>
      <button type="button" class="add-button min-h-11 min-w-11 self-start rounded-lg border border-line px-2.5 text-xs font-medium hover:bg-canvas disabled:border-transparent disabled:text-muted disabled:opacity-60" disabled={added} aria-label="{added ? 'Added' : 'Add'} {event.name}" onclick={() => onadd(event)}>{added ? 'Added' : 'Add'}</button>
      {#if event.category === 'personal'}
        <button type="button" class="text-button delete-custom col-span-2 col-start-2 min-h-11 justify-self-start rounded text-[11px] text-muted underline underline-offset-4 hover:text-ink" onclick={() => { if (confirm(`Delete “${event.name}” from this device?`)) ondeletecustom(event) }}>Delete custom event</button>
      {/if}
    </article>
  {/each}
</div>
<p id="library-message" class="py-5 text-sm leading-6 text-muted" hidden={state === 'ready' && results.length > 0}>
  {state === 'loading' ? 'Loading the library…' : state === 'error' ? 'The library could not load. Refresh to try again. Your custom events still work.' : 'No matching events. Try another search or create your own.'}
</p>
