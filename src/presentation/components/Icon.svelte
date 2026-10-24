<script lang="ts">
  const paths = {
    close: 'M6 6l12 12M6 18 18 6',
    search: 'm21 21-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
    panel: 'M9 4v16M4 4h16v16H4z',
    crosshair: 'M12 2v4m0 12v4M2 12h4m12 0h4M18 12a6 6 0 1 1-12 0 6 6 0 0 1 12 0',
    eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12m13 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
    eyeOff: 'm3 3 18 18M10.6 5.1 12 5c6 0 10 7 10 7a19 19 0 0 1-3 3.7M6.5 6.5A22 22 0 0 0 2 12s4 7 10 7a13 13 0 0 0 5.5-1.5M10 10a3 3 0 0 0 4 4',
    plus: 'M12 5v14M5 12h14',
    bookmark: 'M6 3h12v18l-6-4-6 4z',
    chevron: 'm6 9 6 6 6-6',
    more: 'M5 12h.01M12 12h.01M19 12h.01',
    check: 'm4 12 5 5L20 6',
    copy: 'M8 8h12v13H8zM4 16H3V3h13v1',
    edit: 'm16 3 5 5L8 21H3v-5z',
    undo: 'M3 4v6h6M3 10a9 9 0 1 1 1 9',
    leave: 'M14 3h7v7M21 3 10 14M10 5H4v16h16v-6',
    trash: 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7',
    grip: 'M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01',
  } as const

  let { name, size = 18 }: { name: keyof typeof paths; size?: number } = $props()
</script>

<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width={name === 'grip' || name === 'more' ? 3 : 1.5} stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d={paths[name]} />
</svg>
