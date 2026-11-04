// Unit tests for the dsh-thick-scrollbar client controller.
// They run the real lib/client.js inside a tiny DOM stub, so the arm/restore
// contract is checked without a browser.
import { test } from 'node:test'
import assert from 'node:assert/strict'

const CLIENT_URL = new URL('../lib/client.js', import.meta.url)

function makeElement(options = {}) {
  const props = new Map(Object.entries(options.inline || {}))
  const attrs = new Map()
  const element = {
    nodeType: 1,
    tagName: options.tag || 'DIV',
    isConnected: options.isConnected !== false,
    scrollHeight: options.scrollHeight ?? 1000,
    clientHeight: options.clientHeight ?? 400,
    overflowY: options.overflowY || 'auto',
    rect: options.rect || { left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600 },
    style: {
      getPropertyValue: (name) => (props.has(name) ? props.get(name) : ''),
      getPropertyPriority: () => '',
      setProperty: (name, value) => {
        props.set(name, value)
      },
      removeProperty: (name) => {
        props.delete(name)
      },
    },
    getAttribute: (name) => (attrs.has(name) ? attrs.get(name) : null),
    setAttribute: (name, value) => {
      attrs.set(name, value)
    },
    removeAttribute: (name) => {
      attrs.delete(name)
    },
    getBoundingClientRect: () => element.rect,
    props,
    attrs,
  }
  return element
}

function createHarness() {
  const listeners = new Map()
  const docListeners = new Map()
  const frames = []
  let loaded = null

  const docRoot = {
    addEventListener(type, handler) {
      const list = docListeners.get(type) || []
      list.push(handler)
      docListeners.set(type, list)
    },
    removeEventListener(type, handler) {
      const list = docListeners.get(type) || []
      docListeners.set(
        type,
        list.filter((entry) => entry !== handler),
      )
    },
  }

  const win = {
    addEventListener(type, handler) {
      const list = listeners.get(type) || []
      list.push(handler)
      listeners.set(type, list)
    },
    removeEventListener(type, handler) {
      const list = listeners.get(type) || []
      listeners.set(
        type,
        list.filter((entry) => entry !== handler),
      )
    },
    requestAnimationFrame(callback) {
      frames.push(callback)
      return frames.length
    },
    cancelAnimationFrame() {
      frames.length = 0
    },
    getComputedStyle(element) {
      return { overflowY: element.overflowY }
    },
    __ModuleLoader__: {
      load(definition) {
        loaded = definition
      },
    },
  }

  const emit = (type, event) => {
    for (const handler of (listeners.get(type) || []).slice()) handler(event)
  }

  const pointer = (x, y, path) => {
    const target = path[0]
    return {
      clientX: x,
      clientY: y,
      target,
      composedPath: () => path,
    }
  }

  const flush = () => {
    while (frames.length > 0) {
      const pending = frames.splice(0, frames.length)
      for (const callback of pending) callback(0)
    }
  }

  const apply = () => {
    assert.ok(loaded, 'client module did not register through __ModuleLoader__')
    assert.equal(typeof loaded.factory, 'function')
    const plugin = loaded.factory()
    let dispose = null
    plugin.apply({
      effect(setup) {
        dispose = setup()
      },
    })
    assert.equal(typeof dispose, 'function', 'apply must register a disposable effect')
    return dispose
  }

  const emitDoc = (type, event) => {
    for (const handler of (docListeners.get(type) || []).slice()) handler(event)
  }

  const head = {
    children: [],
    appendChild(node) {
      this.children.push(node)
      node.parentNode = this
      return node
    },
    removeChild(node) {
      const index = this.children.indexOf(node)
      if (index >= 0) this.children.splice(index, 1)
      node.parentNode = null
      return node
    },
  }

  const doc = {
    documentElement: docRoot,
    head,
    createElement(tagName) {
      return {
        tagName: String(tagName).toUpperCase(),
        textContent: '',
        parentNode: null,
        remove() {
          if (this.parentNode) this.parentNode.removeChild(this)
        },
      }
    },
  }

  return {
    window: win,
    document: doc,
    emit,
    emitDoc,
    pointer,
    flush,
    apply,
  }
}

async function loadClient(harness) {
  globalThis.window = harness.window
  globalThis.document = harness.document
  const url = new URL(CLIENT_URL)
  url.search = '?case=' + Math.random().toString(36).slice(2)
  await import(url.href)
}

