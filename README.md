# Dot Timeline

A framework-free TypeScript app that makes time tangible: one canvas, one dot per
week, fortnight, month, year, or five years.

## Run locally

Use Node.js 22.12+ and npm.

```sh
npm ci
npm run dev
```

`npm run build` type-checks the app and creates `dist/`. Use `npm run preview` to
preview the production build. Run `npm run check` for automated tests, architectural
dependency checks, both type-checks, and a production build.

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

## Architecture

The app follows clean architecture without a framework or a dependency-injection
container. Source dependencies point inward; the domain and application can run
without a browser.

| Layer | Responsibility | Allowed dependencies |
| --- | --- | --- |
| `src/domain/` | Event models, validation, priority, filtering, and UTC calendar arithmetic | Domain only |
| `src/application/` | Event and view use cases; repository and location ports | Application and domain |
| `src/infrastructure/` | localStorage, HTTP library loading, and URL/history adapters | Infrastructure, application, and domain |
| `src/presentation/` | DOM controls, accessibility, date labels, and canvas rendering | Presentation, application, and domain |
| `src/main.ts` | Composition root: construct adapters, inject clock/IDs, and mount presentation | All layers |

`TimelineApplication` owns event and view state. Its use cases validate changes,
maintain event ordering, and persist through interfaces declared in
`application/ports.ts`. Tests supply in-memory implementations of those ports.
Browser APIs and concrete adapters must never be imported into the inner layers.
The DOM presenter calls application use cases, not storage or HTTP; it receives
its canvas renderer from the composition root. Disposing the presenter releases
subscriptions, global listeners, timers, and the renderer.

`src/engine/` retains compatibility re-exports for the original standalone canvas
API. New app code imports from the owning layer instead. `DotTimeline` still
exposes `setUnit`, `setEvents`, `scrollToDate`, `scrollToToday`, `onHover`,
`onViewChange`, and `destroy`; subscriptions return an unsubscribe function.

`src/style.css` defines the Tailwind theme and base accessibility styles;
`vite.config.ts` integrates Tailwind. `public/library.json` is the bundled,
date-sorted catalogue with a source URL for every entry. The HTTP adapter rejects
malformed catalogues explicitly instead of silently hiding invalid entries.

Existing `dt:v1:active`, `dt:v1:custom`, and `dt:v1:view` localStorage keys remain
compatible. Invalid saved entries are reported while valid entries are restored.
Unavailable storage or restricted URL updates produce a warning without blocking
the in-memory timeline. A failed library request does not discard saved library
selections, and custom events remain usable. There are no accounts, analytics, or
backend services.

## Automated checks

- `npm test` uses Node's built-in test runner and TypeScript stripping, with no
  additional test framework. It covers calendar boundaries, event and view use
  cases, persistence, HTTP/URL adapters, and the original engine exports.
- Architecture tests inspect imports, type imports, and re-exports to enforce the
  layer dependency rules and reject circular dependencies.
- `npm run typecheck` checks the domain/application with no DOM or Vite types via
  `tsconfig.core.json`, then checks the complete browser app.
- `npm run check` runs all of the above plus the production build. GitHub Actions
  runs it for pull requests and pushes to `main`.

When extending the app, put business rules in the domain, coordinate them in
application use cases, and adapt external APIs at the edges. Add a port only for
an actual external dependency; keep DOM and canvas details in presentation.

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