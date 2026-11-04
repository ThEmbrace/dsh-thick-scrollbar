// dsh-thick-scrollbar — client half.
//
// Keeps the Web UI scrollbars exactly as the theme draws them (thin, low
// contrast, and "quiet" where a panel hides them) and only makes the bar
// temporarily thicker while the pointer is on it, so it is easier to grab.
//
// How the thickening works, and why the layout never moves:
//   ui-theme paints every scrollbar through ::-webkit-scrollbar with
//   `width: var(--dsh-scrollbar-width)` and a transparent-border thumb
//   (`background-clip: content-box`). The visible pill is therefore
//   `width - 2 * thumb-border` wide, while the *layout* footprint is only
//   `width`.
//
//   Chromium scrollbars take space out of the content box, so changing that
//   width on hover reflows the content (the window visibly jumps sideways).
//   Instead the gutter is reserved once, permanently, at 10px, and the
//   resting pill is kept 5px by a 2.5px transparent border. Arming only drops
//   that border: the pill paints 10px wide while the reserved gutter, and
//   therefore every surrounding box, stays exactly where it was.
//
// Why a pointer listener instead of `:hover`:
//   Hovering the whole scroll container would fatten the bar whenever the
//   mouse crosses the text. Chromium also stops dispatching pointer events
//   once the cursor is over the native scrollbar itself, so the strip is
//   armed slightly *before* the cursor reaches the bar (3px of margin, plus
//   8px of hysteresis on the way out), and stays armed while the cursor is on
//   it.
;(function () {
  'use strict'

  const PLUGIN_ID = 'dsh-thick-scrollbar'

  /** Gutter reserved at all times, so arming can never reflow the content. */
  const GUTTER_PX = 10
  /** Transparent border that keeps the resting pill thin inside that gutter. */
  const REST_BORDER_PX = 2.5
  /** Distance from the container's right edge that arms the thicker bar. */
  const ARM_DISTANCE = GUTTER_PX + 3
  /** Distance that lets it shrink again (hysteresis, keeps it from flickering). */
  const DISARM_DISTANCE = GUTTER_PX + 11

  const VAR_WIDTH = '--dsh-scrollbar-width'
  const VAR_BORDER = '--dsh-scrollbar-thumb-border'
  const ARMED_ATTR = 'data-dsh-thick-scrollbar'
  /** One controller per document: a hot reload can apply this module twice. */
  const GUARD_KEY = '__dshThickScrollbarController'

  /** `html body` outranks the theme's own `body` defaults regardless of order. */
  const BASELINE_CSS =
    'html body{' +
    VAR_WIDTH + ':' + GUTTER_PX + 'px;' +
    VAR_BORDER + ':' + REST_BORDER_PX + 'px}'

  /** Elements that actually own a vertical scrollbar right now. */
  function isVerticalScroller(el) {
    if (!el || el.nodeType !== 1) return false
    const tag = el.tagName
    if (tag === 'BODY' || tag === 'HTML') return false
    const style = window.getComputedStyle(el)
    const overflowY = style.overflowY
    if (overflowY !== 'auto' && overflowY !== 'scroll' && overflowY !== 'overlay') return false
    return el.scrollHeight - el.clientHeight > 1
  }

  /**
   * Owns the "one armed element at a time" state plus its exact rollback.
   * Nothing here depends on React: the element is found from the event path
   * on every frame, and only its own inline custom properties are touched.
   */
  function createController() {
    let armed = null
    let saved = null
    let frame = 0
    let latest = null
    let disposed = false

    function snapshot(el) {
      const record = Object.create(null)
      for (const name of [VAR_WIDTH, VAR_BORDER]) {
        record[name] = {
          value: el.style.getPropertyValue(name),
          priority: el.style.getPropertyPriority(name),
        }
      }
      return record
    }

    function restore() {
      if (!armed) return
      const el = armed
      const record = saved || Object.create(null)
      armed = null
      saved = null
      for (const name of [VAR_WIDTH, VAR_BORDER]) {
        const previous = record[name]
        if (!previous || (previous.value === '' && previous.priority === '')) {
          el.style.removeProperty(name)
        } else {
          el.style.setProperty(name, previous.value, previous.priority)
        }
      }
      el.removeAttribute(ARMED_ATTR)
    }

    function arm(el) {
      if (armed === el) return
      restore()
      saved = snapshot(el)
      // Only the painted border changes. The reserved gutter — and with it every
      // box beside the scrollbar — keeps its width, so nothing reflows.
      el.style.setProperty(VAR_BORDER, '0px')
      el.setAttribute(ARMED_ATTR, '')
      armed = el
    }

    /** Pick the innermost scroll container whose right gutter holds the point. */
    function pick(path, x, y) {
      for (let i = 0; i < path.length; i += 1) {
        const node = path[i]
        if (!node || node.nodeType !== 1) continue
        if (!isVerticalScroller(node)) continue
        if (!node.isConnected) continue
        const rect = node.getBoundingClientRect()
        if (rect.width <= 0 || rect.height <= 0) continue
        if (y < rect.top || y > rect.bottom) continue
        const distance = rect.right - x
        if (distance < 0) continue
        const limit = node === armed ? DISARM_DISTANCE : ARM_DISTANCE
        if (distance <= limit) return node
        return null
      }
      return null
    }

    function evaluate(state) {
      if (disposed) return
      const target = pick(state.path, state.x, state.y)
      if (target) {
        arm(target)
      } else {
        restore()
      }
    }

    function onPointerMove(event) {
      if (disposed) return
      latest = {
        x: event.clientX,
        y: event.clientY,
        path: typeof event.composedPath === 'function' ? event.composedPath() : [event.target],
      }
      if (frame) return
      frame = window.requestAnimationFrame(() => {
        frame = 0
        if (latest) evaluate(latest)
      })
    }

    function onLeave() {
      latest = null
      if (frame) {
        window.cancelAnimationFrame(frame)
        frame = 0
      }
      restore()
    }

    // No `wheel` listener on purpose: wheel-scrolling reflows the content but
    // never moves the scroll container, so a pointer resting on the gutter must
    // keep the bar thick instead of snapping back under the cursor.
    const listeners = [
      ['pointermove', onPointerMove, { capture: true, passive: true }],
      ['pointerdown', onPointerMove, { capture: true, passive: true }],
      ['blur', onLeave, false],
    ]

    for (const [type, handler, options] of listeners) {
      window.addEventListener(type, handler, options)
    }

    // Leaving the window produces no further pointermove, so the widened bar
    // would stay thick while the cursor is outside. `pointerleave` on the root
    // element fires exactly at the viewport edge — entering a native scrollbar
    // does not leave the root element.
    const root = typeof document !== 'undefined' ? document.documentElement : null
    if (root) root.addEventListener('pointerleave', onLeave)

    return function dispose() {
      disposed = true
      if (frame) {
        window.cancelAnimationFrame(frame)
        frame = 0
      }
      for (const [type, handler, options] of listeners) {
        window.removeEventListener(type, handler, options)
      }
      if (root) root.removeEventListener('pointerleave', onLeave)
      restore()
      latest = null
    }
  }

  function createPlugin() {
    return {
      apply(ctx) {
        ctx.effect(() => {
          // A dev-time hot reload can mount this module a second time on the
          // same document. Two controllers would snapshot each other's inline
          // values and one of them would write them back as permanent inline
          // overrides, so only the first one owns the listeners.
          if (window[GUARD_KEY]) return () => {}
          window[GUARD_KEY] = true

          // Reserve the wide gutter up front: arming then costs no layout at all.
          const style = document.createElement('style')
          style.textContent = BASELINE_CSS
          document.head.appendChild(style)

          const dispose = createController()
          return () => {
            window[GUARD_KEY] = false
            dispose()
            if (style.parentNode) style.parentNode.removeChild(style)
          }
        })
      },
    }
  }

  if (typeof window !== 'undefined' && window && window.__ModuleLoader__) {
    window.__ModuleLoader__.load({
      id: PLUGIN_ID,
      factory() {
        return createPlugin()
      },
    })
  }
})()