test('middle of the scroller keeps the default thin bar', async () => {
  const harness = createHarness()
  await loadClient(harness)
  harness.apply()

  const scroller = makeElement()
  harness.emit('pointermove', harness.pointer(400, 300, [scroller]))
  harness.flush()

  assert.equal(scroller.props.get('--dsh-scrollbar-width'), undefined)
  assert.equal(scroller.attrs.get('data-dsh-thick-scrollbar'), undefined)
})

test('the baseline reserves a wide gutter with a thin resting thumb', async () => {
  const harness = createHarness()
  await loadClient(harness)
  harness.apply()

  const styles = harness.document.head.children
  assert.equal(styles.length, 1, 'exactly one baseline stylesheet')
  assert.match(styles[0].textContent, /--dsh-scrollbar-width:\s*10px/)
  assert.match(styles[0].textContent, /--dsh-scrollbar-thumb-border:\s*2\.5px/)
})

test('arming thickens the painted thumb without changing the layout width', async () => {
  const harness = createHarness()
  await loadClient(harness)
  harness.apply()

  const scroller = makeElement()
  harness.emit('pointermove', harness.pointer(795, 300, [scroller]))
  harness.flush()

  // The reserved gutter must stay exactly as it was: changing the scrollbar
  // width reflows the content beside it and the whole view jumps sideways.
  assert.equal(scroller.props.get('--dsh-scrollbar-width'), undefined)
  assert.equal(scroller.props.get('--dsh-scrollbar-thumb-border'), undefined)
  assert.equal(scroller.attrs.get('data-dsh-thick-scrollbar'), '')
})

test('leaving the gutter clears the marker and leaves no inline writes', async () => {
  const harness = createHarness()
  await loadClient(harness)
  harness.apply()

  const scroller = makeElement({ inline: { '--dsh-scrollbar-thumb-border': '2px' } })
  harness.emit('pointermove', harness.pointer(795, 300, [scroller]))
  harness.flush()
  assert.equal(scroller.attrs.get('data-dsh-thick-scrollbar'), '')

  harness.emit('pointermove', harness.pointer(300, 300, [scroller]))
  harness.flush()
  assert.equal(scroller.attrs.get('data-dsh-thick-scrollbar'), undefined)
  assert.equal(scroller.props.get('--dsh-scrollbar-thumb-border'), '2px')
  assert.equal(scroller.props.get('--dsh-scrollbar-width'), undefined)
})

test('a scroller with no overflow is never armed', async () => {
  const harness = createHarness()
  await loadClient(harness)
  harness.apply()

  const scroller = makeElement({ scrollHeight: 400, clientHeight: 400 })
  harness.emit('pointermove', harness.pointer(795, 300, [scroller]))
  harness.flush()

  assert.equal(scroller.props.get('--dsh-scrollbar-width'), undefined)
})

test('blur drops the armed state', async () => {
  const harness = createHarness()
  await loadClient(harness)
  harness.apply()

  const scroller = makeElement()
  harness.emit('pointermove', harness.pointer(795, 300, [scroller]))
  harness.flush()
  assert.equal(scroller.attrs.get('data-dsh-thick-scrollbar'), '')

  harness.emit('blur', {})
  assert.equal(scroller.attrs.get('data-dsh-thick-scrollbar'), undefined)
})

test('scrolling with the wheel keeps the bar the pointer is on', async () => {
  const harness = createHarness()
  await loadClient(harness)
  harness.apply()

  const scroller = makeElement()
  harness.emit('pointermove', harness.pointer(795, 300, [scroller]))
  harness.flush()
  assert.equal(scroller.attrs.get('data-dsh-thick-scrollbar'), '')

  // Wheel-scrolling reflows the content under a still pointer: the bar must
  // stay thick instead of snapping back while the cursor is on the gutter.
  harness.emit('wheel', {})
  harness.flush()
  assert.equal(scroller.attrs.get('data-dsh-thick-scrollbar'), '')
})

