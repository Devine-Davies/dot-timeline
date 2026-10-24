# Dot Timeline

A Svelte 5 and TypeScript app that makes time tangible: one canvas, one dot per
week, fortnight, month, year, or five years.

## Run locally

Use Node.js 22.12+ and npm.

```sh
npm ci
npm run dev
```

`npm run build` type-checks the app and creates `dist/`. Use `npm run preview` to
preview the production build. Run `npm run check` for automated tests, architectural
dependency checks, TypeScript/Svelte checks, and a production build.

## Explore

- Scroll, drag, or focus the grid and use arrows / Page Up / Page Down.
- Choose **Today**, or press Home on the grid, to return to the present.
- Switch scales without losing the date at the centre.
- Open **Events** to search the bundled library or create a personal date range.
- Hide, recolour, remove, or reorder events. The highest visible event wins when
  ranges overlap; arrow buttons provide a keyboard alternative to dragging.
- Use the group picker in **On your timeline** to save and switch between named
  event groups. Groups remember event order, colours and visibility. The save
  dialog previews the ordered events and makes the group active by default.
- While a group is active, an **Edited** badge tracks changes and newly added
  events are marked **New**. Its **Manage active group** menu lets you update,
  save a copy, rename, discard changes, leave the group, or delete it. Leaving or
  deleting a group keeps the current timeline events.
- Switching groups replaces the current events. For an edited active group,
  choose **Save and switch**, **Discard and switch**, or **Cancel** first.
- Hover or tap a dot to see its full date span and overlapping events. With the
  grid focused, Enter / Space inspects the centre dot and Escape dismisses it.
- Today's red dot stays visible, but its date label only appears when you hover
  nearby, tap it, or inspect it with the keyboard, leaving surrounding dots clear.
  The **Today** navigation button is always available to jump back.
- Bookmark the URL (`?unit=1w&at=2026-10-23`) to keep a view. Events are saved only
  on this device, not in the link.

All calendar calculations use UTC, Monday-start weeks, and inclusive event dates.
Fortnights use a fixed Monday epoch, 1970-01-05. Calendar scales align to actual
month, year, and five-year boundaries. Historical dates use astronomical ISO year
numbering internally (year 0 = 1 BC); labels display the era. Approximate historical
ranges in the library are labelled accordingly. Navigation is bounded only by the
JavaScript Date range.

## Architecture

The app follows clean architecture with Svelte confined to presentation and no
dependency-injection container. Source dependencies point inward; the domain and
application can run without a browser or Svelte.

| Layer | Responsibility | Allowed dependencies |
| --- | --- | --- |
| `src/domain/` | Event models, validation, priority, filtering, and UTC calendar arithmetic | Domain only |
| `src/application/` | Event and view use cases; repository and location ports | Application and domain |
| `src/infrastructure/` | localStorage, HTTP library loading, and URL/history adapters | Infrastructure, application, and domain |
| `src/presentation/` | Svelte components, accessibility, date labels, and canvas rendering | Presentation, application, domain, and Svelte |
| `src/main.ts` | Composition root: construct adapters, inject clock/IDs, and mount Svelte | All layers |

`TimelineApplication` owns event and view state. Its use cases validate changes,
maintain event ordering, and persist through interfaces declared in
`application/ports.ts`. Tests supply in-memory implementations of those ports.
Browser APIs and concrete adapters must never be imported into the inner layers.
`presentation/App.svelte` adapts application state into reactive presentation
snapshots and calls application use cases, not storage or HTTP. Components in
`presentation/components/` own the event panel, active/library lists, controls,
dialogs, and canvas lifecycle. They use Svelte 5 runes, typed props, and callback
handlers rather than imperative HTML strings or manual DOM rendering.

`TimelineCanvas.svelte` receives a renderer factory from the composition root.
The canvas engine itself remains plain TypeScript with no Svelte imports.
Component unmounting releases subscriptions, global listeners, timers, and the
renderer. Vite's Svelte plugin supplies component hot-module replacement.

`src/engine/` retains compatibility re-exports for the original standalone canvas
API. New app code imports from the owning layer instead. `DotTimeline` still
exposes `setUnit`, `setEvents`, `scrollToDate`, `scrollToToday`, `onHover`,
`onViewChange`, and `destroy`; subscriptions return an unsubscribe function.

`src/style.css` defines the Tailwind theme and base accessibility styles;
`vite.config.ts` integrates Svelte and Tailwind. `public/library.json` is the bundled,
date-sorted catalogue with a source URL for every entry. The HTTP adapter rejects
malformed catalogues explicitly instead of silently hiding invalid entries.

Existing `dt:v1:active`, `dt:v1:custom`, and `dt:v1:view` localStorage keys remain
compatible. Groups and the active group association use `dt:v1:groups`; edits
remain separate from the saved group and survive reloads. Groups also retain
copies of their custom events so loading or discarding can restore an event
deleted from the personal library. Groups, like events, stay on this device and
are not included in shared URLs.
Invalid saved entries are reported while valid entries are restored.
Unavailable storage or restricted URL updates produce a warning without blocking
the in-memory timeline. A failed library request does not discard saved library
selections, and custom events remain usable. There are no accounts, analytics, or
backend services.

## Automated checks

- `npm test` uses Node's built-in test runner and TypeScript stripping, with no
  additional test framework. It covers calendar boundaries, event and view use
  cases, persistence, HTTP/URL adapters, and the original engine exports. It also
  compiles every Svelte component without accessibility or reactivity warnings.
- Architecture tests inspect TypeScript and Svelte imports, type imports,
  re-exports, and template imports to enforce layer dependency rules and reject
  circular dependencies. Only presentation may import Svelte.
- `npm run typecheck` checks the domain/application with no DOM or Vite types via
  `tsconfig.core.json`, then checks the browser app and runs `svelte-check` with
  warnings treated as failures.
- `npm run check` runs all of the above plus the production build. GitHub Actions
  runs it for pull requests and pushes to `main`.

When extending the app, put business rules in the domain, coordinate them in
application use cases, and adapt external APIs at the edges. Add a port only for
an actual external dependency; keep Svelte, DOM, and canvas details in presentation.

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