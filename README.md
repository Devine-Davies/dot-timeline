# Dot Timeline

A framework-free TypeScript app that makes time tangible: one canvas, one dot per
week, fortnight, month, year, or five years.

## Run locally

Use Node.js 22.12+ (or 20.19+) and npm.

```sh
npm ci
npm run dev
```

`npm run build` type-checks the app and creates `dist/`. Use `npm run preview` to
preview the production build. There is no unit-test infrastructure, by design.

## Explore

- Scroll, drag, or focus the grid and use arrows / Page Up / Page Down.
- Choose **Today**, or press Home on the grid, to return to the present.
- Switch scales without losing the date at the centre.
- Open **Events** to search the bundled library or create a personal date range.
- Hide, recolour, remove, or reorder events. The highest visible event wins when
  ranges overlap; arrow buttons provide a keyboard alternative to dragging.
- Hover or tap a dot to see its full date span and overlapping events. With the
  grid focused, Enter / Space inspects the centre dot and Escape dismisses it.
- Bookmark the URL (`?unit=1w&at=2026-10-23`) to keep a view. Events are saved only
  on this device, not in the link.

All calendar calculations use UTC, Monday-start weeks, and inclusive event dates.
Fortnights use a fixed Monday epoch, 1970-01-05. Calendar scales align to actual
month, year, and five-year boundaries. Historical dates use astronomical ISO year
numbering internally (year 0 = 1 BC); labels display the era. Approximate historical
ranges in the library are labelled accordingly. Navigation is bounded only by the
JavaScript Date range.

## Structure

- `src/engine/` — standalone `DotTimeline` engine, date arithmetic, and public types.
  It has no UI imports or runtime dependencies.
- `src/main.ts` — plain DOM shell, event management, URL state, and persistence.
- `src/style.css` — responsive layout, mobile overlay sheet, focus states, and fades.
- `public/library.json` — date-sorted library with a source URL for every entry.

The engine exposes `setUnit`, `setEvents`, `scrollToDate`, `scrollToToday`,
`onHover`, `onViewChange`, and `destroy`. Subscriptions return an unsubscribe
function. Custom events and view preferences are stored with guarded
`dt:v1:active`, `dt:v1:custom`, and `dt:v1:view` localStorage keys. There are no
accounts, analytics, or backend services.

## Deploy

Deploy as a static Vite site on Vercel, Netlify, or Cloudflare Pages:
build command `npm run build`, output directory `dist`. For a subdirectory host,
configure Vite's `base` to that path. No environment variables or server are needed.

## Manual verification

Check all scales, centre preservation, wheel/touch/keyboard navigation, overlapping
events, form validation, reload persistence, and a bookmarked URL. Check 360 px and
desktop layouts, keyboard-only controls, and reduced-motion settings. For release
qualification, measure performance at 1080p, use Lighthouse and an accessibility
audit, and check the current Chrome, Edge, Firefox, Safari, and iOS Safari releases.