test('dispose restores the element and detaches listeners', async () => {
  const harness = createHarness()
  await loadClient(harness)
  const dispose = harness.apply()

  const scroller = makeElement()
  harness.emit('pointermove', harness.pointer(795, 300, [scroller]))
  harness.flush()
  assert.equal(scroller.attrs.get('data-dsh-thick-scrollbar'), '')

  dispose()
  assert.equal(scroller.props.get('--dsh-scrollbar-thumb-border'), undefined)
  assert.equal(scroller.attrs.get('data-dsh-thick-scrollbar'), undefined)
  assert.equal(harness.document.head.children.length, 0, 'baseline stylesheet must be removed')

  harness.window.__ModuleLoader__ = { load() {} }
  harness.emit('pointermove', harness.pointer(795, 300, [scroller]))
  harness.flush()
  assert.equal(scroller.attrs.get('data-dsh-thick-scrollbar'), undefined)
})

test('leaving the viewport drops the armed state', async () => {
  const harness = createHarness()
  await loadClient(harness)
  harness.apply()

  const scroller = makeElement()
  harness.emit('pointermove', harness.pointer(795, 300, [scroller]))
  harness.flush()
  assert.equal(scroller.attrs.get('data-dsh-thick-scrollbar'), '')

  // The cursor can leave the window without producing another pointermove, so
  // the widened bar would otherwise stay thick while the pointer is outside.
  harness.emitDoc('pointerleave', {})
  assert.equal(scroller.attrs.get('data-dsh-thick-scrollbar'), undefined)
  assert.equal(scroller.props.get('--dsh-scrollbar-thumb-border'), undefined)
})

test('a second apply on the same window does not stack controllers', async () => {
  const harness = createHarness()
  await loadClient(harness)
  const first = harness.apply()
  const second = harness.apply()

  const scroller = makeElement()
  harness.emit('pointermove', harness.pointer(795, 300, [scroller]))
  harness.flush()
  assert.equal(scroller.attrs.get('data-dsh-thick-scrollbar'), '')

  // A hot-reload style double mount must not let the last restore write the
  // widened value back as a permanent inline override.
  first()
  second()
  assert.equal(scroller.props.get('--dsh-scrollbar-thumb-border'), undefined)
  assert.equal(scroller.attrs.get('data-dsh-thick-scrollbar'), undefined)
  assert.equal(harness.document.head.children.length, 0, 'no baseline stylesheet is left behind')
})

test('arming never writes the inherited custom property', async () => {
  const harness = createHarness()
  await loadClient(harness)
  harness.apply()

  const scroller = makeElement()
  harness.emit('pointermove', harness.pointer(795, 300, [scroller]))
  harness.flush()

  // `--dsh-scrollbar-thumb-border` inherits, so writing it on the hovered
  // container also fattens every nested scroller inside it. Arming must mark
  // the element instead and let a scoped stylesheet rule do the painting.
  assert.equal(scroller.props.get('--dsh-scrollbar-thumb-border'), undefined)
  assert.equal(scroller.props.get('--dsh-scrollbar-width'), undefined)
  assert.equal(scroller.attrs.get('data-dsh-thick-scrollbar'), '')
})

test('the armed marker is scoped to that one element in CSS', async () => {
  const harness = createHarness()
  await loadClient(harness)
  harness.apply()

  const css = harness.document.head.children[0].textContent
  assert.match(
    css,
    /\[data-dsh-thick-scrollbar\]::-webkit-scrollbar-thumb\s*\{[^}]*border-width:\s*0/,
    'the armed rule must target the pseudo-element of the marked element only',
  )
})

test('an element with its own inline border keeps it while armed and after', async () => {
  const harness = createHarness()
  await loadClient(harness)
  harness.apply()

  const scroller = makeElement({ inline: { '--dsh-scrollbar-thumb-border': '2px' } })
  harness.emit('pointermove', harness.pointer(795, 300, [scroller]))
  harness.flush()
  // The stylesheet overrides the painted border; the inline value is not ours
  // to rewrite, so it must survive untouched in both directions.
  assert.equal(scroller.props.get('--dsh-scrollbar-thumb-border'), '2px')
  assert.equal(scroller.attrs.get('data-dsh-thick-scrollbar'), '')

  harness.emit('pointermove', harness.pointer(300, 300, [scroller]))
  harness.flush()
  assert.equal(scroller.props.get('--dsh-scrollbar-thumb-border'), '2px')
  assert.equal(scroller.attrs.get('data-dsh-thick-scrollbar'), undefined)
})
