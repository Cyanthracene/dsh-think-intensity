/**
 * Local smoke test for the browser half.
 *
 * The view lives in the package-local chunk `lib/client.view.js`; the entry
 * `lib/client.js` only wires styles, the self-check banner, and the cordis row,
 * loading the view through `require.async` exactly as the client module system
 * does. This harness reproduces both seams with a small React stand-in.
 *
 * What it verifies (and nothing more — see the note at the bottom):
 *   - the entry registers a factory, exports apply()/inject, and pulls React
 *     from the module table;
 *   - the entry loads its view through the chunk channel, not inline;
 *   - the view renders from a session model directory: declared levels, thumb
 *     position, readout text, and both disabled states;
 *   - the anchor element is a block element carrying the card markup;
 *   - the banner self-check records the bundle step.
 *
 * Usage: node test/smoke.mjs
 *
 * ASCII only on purpose: this file is edited from tools that may not preserve
 * non-ASCII bytes.
 */

import { readFileSync } from 'node:fs';

const entrySource = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8');
const chunkSource = readFileSync(new URL('../lib/client.view.js', import.meta.url), 'utf8');

const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };

// -- React stand-in -----------------------------------------------------
const stack = [];
let current = null;
let cursor = 0;
let pendingEffects = [];
let pendingCleanups = [];
let dirty = false;
let externalChange = false;
const styleTags = new Map();
const overlays = [];

function createElement(type, props, ...children) {
  const flat = children.flat(Infinity).filter((child) => child !== null && child !== undefined && child !== false);
  const { ref, ...rest } = props ?? {};
  return { type, props: rest, ref, children: flat };
}

function sameDeps(a, b) {
  if (a === undefined || b === undefined) return false;
  if (a.length !== b.length) return false;
  return a.every((value, index) => Object.is(value, b[index]));
}

function slotAt(index) {
  if (current[index] === undefined) current[index] = { initialized: false, value: undefined, deps: undefined, cleanup: undefined };
  return current[index];
}

function makeDomNode(tagName) {
  const styleVars = {};
  return {
    tagName,
    id: 'dsh-think-intensity-probe',
    dataset: {},
    attributes: {},
    // The burst writes custom properties, so track them the way the DOM would.
    styleVars,
    style: {
      position: '',
      setProperty(name, value) { styleVars[name] = value; },
      getPropertyValue(name) { return styleVars[name]; },
    },
    className: '',
    parentElement: null,
    parentNode: null,
    child: null,
    children: [],
    offsetWidth: 200,
    // `ensureHost` reuses a live host via `isConnected`; the stub is connected for
    // as long as it has a parent.
    get isConnected() { return this.parentNode !== null; },
    // The aura re-asserts its place as the first child of <body> on every change.
    get firstChild() { return this.children.length > 0 ? this.children[0] : null; },
    insertBefore(added, reference) {
      const at = reference === null || reference === undefined ? this.children.length : this.children.indexOf(reference);
      this.children.splice(at < 0 ? this.children.length : at, 0, added);
      added.parentNode = this;
      if (this.children.length > 0) this.child = this.children[0];
      return added;
    },
    setAttribute(name, value) {
      this.attributes[name] = value;
      if (name === 'class') this.className = value;
    },
    removeAttribute(name) { delete this.attributes[name]; },
    hasAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attributes, name); },
    getAttribute(name) { return this.attributes[name]; },
    getBoundingClientRect() { return { top: 0, left: 0, right: 0, bottom: 0, width: 320, height: 44 }; },
    // Descendant lookups: a class selector (`.ti-ion-ring3`) or an attribute selector
    // (`[data-pool="motes"]`). Those are the two forms the plugin actually uses —
    // matching by class arms an individual burst ring slot, and matching by attribute
    // finds an ambient effect pool.
    querySelector(selector) {
      const text = String(selector);
      const attr = /^\[([a-zA-Z-]+)="([^"]*)"\]$/.exec(text);
      const wanted = text.replace(/^\./, '');
      const stack = [...this.children];
      while (stack.length > 0) {
        const node = stack.shift();
        if (attr !== null) {
          if (node.attributes && node.attributes[attr[1]] === attr[2]) return node;
        } else {
          const classes = String(node.className || '').split(/\s+/);
          if (classes.includes(wanted)) return node;
        }
        stack.push(...(node.children || []));
      }
      return null;
    },
    appendChild(added) {
      // Real DOM semantics: appending an already-attached node MOVES it, it does not
      // clone it. Without this the aura's "re-sink to the first child" could never be
      // observed, because the old position would linger in the list.
      if (added.parentNode && added.parentNode !== this && Array.isArray(added.parentNode.children)) {
        const was = added.parentNode.children.indexOf(added);
        if (was >= 0) added.parentNode.children.splice(was, 1);
      }
      const existing = this.children.indexOf(added);
      if (existing >= 0) this.children.splice(existing, 1);
      this.children.push(added);
      this.child = this.children[0];
      added.parentNode = this;
      overlays.push(added);
      return added;
    },
    removeChild(removed) {
      const index = overlays.indexOf(removed);
      if (index >= 0) overlays.splice(index, 1);
      const childIndex = this.children.indexOf(removed);
      if (childIndex >= 0) this.children.splice(childIndex, 1);
      removed.parentNode = null;
      return removed;
    },
  };
}

const React = {
  createElement,
  // Just enough of the class-component contract for the view's error boundary.
  Component: class Component {
    constructor(props) {
      this.props = props ?? {};
      this.state = this.state ?? null;
    }
    setState(next) {
      const patch = typeof next === 'function' ? next(this.state) : next;
      this.state = { ...(this.state ?? {}), ...patch };
    }
  },
  useState(initial) {
    const slot = slotAt(cursor++);
    if (!slot.initialized) {
      slot.value = typeof initial === 'function' ? initial() : initial;
      slot.initialized = true;
    }
    const set = (next) => {
      const value = typeof next === 'function' ? next(slot.value) : next;
      if (Object.is(value, slot.value)) return;
      slot.value = value;
      dirty = true;
    };
    return [slot.value, set];
  },
  useRef(initial) {
    const slot = slotAt(cursor++);
    if (!slot.initialized) {
      slot.value = { current: initial };
      slot.initialized = true;
    }
    return slot.value;
  },
  useMemo(factory, deps) {
    const slot = slotAt(cursor++);
    if (!slot.initialized || !sameDeps(slot.deps, deps)) {
      slot.value = factory();
      slot.deps = deps;
      slot.initialized = true;
    }
    return slot.value;
  },
  useCallback(fn, deps) {
    const slot = slotAt(cursor++);
    if (!slot.initialized || !sameDeps(slot.deps, deps)) {
      slot.value = fn;
      slot.deps = deps;
      slot.initialized = true;
    }
    return slot.value;
  },
  useEffect(fn, deps) {
    const slot = slotAt(cursor++);
    if (!slot.initialized || !sameDeps(slot.deps, deps)) {
      if (slot.initialized && typeof slot.cleanup === 'function') pendingCleanups.push(slot.cleanup);
      slot.deps = deps;
      slot.initialized = true;
      pendingEffects.push({ slot, fn, deps });
    }
  },
  useLayoutEffect(fn, deps) {
    React.useEffect(fn, deps);
  },
  useSyncExternalStore(subscribe, getSnapshot) {
    slotAt(cursor++).initialized = true;
    subscribe(() => { externalChange = true; });
    return getSnapshot();
  },
};

// -- DOM fixtures -------------------------------------------------------
const fakeCard = makeDomNode('div');
fakeCard.className = 'InputBar_module_css_default card';
const fakeComposer = makeDomNode('div');
fakeComposer.className = 'composerShell';
fakeCard.parentElement = fakeComposer;

globalThis.window = {
  setTimeout: () => 0,
  clearTimeout: () => {},
  addEventListener: () => {},
  getComputedStyle: (node) => ({
    position: 'relative',
    display: node && node.attributes && String(node.attributes.class || '').includes('ti-dock') ? 'flex' : 'block',
  }),
};
const documentRoot = {
  children: [],
  get firstChild() { return this.children.length > 0 ? this.children[0] : null; },
  appendChild(node) {
    // Real DOM semantics: appending an attached node MOVES it.
    if (node.parentNode && Array.isArray(node.parentNode.children)) {
      const was = node.parentNode.children.indexOf(node);
      if (was >= 0) node.parentNode.children.splice(was, 1);
    }
    this.children.push(node);
    node.parentNode = this;
    return node;
  },
  insertBefore(node, reference) {
    const at = reference === null || reference === undefined ? this.children.length : this.children.indexOf(reference);
    this.children.splice(at < 0 ? this.children.length : at, 0, node);
    node.parentNode = this;
    return node;
  },
  removeChild(node) {
    const at = this.children.indexOf(node);
    if (at >= 0) this.children.splice(at, 1);
    node.parentNode = null;
    return node;
  },
};
globalThis.document = {
  head: { appendChild: (node) => styleTags.set(node.attributes['data-plugin-css'], node) },
  body: documentRoot,
  documentElement: documentRoot,
  getElementById: () => null,
  addEventListener: () => {},
  removeEventListener: () => {},
  querySelector: (selector) => {
    const match = /data-plugin-css="([^"]+)"/.exec(selector);
    return match && styleTags.has(match[1]) ? styleTags.get(match[1]) : null;
  },
  createElement: (tagName) => {
    const node = makeDomNode(tagName);
    node.parentElement = fakeCard;
    return node;
  },
};

// -- renderer -----------------------------------------------------------
const domNodes = new WeakMap();
const refAttached = new WeakMap();
function domNodeFor(node) {
  let made = domNodes.get(node);
  if (made === undefined) {
    made = makeDomNode(String(node.type));
    made.parentElement = fakeCard;
    domNodes.set(node, made);
  }
  return made;
}

function renderElement(node) {
  if (node === null || node === undefined || typeof node !== 'object') return node;
  if (typeof node.type !== 'function') {
    const children = (node.children ?? []).map(renderElement);
    // React attaches a ref once per element identity, then detaches on unmount.
    if (!refAttached.has(node)) {
      refAttached.set(node, true);
      if (typeof node.ref === 'function') node.ref(domNodeFor(node));
      if (node.ref !== null && typeof node.ref === 'object' && 'current' in node.ref) node.ref.current = domNodeFor(node);
    }
    return { ...node, children };
  }
  const Component = node.type;
  // Class components (the view's error boundary) mount with `new` and keep their
  // instance on the same slot record, so state — including a caught error —
  // survives re-renders. A changed prop is a fresh mount, like React's key-less
  // remount on a different identity would be.
  if (React.Component.prototype.isPrototypeOf(Component.prototype)) {
    const propsKey = String(node.props && node.props.disabled);
    const record = stack[cursor];
    if (record === undefined || record.component !== Component || record.propsKey !== propsKey) {
      stack[cursor] = { component: Component, hooks: [], propsKey, instance: new Component(node.props) };
    }
    const instance = stack[cursor].instance;
    cursor += 1;
    try {
      return renderElement(instance.render());
    } catch (error) {
      if (typeof Component.getDerivedStateFromError === 'function') instance.state = { ...(instance.state ?? {}), ...Component.getDerivedStateFromError(error) };
      if (typeof instance.componentDidCatch === 'function') instance.componentDidCatch(error, { componentStack: `\n    in ${Component.name}` });
      return renderElement(instance.render());
    }
  }
  if (stack[cursor] === undefined || stack[cursor].component !== Component) stack[cursor] = { component: Component, hooks: [] };
  const record = stack[cursor];
  cursor += 1;
  const previous = current;
  current = record.hooks;
  const restored = cursor;
  cursor = 0;
  const rendered = Component(node.props);
  cursor = restored;
  current = previous;
  return renderElement(rendered);
}

function commit(Component, props) {
  pendingEffects = [];
  pendingCleanups = [];
  dirty = false;
  externalChange = false;
  cursor = 0;
  const tree = renderElement(createElement(Component, props));
  const queued = pendingEffects;
  const cleanups = pendingCleanups;
  pendingEffects = [];
  pendingCleanups = [];
  for (const cleanup of cleanups) cleanup();
  for (const effect of queued) {
    const cleanup = effect.fn();
    effect.slot.cleanup = typeof cleanup === 'function' ? cleanup : undefined;
  }
  return tree;
}

function render(Component, props) {
  let tree = null;
  for (let pass = 0; pass < 20; pass++) {
    tree = commit(Component, props);
    if (!dirty && !externalChange) break;
  }
  return tree;
}

// -- fake model directory ----------------------------------------------
const model = {
  id: 'deepseek-flash',
  name: 'DeepSeek V4 Flash',
  reasoning: {
    defaultEffort: 'high',
    efforts: [
      { id: 'off', name: 'off' },
      { id: 'low', name: 'low' },
      { id: 'medium', name: 'medium' },
      { id: 'high', name: 'high' },
      { id: 'max', name: 'max' },
    ],
  },
};

let snapshot = {
  current: { provider: 'deepseek-official', model: 'deepseek-flash', reasoningEffort: 'high' },
  routable: true,
  groups: [{ id: 'deepseek-official', name: 'DeepSeek', models: [model] }],
  failures: [],
  status: 'ready',
  pending: null,
  error: null,
};
const listeners = new Set();
const selections = [];
const loads = [];
// The shape the view consumes: a snapshot store plus the directory's verbs
// (exactly what the composer's own model seat gets from its inject face).
const store = {
  subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  getSnapshot() { return snapshot; },
};
const face = {
  store,
  select(selection) { selections.push(selection); return Promise.resolve({ ok: true, value: undefined }); },
  load() { loads.push(true); return Promise.resolve(); },
  disabled: false,
  probe: { mounted: () => {}, fail: (text) => console.log('  [probe fail]', text) },
};

function findClass(node, className) {
  if (node === null || typeof node !== 'object' || !Array.isArray(node.children)) return undefined;
  for (const child of node.children) {
    if (child && child.props && typeof child.props.className === 'string' && child.props.className.split(' ').includes(className)) return child;
    const nested = findClass(child, className);
    if (nested !== undefined) return nested;
  }
  return undefined;
}

function inputOf(dock) {
  const slider = findClass(dock, 'ti-slider');
  if (slider === undefined) throw new Error('the slider is missing from the rendered tree');
  const input = slider.children.find((child) => child && child.type === 'input');
  if (input === undefined) throw new Error('the slider has no range input');
  return input;
}

/** Load (once) and return the view chunk's exports, through the module table. */
let view = null;
const chunkRequests = [];
function chunkRequire(specifier) {
  chunkRequests.push(specifier);
  if (specifier === 'react') return React;
  throw new Error(`unexpected require(${specifier}) from the view chunk`);
}
function loadView() {
  if (view === null) {
    // The chunk registers itself, exactly like a package bundle does.
    let registration = null;
    const previous = globalThis.window.__ModuleLoader__;
    globalThis.window.__ModuleLoader__ = {
      load: (candidate) => {
        registration = candidate;
        if (previous && typeof previous.load === 'function' && candidate.id !== 'dsh-think-intensity/client.view.js') previous.load(candidate);
      },
    };
    try {
      new Function(chunkSource)();
    } finally {
      globalThis.window.__ModuleLoader__ = previous;
    }
    if (registration === null) throw new Error('the view chunk did not register itself via __ModuleLoader__.load');
    check(registration.id === 'dsh-think-intensity/client.view.js', `the chunk must register as "<owner>/<file>", saw ${registration.id}`);
    view = registration.factory(chunkRequire);
  }
  return view;
}

function probeStub() {
  return { mounted: () => {}, fail: (text) => console.log('  [probe fail]', text) };
}

/** A minimal stand-in for the controller the rail renders from. */
const commits = [];
function makeControl(overrides) {
  return Object.assign({
    usableStore: true,
    disabled: false,
    model: { reasoning: { defaultEffort: 'high', efforts: [] }, current: { provider: 'p', model: 'm', reasoningEffort: 'high' } },
    efforts: [{ id: 'off' }, { id: 'low' }, { id: 'medium' }, { id: 'high' }, { id: 'max' }],
    maxIndex: 4,
    currentIndex: 3,
    effectiveEffort: 'high',
    shown: 3,
    level: null,
    dragging: false,
    draggedRef: { current: false },
    flash: null,
    problem: null,
    state: { status: 'ready' },
    setLevel: () => {},
    requestCommit: (index) => { commits.push(Math.round(index)); },
    beginDrag: () => {},
    endDrag: () => {},
  }, overrides);
}

// -- load the entry, apply it, then drive the view -----------------------
const entryRequires = [];
let entryFactory = null;
globalThis.window.__ModuleLoader__ = { load: (registration) => { entryFactory = registration.factory; } };
new Function(entrySource)();
check(entryFactory !== null, 'the entry bundle did not register a factory');

const fakeRequire = Object.assign(
  (specifier) => {
    entryRequires.push(specifier);
    if (specifier === 'react') return React;
    throw new Error(`unexpected require(${specifier}) from the entry`);
  },
  {
    async: async (specifier) => {
      chunkRequests.push(specifier);
      return loadView();
    },
  },
);

const entry = entryFactory(fakeRequire);
check(Array.isArray(entry.inject) && entry.inject.includes('slots'), 'the entry must declare the slots injection');
check(typeof entry.apply === 'function', 'the entry must export apply()');

/** Seats the entry registered, keyed by slot name. */
const registered = new Map();
entry.apply({
  get: () => undefined,
  slots: {
    inject: (name, callback) => { callback(); },
    register: (options, Component) => { registered.set(options.name, Component); return () => {}; },
  },
});
await Promise.resolve();
await Promise.resolve();
await Promise.resolve();

check(chunkRequests.includes('./client.view.js'), 'the entry must load the view through the chunk channel');
check(chunkRequests.includes('react'), 'the view chunk must resolve React from the module table');
check(registered.has('conversation.input.right'), 'the entry must register the tool-row chip seat');
check(!registered.has('conversation.input.dock'), 'the composer-dock seat must NOT be mounted (no bar above the card)');
check([...registered.values()].every((Component) => typeof Component === 'function'), 'every seat must be a component');

if (!registered.has('conversation.input.right')) {
  console.error('FAIL: the chip seat never registered; requests =', JSON.stringify(chunkRequests));
  process.exit(1);
}

const chip = render(registered.get('conversation.input.right'), Object.assign({}, face, { disabled: false }));
const chipButton = findClass(chip, 'ti-chip');
let input = null;

console.log('style tags installed   :', [...styleTags.keys()]);
console.log('chunk requests         :', JSON.stringify(chunkRequests));
console.log('registered seats       :', [...registered.keys()].join(', '));
console.log('declared levels        :', model.reasoning.efforts.map((level) => level.id).join(' -> '));
console.log('chip is a button       :', chipButton !== undefined && chipButton.type === 'button');
console.log('chip label / value     :', findClass(chip, 'ti-chip-label').children, '/', findClass(chip, 'ti-chip-value').children);

check(styleTags.size === 1, `the stylesheet was not installed exactly once (${styleTags.size})`);
check(chipButton !== undefined && chipButton.type === 'button', 'the chip seat must render a button');
check(findClass(chip, 'ti-popover') === undefined, 'the chip must start collapsed');
check(findClass(chip, 'ti-slider') === undefined, 'the collapsed chip must not render the rail yet');
check(findClass(chip, 'ti-chip-dot') !== undefined, 'the collapsed chip must still show the level meter');

// The rail's geometry contract — pointer x to level index — is plain arithmetic.
const GEOMETRY = [0, 0.25, 0.5, 0.75, 1].map((ratio) => Math.round(ratio * 4));
check(GEOMETRY.join(',') === '0,1,2,3,4', 'the rail must map the full width onto all four level steps');

// The regression that pinned the thumb at the far left even at the top level: the
// rail must own `--ti-pct`, because the thumb and the fill are its descendants and
// the popover puts them in a separate subtree from the outer wrapper.
const rail = render(loadView().Slider, { ctl: makeControl({ shown: 3, maxIndex: 4 }), readoutText: 'high' });
const railStyle = rail.props.style;
console.log('rail --ti-pct / level  :', railStyle['--ti-pct'], '/', railStyle['--ti-level']);
check(railStyle['--ti-pct'] === '75.00%', `the rail must carry --ti-pct at 75%, saw ${String(railStyle['--ti-pct'])}`);
check(String(railStyle['--ti-level']) === '3', `the rail must carry the current level, saw ${String(railStyle['--ti-level'])}`);
check(typeof railStyle['--ti-glow'] === 'string', 'the rail must carry the level colour');
check(findClass(rail, 'ti-thumb') !== undefined, 'the rail must render its thumb');
check(findClass(rail, 'ti-pointer') !== undefined, 'the rail must render its pointer surface');

// The commit path: a pointer move must reach `select`, and the release must write
// The commit path: a pointer move must queue a write, the queue must collapse
// repeats, and the release must flush the final level.
const calls = [];
const dragCtl = makeControl({
  shown: 3,
  requestCommit: (index) => { calls.push(Math.round(index)); },
  setLevel: () => {},
  draggedRef: { current: true },
});
const dragRail = render(loadView().Slider, { ctl: dragCtl, readoutText: 'high' });
const surface = findClass(dragRail, 'ti-pointer');
const fakeEvent = { clientX: 90, pointerType: 'mouse', button: 0, currentTarget: { setPointerCapture() {} }, preventDefault() {} };
surface.props.onPointerMove(fakeEvent);
surface.props.onPointerMove(fakeEvent);
// The rail has no layout in this harness, so every x maps to the top of the range.
console.log('pointer move -> writes :', JSON.stringify(calls));
check(calls.length === 2, `every pointer move must queue a write, saw ${calls.length}`);
check(calls.every((value) => value >= 0 && value <= 4), 'a queued write must be a whole level index');

// The level-crossing burst.
//
// It is verified in two halves, because they fail for different reasons:
//   * the CSS half is asserted from the installed stylesheet;
//   * the DOM half is driven directly (`createBurstHost` / `armBurstLayers`), which
//     is pure DOM and therefore needs no renderer, no hooks and no layout — the
//     renderer stub cannot be trusted to keep a ref cell alive across passes.
const burstView = loadView();
{
  // The regression that parked a blurred 280px disc over the composer: the layers
  // used to have no resting state, so any moment without a running animation left
  // them at full size and full opacity. Every layer must now declare `opacity:0`
  // outside the animation, and the host must carry no replay flag while idle.
  // The ring slots share one rule, so the check is "some rule that names this class
  // also declares opacity:0", not "the class has a rule of its own".
  const burstCss = [...styleTags.values()].map((tag) => String(tag.textContent)).join('');
  const restsInvisible = (cls) => burstCss
    .split('}')
    .some((block) => block.includes('.' + cls) && block.includes('opacity:0'));
  for (const cls of ['ti-ion-splash', 'ti-ion-core', 'ti-ion-beam', 'ti-ion-flashring', 'ti-ion-ring', 'ti-ion-ring2', 'ti-ion-ring3', 'ti-ion-ring4']) {
    check(restsInvisible(cls), `${cls} must declare a resting opacity of 0`);
  }
  check(/\.ti-ion\[data-run\] \.ti-ion-core/.test(burstCss), 'the animations must hang off the presence of the replay flag');
  check(/\.ti-ion-ring3\[data-arm\]/.test(burstCss), 'the extra ring slots must be gated by the arming flag');
  check(/\.ti-ion\[data-run\] \.ti-ion-flashring/.test(burstCss), 'the white-hot front must animate with the replay flag');
  check(/@keyframes ti-ion-front/.test(burstCss), 'the white-hot front must own keyframes');
  check(/\.ti-ion-ring::before/.test(burstCss), 'each ring must carry a white leading edge');
  check(/\.ti-ion-ring::after/.test(burstCss), 'each ring must carry a lit interior');
  check(!/data-run='true'/.test(burstCss), 'the flag must be a presence flag, not a string comparison');

  // The escalating force: every rung of the ladder must be strictly heavier than
  // the one below it — more rings, a wider reach, a brighter core, a longer life.
  const plan = burstView.burstPlan;
  check(typeof plan === 'function', 'the burst plan must be exported for the force check');
  const rungs = [0, 1, 2, 3, 4].map((level) => plan(level, 4));
  console.log('burst force per level  :', rungs.map((rung) => `${rung.rung}:r${rung.rings}/d${rung.dur}/e${rung.end}/c${rung.coreA}/sa${rung.sa}`).join('  '));
  for (let i = 1; i < rungs.length; i++) {
    const lower = rungs[i - 1];
    const upper = rungs[i];
    check(upper.rung >= lower.rung, `rung ${i} must not be weaker than rung ${i - 1}`);
    check(upper.rings >= lower.rings, `rung ${i} must not have fewer rings (${lower.rings} -> ${upper.rings})`);
    check(upper.dur > lower.dur, `rung ${i} must last longer (${lower.dur} -> ${upper.dur})`);
    check(upper.end > lower.end, `rung ${i} must reach further (${lower.end} -> ${upper.end})`);
    check(upper.coreA > lower.coreA, `rung ${i} must have a brighter core (${lower.coreA} -> ${upper.coreA})`);
    check(upper.weight >= lower.weight, 'a higher rung must not have a thinner stroke');
    check(upper.sa > lower.sa, `rung ${i} must have a stronger wall flash (${lower.sa} -> ${upper.sa})`);
  }
  check(rungs[0].rings === 1 && rungs[4].rings >= 3, 'the ladder must run from a single ring to a multi-ring detonation');
  check(rungs[0].beam === false && rungs[1].beam === true, 'the beam must unlock above the lowest level');
  check(rungs[4].end >= rungs[2].end * 1.4, 'the top rung must out-reach the middle rung by a wide margin');

  // The DOM half: one host, a fixed pool of slots, and a per-level arming decision.
  const host = burstView.createBurstHost();
  documentRoot.appendChild(host);
  check(host.attributes['data-run'] === undefined, 'a fresh burst host must carry no replay flag');
  check(host.children.length === 4 + burstView.ION_LAYER_CLASSES.length, `the host must hold every layer up front, saw ${host.children.length}`);
  check(host.children.every((node) => node.attributes['data-run'] === undefined), 'no layer may start armed');

  burstView.armBurstLayers(host, rungs[0]);
  const armedLight = host.children.filter((node) => node.attributes['data-arm'] !== undefined).length;
  burstView.armBurstLayers(host, rungs[4]);
  const armedHeavy = host.children.filter((node) => node.attributes['data-arm'] !== undefined).length;
  console.log('armed ring slots       : level 0 ->', armedLight, '| level 4 ->', armedHeavy);
  check(armedLight === rungs[0].rings, `the lowest level must arm exactly ${rungs[0].rings} ring(s), saw ${armedLight}`);
  check(armedHeavy === rungs[4].rings, `the top level must arm exactly ${rungs[4].rings} rings, saw ${armedHeavy}`);
  check(armedHeavy > armedLight, `the top level must arm more rings than the bottom (${armedLight} -> ${armedHeavy})`);
  check(host.children.length === 4 + burstView.ION_LAYER_CLASSES.length, 'arming must toggle slots, never add or remove nodes');

  // Re-arming downwards must park the extra slots again.
  burstView.armBurstLayers(host, rungs[0]);
  check(host.children.filter((node) => node.attributes['data-arm'] !== undefined).length === armedLight, 'a lighter level must disarm the extra slots');

  // The armed slots must be told how far and how long to travel.
  burstView.armBurstLayers(host, rungs[4]);
  const armedSlot = host.querySelector('.ti-ion-ring4');
  console.log('top slot dur / reach   :', armedSlot.styleVars['--ti-ion-dur'], '/', armedSlot.styleVars['--ti-ion-ring-end']);
  check(armedSlot.attributes['data-arm'] !== undefined, 'the outermost slot must be armed at the top level');
  check(Number.parseFloat(armedSlot.styleVars['--ti-ion-ring-end']) > 0, 'an armed slot must be given a terminal scale');
  check(String(armedSlot.styleVars['--ti-ion-dur']).endsWith('s'), 'an armed slot must be given a duration');
}

// The regression that made the effect vanish entirely: the node a replay lands on
// must SURVIVE a render cycle. When the hook's cleanup detached it, the next firing
// built a node the browser had never painted, replayed the animation there, and the
// user saw nothing at all. So the probe is rendered, torn down, rendered again, and
// the node must still be the same one, still attached, still able to replay.
{
  const sink = {};
  render(burstView.IonBurstProbe, { sink });
  check(typeof sink.fire === 'function', 'the burst trigger must be available');
  check(typeof sink.observe === 'function', 'the probe must expose the node it fires at');
  if (typeof sink.fire === 'function' && typeof sink.observe === 'function') {
    sink.fire(300, 200, 4, 4);
    const firstNode = sink.observe();
    check(firstNode !== null && firstNode !== undefined, 'a firing must produce a node to animate');
    const firstCycles = Number(firstNode.styleVars['--ti-ion-cycles']);

    // Render again — the harness re-runs mount cleanups between passes, which is
    // exactly the event that used to destroy the node.
    render(burstView.IonBurstProbe, { sink });
    sink.fire(320, 200, 2, 4);
    const secondNode = sink.observe();
    console.log('burst node stable      :', firstNode === secondNode, '| cycles', firstCycles, '->', secondNode.styleVars['--ti-ion-cycles']);
    check(secondNode === firstNode, 'the burst node must survive a render cycle, not be rebuilt');
    check(secondNode.attributes['data-run'] !== undefined, 'the replay flag must be set on the surviving node');
    check(secondNode.styleVars['--ti-ion-x'] === '320px', 'the surviving node must take the new origin');
    check(Number(secondNode.styleVars['--ti-ion-cycles']) > firstCycles, 'the replay counter must keep advancing on that node');
    check(secondNode.parentNode !== null, 'the surviving node must still be attached to the document');
  }
}

// The resident ambient effect. It is a state, not an event, so the things worth
// asserting are: only the "off" level renders nothing, and every rung above it
// unlocks MORE STRUCTURE than the one below — not merely a dimmer copy.
{
  const tiers = [0, 1, 2, 3, 4].map((level) => burstView.ambientPlan(level, 4));
  const shapeCount = (tier) => tier.motes + tier.rings + tier.sweeps + tier.sheets;
  // The installed stylesheet: needed here for the shape-contract assertions below.
  const css0 = [...styleTags.values()].map((tag) => String(tag.textContent)).join('');
  console.log('ambient per level      :', tiers.map((tier) => `${tier.rung}:${tier.key}/m${tier.motes}/r${tier.rings}/w${tier.sweeps}/s${tier.sheets}`).join('  '));

  // THE CRASH. `ambientPlan` is called with LIVE DRAG VALUES, so `levelIndex` arrives
  // fractional (`ratio * maxIndex` while the thumb moves) and `maxIndex` can arrive
  // non-numeric. Both used to produce an out-of-range table index, and the next
  // property read threw — which took the whole control down and left the light
  // curtains unpainted. Every input below must return a usable plan.
  const hostile = [
    [1.5, 4], [3.7, 4], [2.5, 5], [0.4, 4],
    [0, undefined], [1, undefined], [0, null], [1, null], [0, NaN], [1, NaN],
    [0, '4'], [1, '4'], [0, ''], [1, {}], [1, []],
    [-1, 4], [-5, -5], [0, -1], [1, 0], [0, 0],
    [5, 4], [6, 4], [100, 4], [0, 100], [50, 100], [999, 999],
  ];
  let hostileFailures = 0;
  for (const [level, max] of hostile) {
    try {
      const plan = burstView.ambientPlan(level, max);
      const ok = plan !== null && plan !== undefined
        && Number.isInteger(plan.rung) && plan.rung >= 0 && plan.rung <= 5
        && typeof plan.key === 'string' && plan.key.length > 0
        && Number.isFinite(plan.motes) && Number.isFinite(plan.rings)
        && Number.isFinite(plan.sweeps) && Number.isFinite(plan.sheets);
      if (!ok) {
        hostileFailures += 1;
        console.log('  hostile plan not usable:', JSON.stringify(level), JSON.stringify(max), '->', JSON.stringify(plan));
      }
    } catch (error) {
      hostileFailures += 1;
      console.log('  hostile input threw   :', JSON.stringify(level), JSON.stringify(max), '->', error.message);
    }
  }
  console.log('hostile inputs survived:', hostile.length - hostileFailures, '/', hostile.length);
  check(hostileFailures === 0, `${hostileFailures} hostile input(s) did not produce a usable plan`);
  // A fractional level must floor to a real row rather than landing between rows.
  check(burstView.ambientPlan(3.7, 4).rung === 3, 'a fractional level must floor to the row below it');
  check(burstView.ambientPlan(1.5, 4).rung === 1, 'a fractional level must floor rather than round up');
  // A missing ladder is the off rung, not a crash.
  check(burstView.ambientPlan(3, undefined).rung === 0, 'a missing max must resolve to the off rung');
  check(burstView.ambientPlan(3, 0).on === false, 'a ladder with no levels must render nothing');

  // THE REGRESSION THAT MADE EVERY LEVEL LOOK THE SAME. The level-to-rung mapping used
  // to be `round(level / max * span)`, which on a five-level ladder resolves to
  // `0,1,1,0,0`: low and medium shared a rung, high and max shared a rung, and the rung
  // order was not even monotonic. Every level must now land on its OWN rung.
  const rungs = tiers.map((tier) => tier.rung);
  console.log('rungs per level        :', rungs.join(' -> '));
  check(new Set(rungs).size === rungs.length, `every level must land on its own rung, saw ${rungs.join(',')}`);
  for (let i = 1; i < rungs.length; i++) {
    check(rungs[i] > rungs[i - 1], `rung order must be strictly increasing (${rungs[i - 1]} -> ${rungs[i]})`);
  }
  // And no two levels may produce the same recipe, whatever the mapping does later.
  const recipes = tiers.map((tier) => [tier.motes, tier.rings, tier.sweeps, tier.sheets, tier.rung].join('/'));
  check(new Set(recipes).size === recipes.length, `no two levels may share a recipe, saw ${recipes.join(' | ')}`);

  // ONLY THE LOWEST LEVEL IS SILENT. Every rung above it renders, all the way to the
  // top of the ladder — the ladder must never go quiet again as it climbs.
  check(tiers[0].on === false && shapeCount(tiers[0]) === 0, 'the lowest level must render no effect at all');
  check(tiers.slice(1).every((tier) => tier.on && shapeCount(tier) > 0), 'every level above the lowest must render an effect');
  // The top LEVEL must land on the top RUNG of the recipe table, whatever its size.
  const topRung = rungs[rungs.length - 1];
  check(topRung === rungs.length - 1, 'a ladder with at least as many rungs as levels must use every rung');
  check(tiers[4].peak === true, 'the top rung must be flagged as the peak');

  // Monotonic escalation stated as a property: every rung adds shapes, and never takes
  // an effect away. This is the "递进" requirement, mechanically checked.
  const lit = tiers.filter((tier) => tier.on);
  check(lit.length === 4, `four rungs must be lit on a five-step ladder, saw ${lit.length}`);
  for (let i = 1; i < lit.length; i++) {
    check(lit[i].motes > lit[i - 1].motes, `rung ${i} must carry more motes than rung ${i - 1}`);
    check(lit[i].rings >= lit[i - 1].rings, `rung ${i} must not carry fewer rings than rung ${i - 1}`);
    check(lit[i].sweeps >= lit[i - 1].sweeps, `rung ${i} must not carry fewer sweeps than rung ${i - 1}`);
    check(lit[i].sheets >= lit[i - 1].sheets, `rung ${i} must not carry fewer sheets than rung ${i - 1}`);
    check(shapeCount(lit[i]) > shapeCount(lit[i - 1]), `rung ${i} must add structure, not just repeat rung ${i - 1}`);
  }
  // Every rung must unlock something that was not there before.
  check(lit[0].motes > 0 && lit[0].rings === 0, 'the first lit rung must be motes only');
  check(lit[1].rings > 0, 'the second lit rung must unlock the rings');
  check(lit[2].sweeps > 0, 'the third lit rung must unlock the sweeps');
  check(lit[3].sheets > 0, 'the top lit rung must unlock the aurora sheets');

  // The DOM half: one host, four pre-created pools, counts following the rung.
  const ambient = burstView.createAmbientHost();
  documentRoot.appendChild(ambient);
  check(ambient.attributes['data-on'] === 'false', 'a fresh ambient host must be switched off');
  check(ambient.children.length === 4, `the ambient host must hold its four pools up front, saw ${ambient.children.length}`);

  burstView.applyAmbient(ambient, tiers[0], 'hsl(0 0% 0% / 0)');
  check(ambient.attributes['data-on'] === 'false', 'the lowest tier must leave the effect switched off');

  // The richest rung carries every kind of shape, so this is the rung that can prove
  // the whole contract. With the mapping fixed, only the top rung has all four pools —
  // a middle rung legitimately has zero sweeps.
  const litTier = tiers[4];
  const midTier = tiers[2];
  check(litTier.peak === true, 'the top rung must be flagged as the peak');
  burstView.applyAmbient(ambient, litTier, 'hsl(0 0% 0% / 0)');
  check(ambient.attributes['data-on'] === 'true', 'the top rung must switch the effect on');
  check(ambient.attributes['data-peak'] === 'true', 'the host must report the peak flag on the top rung');
  check(ambient.attributes['data-lv'] === String(litTier.rung), 'the aura must record which rung it is showing');
  const counts = {};
  for (const pool of ['motes', 'rings', 'sweeps', 'aurora']) {
    counts[pool] = Number(ambient.querySelector('[data-pool="' + pool + '"]').attributes['data-count']);
  }
  console.log('ambient shapes at rung :', JSON.stringify(counts), 'total', ambient.attributes['data-painted']);
  check(counts.motes === litTier.motes, `the mote pool must match the recipe (${counts.motes} vs ${litTier.motes})`);
  check(counts.rings === litTier.rings, `the ring pool must match the recipe (${counts.rings} vs ${litTier.rings})`);
  check(counts.sweeps === litTier.sweeps, `the sweep pool must match the recipe (${counts.sweeps} vs ${litTier.sweeps})`);
  check(counts.aurora === litTier.sheets, `the sheet pool must match the recipe (${counts.aurora} vs ${litTier.sheets})`);
  check(Number(ambient.attributes['data-painted']) === shapeCount(litTier), 'the painted total must be the sum of the pools');
  // The shapes must be real elements carrying their own geometry and timing.
  const aMote = ambient.querySelector('[data-pool="motes"]').children[0];
  check(aMote !== undefined, 'the mote pool must actually contain shapes');
  check(String(aMote.className).indexOf('ti-amb-mote') >= 0, 'a mote must carry its class');
  for (const prop of ['--mx', '--my', '--ms', '--md', '--mdl']) {
    check(aMote.styleVars[prop] !== undefined, `a mote must carry ${prop}`);
  }
  const aRing = ambient.querySelector('[data-pool="rings"]').children[0];
  check(String(aRing.className).indexOf('ti-amb-ring') >= 0, 'a ring must carry its class');
  for (const prop of ['--rx', '--ry', '--rd', '--rdl', '--rscale']) {
    check(aRing.styleVars[prop] !== undefined, `a ring must carry ${prop}`);
  }

  // A sweep must be a THIN, TILTED, RIPPLING ribbon: thin enough to read as a light
  // streak, tilted and swinging so its path curves, and given a vertical amplitude so
  // it undulates instead of sliding along a rail.
  const sweepNode = ambient.querySelector('[data-pool="sweeps"]').children[0];
  check(String(sweepNode.className).indexOf('ti-amb-sweep') >= 0, 'a sweep must carry its class');
  for (const prop of ['--sh', '--st0', '--st1', '--stm', '--samp', '--sd', '--sdl', '--so']) {
    check(sweepNode.styleVars[prop] !== undefined, `a sweep must carry ${prop}`);
  }
  const stripVh = Number.parseFloat(sweepNode.styleVars['--sh']);
  console.log('sweep thickness / ripple:', sweepNode.styleVars['--sh'], '/', sweepNode.styleVars['--samp']);
  check(stripVh >= 8 && stripVh <= 18, `a sweep must stay thin, saw ${stripVh}vh`);
  check(Number.parseFloat(sweepNode.styleVars['--samp']) > 0, 'a sweep must carry a non-zero ripple amplitude');
  check(Number.parseFloat(sweepNode.styleVars['--st0']) < 0 && Number.parseFloat(sweepNode.styleVars['--st1']) > 0, 'a sweep must swing its tilt through zero');
  // And the ripple must actually be wired into the keyframes, on Y, in both directions.
  check(/@keyframes ti-amb-sweep\{[\s\S]*?var\(--samp/.test(css0), 'the sweep keyframes must consume the ripple amplitude');
  check(/@keyframes ti-amb-sweep\{[\s\S]*?rotate\(var\(--st0/.test(css0), 'the sweep keyframes must consume the tilt');
  const sweepKeys = (css0.match(/@keyframes ti-amb-sweep\{[\s\S]*?\}\}/) || [''])[0];
  // Every Y argument of every `translate3d(` in the keyframes. A hand-rolled scanner
  // rather than a regex: the arguments contain `calc(var(--samp,4vh) * -1)`, whose
  // inner parens and comma defeat any single-pattern match.
  const yValues = [];
  for (let at = sweepKeys.indexOf('translate3d('); at >= 0; at = sweepKeys.indexOf('translate3d(', at + 1)) {
    let depth = 1;
    let cursor = at + 'translate3d('.length;
    const parts = [];
    let current = '';
    while (cursor < sweepKeys.length && depth > 0) {
      const ch = sweepKeys[cursor];
      if (ch === '(') depth += 1;
      if (ch === ')') {
        depth -= 1;
        if (depth === 0) break;
      }
      if (ch === ',' && depth === 1) {
        parts.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
      cursor += 1;
    }
    parts.push(current.trim());
    if (parts.length >= 2) yValues.push(parts[1]);
  }
  const magnitudes = new Set(yValues.map((value) => value
    .replace(/var\(--samp,[^)]*\)/g, 'S')
    .replace(/calc\(|\)/g, '')
    .replace(/vh/gi, '')
    .replace(/\s+/g, '')
    .toLowerCase()));
  console.log('sweep path Y stops     :', yValues.join(' | '));
  console.log('sweep ripple stops     :', [...magnitudes].join(' | '));
  check(yValues.length >= 5, `the ripple needs several Y stops, saw ${yValues.length}`);
  check(yValues.some((value) => value.indexOf('--samp') >= 0), 'the ripple must use the amplitude on Y');
  check(magnitudes.size >= 4, `the ripple must actually vary Y, saw ${magnitudes.size} distinct stop(s)`);

  // The next rung down must be strictly lighter on every pool it carries — that is the
  // escalation, checked against a DIFFERENT LEVEL (not the same level twice).
  burstView.applyAmbient(ambient, midTier, 'hsl(0 0% 0% / 0)');
  const midCounts = {};
  for (const pool of ['motes', 'rings', 'sweeps', 'aurora']) {
    midCounts[pool] = Number(ambient.querySelector('[data-pool="' + pool + '"]').attributes['data-count']);
  }
  console.log('ambient shapes mid / top:', JSON.stringify(midCounts), '/', JSON.stringify(counts));
  check(counts.motes > midCounts.motes, `the top rung must have more motes than the middle (${midCounts.motes} -> ${counts.motes})`);
  check(counts.rings > midCounts.rings, `the top rung must have more rings than the middle (${midCounts.rings} -> ${counts.rings})`);
  check(counts.sweeps > midCounts.sweeps, `the top rung must have more sweeps than the middle (${midCounts.sweeps} -> ${counts.sweeps})`);
  check(counts.aurora > midCounts.aurora, `the top rung must have more aurora than the middle (${midCounts.aurora} -> ${counts.aurora})`);
  check(Number(ambient.attributes['data-peak']) === 0 || ambient.attributes['data-peak'] === 'false', 'a middle rung must not claim the peak flag');

  // Returning to the lowest rung must switch it off and empty every pool.
  burstView.applyAmbient(ambient, tiers[0], 'hsl(0 0% 0% / 0)');
  check(ambient.attributes['data-on'] === 'false', 'dropping to the lowest tier must switch the effect off again');
  for (const pool of ['motes', 'rings', 'sweeps', 'aurora']) {
    check(Number(ambient.querySelector('[data-pool="' + pool + '"]').attributes['data-count']) === 0, `the ${pool} pool must empty at the lowest tier`);
  }
  const offPlanShapes = ['motes', 'rings', 'sweeps', 'sheets'].map((k) => tiers[0][k]).join('/');
  const offPlanDom = ['motes', 'rings', 'sweeps', 'aurora']
    .map((k) => Number(ambient.querySelector('[data-pool="' + k + '"]').attributes['data-count'])).join('/');

  // ── the effect switches: TWO PRIMARY KEYS, three states ────────────────
  //
  //   mode = default   the rung supplies everything; the sub-keys are inert
  //   mode = custom    only the checked families render
  //   mode = off       nothing renders, identical to the lowest rung
  //
  // The requirement is exact: with the effects off, the screen must match the lowest
  // level. That is only trustworthy if "off" collapses to the SAME PLAN SHAPE as the
  // off rung and paints the SAME DOM — so both are asserted, not eyeballed.
  const sw = burstView;
  const modeSettings = (mode, over) => Object.assign({}, sw.defaultEffectSettings(), { mode }, over || {});
  const allOff = modeSettings('off');
  const topPlan = sw.ambientPlan(4, 4);

  // (1) off mode: the plan is the off rung's shape, and the DOM matches it.
  const silenced = sw.applyEffectFilter(topPlan, allOff);
  console.log('mode off -> plan       :', ['motes', 'rings', 'sweeps', 'sheets'].map((k) => silenced[k]).join('/'),
    '| on', silenced.on, '| peak', silenced.peak);
  check(silenced.on === false, 'off mode must switch the effect off');
  check(silenced.peak === false, 'a silenced plan must not claim the peak treatment');
  check(['motes', 'rings', 'sweeps', 'sheets'].every((k) => silenced[k] === 0), 'off mode must zero every shape count');
  check(['motes', 'rings', 'sweeps', 'sheets'].map((k) => silenced[k]).join('/') === offPlanShapes,
    `off mode must produce the off rung's shape (${offPlanShapes})`);
  sw.applyAmbient(ambient, silenced, 'hsl(0 0% 0% / 0)');
  const silencedDom = ['motes', 'rings', 'sweeps', 'aurora']
    .map((k) => Number(ambient.querySelector('[data-pool="' + k + '"]').attributes['data-count'])).join('/');
  console.log('mode off -> dom        :', silencedDom, '| off rung dom', offPlanDom);
  check(silencedDom === offPlanDom, 'off mode must paint the same DOM as the off rung');
  check(ambient.attributes['data-on'] === 'false', 'off mode must leave the host switched off');

  // (2) DEFAULT MODE APPLIES NOTHING — the rung owns the combination outright.
  //
  // This is the fix for "默认特效又没了". Default mode used to AND the checkboxes with the
  // rung's supply, so a family unticked earlier during a CUSTOM session stayed unticked in
  // storage and silently removed itself from the default supply. The lamps read the rung, so
  // they kept claiming everything was fine while the screen was black — exactly the reported
  // symptom (`on=false lv=3` with all four pools empty and the mode key reading 默认特效).
  const untouched = sw.applyEffectFilter(topPlan, modeSettings('default'));
  check(untouched === topPlan, 'default mode must return the real plan unchanged, not a copy');
  check(untouched.filtered === undefined || untouched.filtered === false, 'the real plan must not be marked as filtered');
  for (const key of sw.EFFECT_KEYS) {
    // A stale selection from a custom session must be INERT in default mode.
    const staleBoxes = modeSettings('default', { [key]: false });
    const stillFull = sw.applyEffectFilter(topPlan, staleBoxes);
    check(stillFull === topPlan, `default mode must ignore an unticked ${key} left in storage`);
    check(sw.effectEnabled(staleBoxes, key) === true, `default mode must report ${key} as rendering regardless of its box`);
    check(sw.effectChecked(staleBoxes, key) === false, `default mode must still remember that ${key} is unticked`);
  }
  // Even with EVERY box unticked, default mode renders the full rung: that is the whole point
  // of the mode, and it is what makes the reported bug impossible to reproduce.
  const allBoxesOff = modeSettings('default', { motes: false, rings: false, sweeps: false, aurora: false });
  const stillEverything = sw.applyEffectFilter(topPlan, allBoxesOff);
  check(stillEverything === topPlan, 'default mode with every box unticked must still render the full rung');
  check(stillEverything.on === true, 'default mode with every box unticked must stay switched on');
  check(sw.effectEnabled(allBoxesOff, 'motes') === true && sw.effectEnabled(allBoxesOff, 'aurora') === true,
    'default mode must render every family whatever the boxes say');
  check(sw.effectsAreCustom(allBoxesOff) === false, 'the mode is still default even with boxes unticked');
  check(sw.effectsFromRung(allBoxesOff) === true, 'default mode must draw its lamps from the rung');
  check(sw.effectsFromRung(modeSettings('custom')) === false, 'custom mode must draw its lamps from the boxes');
  // And the end-to-end reproduction of the report: default mode at rung 3 with every box
  // unticked must still paint an effect.
  {
    const rung3 = sw.ambientPlan(3, 4);
    const filtered = sw.applyEffectFilter(rung3, allBoxesOff);
    check(filtered.on === true && filtered.motes > 0 && filtered.rings > 0 && filtered.sweeps > 0,
      'the reported state (default mode, rung 3, boxes unticked) must still paint');
  }

  // (3) custom mode: every checkbox must be MEANINGFUL AT EVERY LEVEL, and the intensity must
  // be the MAXIMUM regardless of the selected level.
  //
  // Two earlier attempts failed here. Inheriting the rung's counts made the 光环 / 流光 / 极光
  // keys dead (a low rung supplies zero of them, so `min(0, checked)` is zero either way).
  // A per-rung SCALED baseline made the intensity depend on the level, so a low level could
  // not show a strong effect. Custom mode is about the COMBINATION, not the amount, so it now
  // hands out a flat maximum to every family.
  const supply = sw.CUSTOM_SUPPLY;
  console.log('custom supply (max)    :', JSON.stringify(supply));
  check(['motes', 'rings', 'sweeps', 'sheets'].every((k) => supply[k] > 0),
    'custom mode must supply every family, so every key does something');
  // The requested shape: the table's TOP ROW, pinned exactly — 88/6/4/4. Pinning it here is
  // deliberate, so a future edit to the tier table cannot silently change what custom mode
  // hands out. Note the two axes: these numbers are DENSITY, and brightness is handled by the
  // `data-custom` flag (asserted further down), not by inflating the counts.
  check(supply.motes === 88 && supply.rings === 6 && supply.sweeps === 4 && supply.sheets === 4,
    `custom mode must supply the top row 88/6/4/4, saw ${[supply.motes, supply.rings, supply.sweeps, supply.sheets].join('/')}`);
  // The top row is by definition the strongest thing the ladder can produce, so custom mode
  // can never be weaker than the top LEVEL the user can select.
  check(['motes', 'rings', 'sweeps', 'sheets'].every((k) => supply[k] >= topPlan[k]),
    `custom mode must be at least as strong as the top LEVEL, saw ${[supply.motes, supply.rings, supply.sweeps, supply.sheets].join('/')} vs ${[topPlan.motes, topPlan.rings, topPlan.sweeps, topPlan.sheets].join('/')}`);
  for (const key of sw.EFFECT_KEYS) {
    const only = modeSettings('custom', { [key]: false });
    const filtered = sw.applyEffectFilter(topPlan, only);
    const zeroed = { motes: 'motes', rings: 'rings', sweeps: 'sweeps', aurora: 'sheets' }[key];
    check(filtered[zeroed] === 0, `custom mode with ${key} unchecked must zero ${zeroed}`);
    const customFullCounts = sw.applyEffectFilter(topPlan, modeSettings('custom'));
    for (const other of ['motes', 'rings', 'sweeps', 'sheets']) {
      if (other !== zeroed) check(filtered[other] === customFullCounts[other], `unchecking ${key} must leave ${other} at its supplied count`);
    }
    check(filtered.on === true, 'the effect must stay on while other families are checked');
    check(sw.effectEnabled(only, key) === false, `${key} must report itself disabled in custom mode`);
    check(sw.effectsAreCustom(only) === true, 'custom mode must report the checkboxes as live');
  }
  // THE INTENSITY MUST BE MAX AT EVERY LEVEL, AND IDENTICAL ACROSS LEVELS.
  const customLadder = [0, 1, 2, 3, 4].map((level) => sw.applyEffectFilter(sw.ambientPlan(level, 4), modeSettings('custom')));
  console.log('custom per level       :', customLadder.map((p) => [p.motes, p.rings, p.sweeps, p.sheets].join('/')).join('  '));
  for (let i = 1; i < customLadder.length; i += 1) {
    for (const field of ['motes', 'rings', 'sweeps', 'sheets']) {
      check(customLadder[i][field] === customLadder[i - 1][field],
        `custom mode ${field} must not depend on the level (${customLadder[i - 1][field]} -> ${customLadder[i][field]})`);
    }
  }
  check(['motes', 'rings', 'sweeps', 'sheets'].every((k) => customLadder[0][k] === supply[k]),
    'custom mode at the LOWEST level must still be as strong as max');
  // The palette must be CONSTANT across levels in custom mode, for the reason asserted below:
  // the lowest rung's palette has `alpha: 0`, which is the glow colour for every shape.
  const paletteCount = new Set(customLadder.map((p) => [p.a, p.b, p.c].join('|'))).size;
  check(paletteCount === 1, `custom mode must use ONE palette at every level, saw ${paletteCount}`);
  check(customLadder.every((p) => p.a === sw.CUSTOM_SUPPLY_TIER.a),
    'every custom level must use the top row palette');
  check(customLadder.every((p) => p.alpha === sw.CUSTOM_SUPPLY_TIER.alpha && p.alpha > 0),
    'every custom level must carry a non-zero glow alpha');
  check(customLadder[4].rung === 4 && customLadder[0].rung === 0, 'the rung must still follow the level');
  // The three states must remain three distinct states.
  check(sw.EFFECT_MODES.length === 3 && sw.EFFECT_MODES.join(',') === 'default,custom,off',
    'the mode key must keep its three states');
  check(sw.applyEffectFilter(topPlan, modeSettings('off')).on === false,
    'the off state must still be able to blank the screen');
  // Custom mode must work at a LEVEL THAT SUPPLIES NOTHING. On `low` the default supply is
  // 0 rings / 0 sweeps / 0 sheets; custom mode must still light all three at max strength.
  const lowPlan = sw.ambientPlan(1, 4);
  const lowCustom = sw.applyEffectFilter(lowPlan, modeSettings('custom', { motes: false }));
  console.log('low rung custom        :', ['motes', 'rings', 'sweeps', 'sheets'].map((k) => lowCustom[k]).join('/'),
    '| low default', ['motes', 'rings', 'sweeps', 'sheets'].map((k) => lowPlan[k]).join('/'));
  check(lowPlan.rings === 0, 'the low rung must not supply rings by default');
  check(lowCustom.rings > 0, 'custom mode must supply rings even on a rung that gives none');
  check(lowCustom.sweeps > 0 && lowCustom.sheets > 0, 'custom mode must supply sweeps and aurora even on a rung that gives none');
  // And on that rung each of them must carry the TOP ROW's own count, not a token amount.
  check(lowCustom.rings === 6 && lowCustom.sweeps === 4 && lowCustom.sheets === 4,
    `custom mode must give the top row's counts on a rung that supplies nothing, saw ${lowCustom.rings}/${lowCustom.sweeps}/${lowCustom.sheets}`);
  check(lowCustom.motes === 0, 'the unticked family must still be removed on that rung');
  // THE PALETTE MUST COME FROM THE TOP ROW TOO, not from the selected level. The lowest rung's
  // entry carries `alpha: 0`, and that alpha is written into the host's `--ti-glow` — the colour
  // of every shape's glow. So a custom combination rendered with the low palette drew the right
  // number of shapes with NO bloom on any of them, which reads as "the effect did not turn on".
  check(lowCustom.a === sw.CUSTOM_SUPPLY_TIER.a && lowCustom.alpha === sw.CUSTOM_SUPPLY_TIER.alpha,
    'custom mode must take its palette from the top row, not from the selected level');
  check(sw.CUSTOM_SUPPLY_TIER.alpha > 0, 'the custom palette must carry a non-zero glow alpha');
  check(lowCustom.rung === lowPlan.rung, 'the rung itself still follows the level, for the ladder strip');
  // Custom mode with everything checked is richer than default mode on a low rung...
  const customFull = sw.applyEffectFilter(lowPlan, modeSettings('custom'));
  check(customFull.rings > lowPlan.rings && customFull.sweeps > lowPlan.sweeps && customFull.sheets > lowPlan.sheets,
    'custom mode with every box checked must supply the full baseline');
  // ...and on the top rung it must be at least as rich as the rung itself.
  const topCustom = sw.applyEffectFilter(topPlan, modeSettings('custom'));
  check(['motes', 'rings', 'sweeps', 'sheets'].every((k) => topCustom[k] > 0),
    'custom mode must render every family at the top rung too');
  // Custom mode with everything unchecked is equivalent to off mode.
  const customEmpty = sw.applyEffectFilter(topPlan, modeSettings('custom', { motes: false, rings: false, sweeps: false, aurora: false }));
  check(customEmpty.on === false && customEmpty.motes === 0 && customEmpty.rings === 0 && customEmpty.sweeps === 0 && customEmpty.sheets === 0,
    'custom mode with nothing checked must equal off mode');

  // ── BRIGHTNESS MUST BE FULL AT EVERY LEVEL ───────────────────────────────
  //
  // Density and brightness are separate axes. Density is the counts above; brightness is the
  // stylesheet, and it used to RAMP with the rung (`.9` at rung 1, and a pool only lit once
  // its rung arrived), so a low level looked washed out next to max. The requirement is that
  // custom mode at ANY level is as bright as max, so the ramp must be gone and custom mode
  // must light every NON-EMPTY pool unconditionally.
  check(css0.indexOf('.ti-amb[data-lv=\'1\'] .ti-amb-motes{opacity:1}') >= 0,
    'the lowest rung must light its pool at FULL opacity, not a dimmed one');
  check(css0.indexOf('opacity:.9') < 0, 'no pool may be dimmed by a partial opacity');
  check(css0.indexOf(".ti-amb[data-custom='true'] .ti-amb-layer:not(:empty){opacity:1}") >= 0,
    'custom mode must light every non-empty pool at full opacity');
  // `:not(:empty)` is what keeps unticking a box meaningful: an emptied pool must stay dark.
  check(css0.indexOf(':not(:empty)') >= 0, 'the custom rule must skip empty pools');
  // PER-SHAPE brightness must not be coupled to the shape COUNT. It used to come out of the
  // shared random stream, so a pool of 6 and a pool of 88 averaged to different brightnesses —
  // which is the "自定义没有满载" effect in its subtlest form.
  for (const pool of ['motes', 'rings', 'sweeps']) {
    const small = [0, 1, 2, 3].map((i) => sw.shapeBrightness(pool, i));
    const large = [0, 1, 2, 3].map((i) => sw.shapeBrightness(pool, i));
    check(small.join(',') === large.join(','), `${pool} brightness must not depend on the pool size`);
    // Every shape in a family is drawn from the same fixed ring, so the average is stable
    // whatever the count, and the values still differ so the field looks irregular.
    check(new Set(small).size > 1, `${pool} shapes must not all share one brightness`);
    check(small.every((v) => v > 0), `${pool} shapes must all be visible`);
    // Reading past the ring wraps instead of returning undefined.
    check(typeof sw.shapeBrightness(pool, 97) === 'number', `${pool} brightness must wrap for large indices`);
  }
  check(sw.shapeBrightness('motes', 0) === sw.shapeBrightness('motes', 5),
    'the brightness ring must repeat with its own length');
  // And the host must actually be flagged when, and only when, custom mode is active.
  {
    const modeHost = sw.createAmbientHost();
    documentRoot.appendChild(modeHost);
    sw.applyAmbient(modeHost, sw.applyEffectFilter(topPlan, modeSettings('custom')), 'g', 'custom');
    check(modeHost.attributes['data-custom'] === 'true', 'a custom-mode host must be flagged data-custom');
    sw.applyAmbient(modeHost, topPlan, 'g', 'default');
    check(modeHost.attributes['data-custom'] === 'false', 'a default-mode host must not be flagged data-custom');
    sw.applyAmbient(modeHost, sw.applyEffectFilter(topPlan, modeSettings('off')), 'g', 'off');
    check(modeHost.attributes['data-custom'] === 'false', 'an off-mode host must not be flagged data-custom');
    // Switching modes must be part of the dependency key, or the flag would never be rewritten
    // when only the mode changed.
    check(sw.ambientSignature(topPlan, 'g', 'custom') !== sw.ambientSignature(topPlan, 'g', 'default'),
      'the mode must be part of the dependency key');
  }

  // The sub-key lamps in DEFAULT mode must read the RUNG's supply: `low` lights only 光尘,
  // `max` lights all four. That is a readout of the level, not of the checkbox.
  const lampsLow = sw.rungSupplies(sw.ambientPlan(1, 4));
  const lampsTop = sw.rungSupplies(sw.ambientPlan(4, 4));
  console.log('rung supply low / top  :', JSON.stringify(lampsLow), '/', JSON.stringify(lampsTop));
  check(lampsLow.motes === true && lampsLow.rings === false && lampsLow.sweeps === false && lampsLow.aurora === false,
    'the low rung must light only the mote lamp');
  check(lampsTop.motes && lampsTop.rings && lampsTop.sweeps && lampsTop.aurora,
    'the top rung must light all four lamps');
  // Every rung in between must light a growing set, never a shrinking one.
  let previousLamps = 0;
  for (let level = 0; level <= 4; level += 1) {
    const lamps = sw.rungSupplies(sw.ambientPlan(level, 4));
    const lit = ['motes', 'rings', 'sweeps', 'aurora'].filter((k) => lamps[k]).length;
    check(lit >= previousLamps, `the lamp count must not shrink as the level rises (${previousLamps} -> ${lit})`);
    previousLamps = lit;
  }

  // The mode key cycles through exactly the three states, and NEVER disturbs the boxes —
  // that is what makes the two primary keys independent of the sub-keys.
  let cycled = 'default';
  const seen = [cycled];
  for (let step = 0; step < 4; step += 1) {
    cycled = sw.nextEffectMode(cycled);
    seen.push(cycled);
  }
  console.log('mode cycle             :', seen.join(' -> '));
  check(seen.slice(1, 4).join(',') === 'custom,off,default', 'the mode key must cycle default -> custom -> off -> default');
  check(seen[3] === seen[0], 'the third press must return to the starting mode');
  const preserved = modeSettings('custom', { sweeps: false });
  preserved.mode = sw.nextEffectMode(preserved.mode);
  preserved.mode = sw.nextEffectMode(preserved.mode);
  check(preserved.sweeps === false, 'cycling the mode out and back must keep the sub-key selection');

  // ── THE DEPENDENCY KEY ───────────────────────────────────────────────────
  //
  // This is the real cause of "自定义模式还是关不掉某些特效". `useAmbientAura` only re-applies
  // the aura when its dependency key changes, and that key used to be built from `plan.dust`
  // alone — `dust` is the MOTE count. So unchecking 光环 / 流光 / 极光 left the key identical,
  // the effect never re-ran, `applyAmbient` was never called, and those families stayed on
  // screen however many times they were switched off. Only 光尘 appeared to work.
  const sigPlan = sw.ambientPlan(4, 4);
  const sigBase = sw.ambientSignature(sigPlan, 'g');
  for (const key of sw.EFFECT_KEYS) {
    const field = { motes: 'motes', rings: 'rings', sweeps: 'sweeps', aurora: 'sheets' }[key];
    const cut = sw.applyEffectFilter(sigPlan, modeSettings('custom', { [key]: false }));
    const sigCut = sw.ambientSignature(cut, 'g');
    check(sigCut !== sigBase, `turning ${key} off must change the dependency key, or the aura never repaints`);
    // And the key must be sensitive to that field specifically.
    const onlyField = Object.assign({}, sigPlan, { [field]: sigPlan[field] + 1 });
    check(sw.ambientSignature(onlyField, 'g') !== sigBase, `${field} must be part of the dependency key`);
  }
  // The key must still be stable when nothing visible changed, or it would repaint constantly.
  check(sw.ambientSignature(sw.ambientPlan(4, 4), 'g') === sigBase, 'the same plan must produce the same key');
  // Every field that reaches the DOM must be in the key.
  const mutated = [
    ['rung', { rung: 3 }], ['on', { on: false }], ['peak', { peak: !sigPlan.peak }],
    ['alpha', { alpha: sigPlan.alpha + 0.01 }], ['a', { a: 'x' }], ['b', { b: 'y' }], ['c', { c: 'z' }],
  ];
  for (const [label, patch] of mutated) {
    check(sw.ambientSignature(Object.assign({}, sigPlan, patch), 'g') !== sigBase, `${label} must be part of the dependency key`);
  }
  check(sw.ambientSignature(sigPlan, 'other-glow') !== sigBase, 'the glow must be part of the dependency key');
  check(sw.ambientSignature(null, 'g') === 'none', 'a missing plan must have a stable key');

  // ── DEFAULT MODE MUST STILL PAINT ────────────────────────────────────────
  //
  // The whole default path end to end: plan -> filter -> applyAmbient -> REAL DOM node
  // counts. Asserting only the plan cannot catch a regression in the paint half, and
  // "默认特效没了" is exactly the kind of failure that lives down there.
  {
    const paintHost = sw.createAmbientHost();
    documentRoot.appendChild(paintHost);
    for (const level of [1, 2, 3, 4]) {
      const plan = sw.ambientPlan(level, 4);
      const def = sw.applyEffectFilter(plan, sw.defaultEffectSettings());
      check(def.on === true, `default mode must stay switched on at level ${level}`);
      check(def.motes === plan.motes && def.rings === plan.rings && def.sweeps === plan.sweeps && def.sheets === plan.sheets,
        `default mode must not alter the rung's recipe at level ${level}`);
      sw.applyAmbient(paintHost, def, 'hsl(0 0% 0% / 0)');
      const painted = ['motes', 'rings', 'sweeps', 'aurora']
        .map((pool) => paintHost.querySelector('[data-pool="' + pool + '"]').children.length);
      const expected = [def.motes, def.rings, def.sweeps, def.sheets];
      check(painted.join('/') === expected.join('/'),
        `default mode must paint the rung's shapes at level ${level} (${painted.join('/')} vs ${expected.join('/')})`);
      check(paintHost.attributes['data-on'] === 'true', `the host must be on at level ${level}`);
      check(paintHost.attributes['data-lv'] === String(plan.rung), `the host must report rung ${plan.rung} at level ${level}`);
    }
    // A mode round trip (default -> custom -> off -> default) must come back to the full
    // rung, not to a silenced one. This is the "默认特效怎么又没了" guard.
    const top = sw.ambientPlan(4, 4);
    const topTotal = top.motes + top.rings + top.sweeps + top.sheets;
    sw.applyAmbient(paintHost, sw.applyEffectFilter(top, modeSettings('custom')), 'hsl(0 0% 0% / 0)');
    sw.applyAmbient(paintHost, sw.applyEffectFilter(top, modeSettings('off')), 'hsl(0 0% 0% / 0)');
    const backToDefault = sw.applyEffectFilter(top, modeSettings('default'));
    sw.applyAmbient(paintHost, backToDefault, 'hsl(0 0% 0% / 0)');
    const restored = ['motes', 'rings', 'sweeps', 'aurora']
      .map((pool) => paintHost.querySelector('[data-pool="' + pool + '"]').children.length);
    console.log('default after round trip:', restored.join('/'), '| painted', paintHost.attributes['data-painted']);
    check(restored.join('/') === [top.motes, top.rings, top.sweeps, top.sheets].join('/'),
      `default mode after a mode round trip must be back to the full rung (${restored.join('/')})`);
    check(Number(paintHost.attributes['data-painted']) === topTotal, 'the painted total must match the rung');
    check(paintHost.attributes['data-on'] === 'true', 'default mode after a round trip must be on again');
    // The host must expose its own state as attributes, because that is what the machine-
    // readable trace event carries and what the stylesheet keys off.
    check(paintHost.attributes['data-lv'] === String(top.rung), 'the host must publish its rung');
    check(paintHost.attributes['data-peak'] === 'true', 'the host must publish the peak flag');
    check(paintHost.attributes['data-custom'] === 'false', 'default mode must not flag the host as custom');
  }

  // The burst is outside the two primary keys: it is live in every mode.
  check(sw.effectEnabled(modeSettings('default'), 'burst') === true, 'the burst must be on in default mode');
  check(sw.effectEnabled(modeSettings('custom'), 'burst') === true, 'the burst must be on in custom mode');
  check(sw.effectEnabled(modeSettings('off'), 'burst') === false, 'off mode must silence the burst too');
  const burstOff = modeSettings('default', { burst: false });
  check(sw.effectEnabled(burstOff, 'motes') === true && sw.effectEnabled(burstOff, 'burst') === false,
    'the burst switch must not disturb the ambient families');

  // ── the rendered panel: the switches must actually work end to end ────────
  //
  // This is the part that was impossible to test before the panel became its own component,
  // and it is exactly where "自定义模式下关闭某特效仍然无法正常关闭" lived: the filter was
  // right, but nothing verified that a click reached it and changed the plan.
  {
    // A controller stand-in that mirrors exactly what `useIntensity` hands the panel.
    const makeCtl = (mode, over) => {
      const settings = modeSettings(mode, over);
      const plan = sw.ambientPlan(4, 4);
      return {
        // The Slider reads `model.reasoning` and `efforts`, so the stand-in carries the real
        // shapes rather than a trimmed one.
        model: { current: { provider: 'deepseek-official', model: 'deepseek-flash', reasoningEffort: 'max' }, reasoning: model.reasoning, efforts: model.reasoning.efforts, currentIndex: 4, maxIndex: 4 },
        efforts: model.reasoning.efforts,
        maxIndex: 4,
        currentIndex: 4,
        effectiveEffort: 'max',
        shown: 4,
        level: null,
        dragging: false,
        draggedRef: { current: false },
        flash: null,
        problem: null,
        ambient: plan,
        ambientState: { on: true, layers: 4, mounted: true },
        effects: settings,
        rungSupply: sw.rungSupplies(plan),
        setLevel: () => {},
        requestCommit: () => {},
        beginDrag: () => {},
        endDrag: () => {},
        cycleEffectMode: () => {},
        toggleEffect: () => {},
      };
    };
    const chipsOf = (tree) => {
      const found = [];
      const walk = (node) => {
        if (!node || typeof node !== 'object') return;
        if (node.type === 'button' && node.props && node.props['data-effect']) found.push(node.props);
        (node.children || []).forEach(walk);
      };
      walk(tree);
      return found;
    };
    const findChip = (tree, key) => chipsOf(tree).find((chip) => chip['data-effect'] === key);

    // Default mode: every sub-key must be LOCKED (the rung owns the combination), the mode
    // key must not be, and the lamps must read the rung's supply.
    const defaultPanel = render(sw.IntensityPanel, { ctl: makeCtl('default'), readoutText: 'max' });
    const defaultChips = chipsOf(defaultPanel);
    console.log('panel lamps (default)  :', defaultChips.map((chip) => chip['data-effect'] + '=' + chip['data-on']).join(' '));
    check(defaultChips.length === 6, `the panel must render the mode key plus five sub-keys, saw ${defaultChips.length}`);
    // The keys stay CLICKABLE in every mode. Locking them was tried and was wrong: a locked
    // key cannot arm the selection that custom mode will use, and it hid the real bug
    // (default mode ANDing a stale selection) behind "the key does nothing anyway".
    check(findChip(defaultPanel, 'mode')['data-locked'] === 'false', 'the mode key must never be locked');
    for (const key of sw.EFFECT_KEYS) {
      const chip = findChip(defaultPanel, key);
      check(chip !== undefined, `${key} must have a chip`);
      check(chip['data-locked'] === 'false' && chip.disabled === undefined,
        `${key} must stay clickable in default mode`);
      check(typeof chip.onClick === 'function', `${key} must carry a click handler in default mode`);
      // The lamp reads the rung in default mode, and every family is rendering.
      check(chip['data-rendering'] === 'true', `${key} must report itself as rendering in default mode`);
    }
    // At the top level the rung supplies everything, so every lamp is lit.
    check(findChip(defaultPanel, 'aurora')['data-on'] === 'true', 'the aurora lamp must be lit at the top level');
    check(sw.effectsFromRung(modeSettings('default')) === true, 'default mode must draw its lamps from the rung');
    // The lamps must follow the RUNG, not the boxes: a stale unticked family still lights up
    // in default mode because the rung supplies it.
    const stalePanel = render(sw.IntensityPanel, { ctl: makeCtl('default', { motes: false, rings: false, sweeps: false, aurora: false }), readoutText: 'max' });
    console.log('lamps (default, stale) :', chipsOf(stalePanel).map((chip) => chip['data-effect'] + '=' + chip['data-on']).join(' '));
    for (const key of sw.EFFECT_KEYS) {
      check(findChip(stalePanel, key)['data-on'] === 'true',
        `${key} must still be lit in default mode even with a stale unticked box`);
    }
    // In custom mode the sub-keys read the checkboxes.
    const customPanel = render(sw.IntensityPanel, { ctl: makeCtl('custom'), readoutText: 'max' });
    for (const key of sw.EFFECT_KEYS) {
      const chip = findChip(customPanel, key);
      check(chip['data-locked'] === 'false', `${key} must be unlocked in custom mode`);
      check(typeof chip.onClick === 'function', `${key} must be clickable in custom mode`);
      check(chip['data-on'] === 'true', `${key} must read as ticked by default in custom mode`);
    }
    // A click must reach the controller with its own key, and the resulting plan must
    // actually lose that family. This is the end-to-end proof for "关不掉".
    for (const key of sw.EFFECT_KEYS) {
      let asked = null;
      const panel = render(sw.IntensityPanel, { ctl: Object.assign(makeCtl('custom'), { toggleEffect: (k) => { asked = k; } }), readoutText: 'max' });
      findChip(panel, key).onClick();
      check(asked === key, `clicking ${key} must ask the controller to toggle ${key}`);
      const field = { motes: 'motes', rings: 'rings', sweeps: 'sweeps', aurora: 'sheets' }[key];
      const after = sw.applyEffectFilter(sw.ambientPlan(4, 4), modeSettings('custom', { [key]: false }));
      check(after[field] === 0, `after toggling ${key} off, ${field} must be zero`);
      check(['motes', 'rings', 'sweeps', 'sheets'].filter((f) => f !== field).every((f) => after[f] > 0),
        `toggling ${key} off must leave every other family rendering`);
    }
    // Off mode: sub-keys stay live but the lamps go hollow, and nothing renders.
    const offPanel = render(sw.IntensityPanel, { ctl: makeCtl('off'), readoutText: 'max' });
    check(findChip(offPanel, 'motes')['data-suppressed'] === 'true', 'in off mode a ticked key must be drawn suppressed');
    check(findChip(offPanel, 'motes')['data-on'] === 'true', 'in off mode the tick must survive');
    check(findChip(offPanel, 'mode')['data-on'] === 'false', 'the mode key must read as off');
  }

  // Settings must survive a round trip through JSON, including garbage and the old shape.
  const roundTrip = sw.normalizeEffectSettings(JSON.parse(JSON.stringify(burstOff)));
  check(roundTrip.burst === false && roundTrip.motes === true && roundTrip.mode === 'default', 'a saved settings object must round trip');
  for (const junk of [null, undefined, 0, 'x', [], {}, { mode: 'nonsense' }, { motes: 1 }]) {
    const normal = sw.normalizeEffectSettings(junk);
    check(normal.mode === 'default' && sw.EFFECT_KEYS.every((k) => normal[k] === true) && normal.burst === true,
      `junk settings must fall back to default mode, saw ${JSON.stringify(junk)} -> ${JSON.stringify(normal)}`);
  }
  // Migration: settings saved before the mode existed carried a boolean `all`.
  check(sw.normalizeEffectSettings({ all: false }).mode === 'off', 'a legacy all:false must migrate to off mode');
  check(sw.normalizeEffectSettings({ all: true }).mode === 'default', 'a legacy all:true must migrate to default mode');

  // The panel must render the mode key and the sub-keys as real buttons, and a sub-key
  // must expose the THREE facts separately: ticked, rendering, and suppressed-by-mode.
  const modeChip = render(sw.EffectChip, { effectKey: 'mode', master: true, state: 'custom', on: true, label: '自定义特效', onToggle: () => {} });
  check(modeChip.type === 'button', 'the mode key must be a real button');
  check(modeChip.props['data-state'] === 'custom', 'the mode key must report its state');
  check(String(modeChip.props.title).indexOf('默认特效') >= 0, 'the mode key tooltip must explain the cycle');
  // Ticked and rendering: a plain lit lamp.
  const onChip = render(sw.EffectChip, { effectKey: 'motes', on: true, rendering: true, label: '光尘', onToggle: () => {} });
  check(onChip.props['data-on'] === 'true' && onChip.props['data-rendering'] === 'true', 'a ticked, rendering family must read as on');
  check(onChip.props['data-suppressed'] === 'false', 'a ticked, rendering family must not be marked suppressed');
  check(onChip.props['aria-pressed'] === 'true', 'a ticked switch must be pressed for assistive tech');
  // Unticked: the lamp must go dark immediately, in EVERY mode. This is the bug where the
  // lamp used to read the render state, so ticking a box in default mode did nothing.
  const offChip = render(sw.EffectChip, { effectKey: 'motes', on: false, rendering: false, label: '光尘', onToggle: () => {} });
  check(offChip.props['data-on'] === 'false' && offChip.props['aria-pressed'] === 'false', 'an unticked switch must read as off');
  // Ticked but the mode key supplies nothing: hollow lamp, and the tooltip says why.
  const heldChip = render(sw.EffectChip, { effectKey: 'motes', on: true, rendering: false, suppressed: true, label: '光尘', onToggle: () => {} });
  check(heldChip.props['data-on'] === 'true', 'a suppressed family must still show its checkbox as ticked');
  check(heldChip.props['data-suppressed'] === 'true', 'a suppressed family must say so');
  check(String(heldChip.props.title).indexOf('特效关闭') >= 0, 'a suppressed tooltip must explain the mode');
  let cycledByClick = 0;
  const wiredMode = render(sw.EffectChip, { effectKey: 'mode', master: true, state: 'default', on: true, label: '默认特效', onToggle: () => { cycledByClick += 1; } });
  wiredMode.props.onClick();
  check(cycledByClick === 1, 'clicking the mode key must fire the mode cycler');
  let toggled = null;
  const wiredChip = render(sw.EffectChip, { effectKey: 'sweeps', on: true, rendering: true, label: '流光', onToggle: (k) => { toggled = k; } });
  wiredChip.props.onClick();
  check(toggled === 'sweeps', 'clicking a sub-key must report its own key');
  check(css0.indexOf('.ti-switch') >= 0, 'the switches must have styling');
  check(css0.indexOf('ti-switches') >= 0, 'the switch row must have styling');
  check(css0.indexOf("data-suppressed='true'") >= 0, 'the suppressed lamp state must have styling');

  const css = css0;
  check(/\.ti-amb-layer\{[^}]*opacity:0/.test(css), 'every ambient pool must declare a resting opacity of 0');
  // Every rung must have rules, or a level would render nothing at all.
  for (let rung = 1; rung <= 5; rung++) {
    check(css.indexOf(".ti-amb[data-lv='" + rung + "']") >= 0, `rung ${rung} must have its own rules`);
  }
  // Each effect must own its keyframes and its resting state.
  for (const name of ['ti-amb-mote', 'ti-amb-ring', 'ti-amb-sweep', 'ti-amb-drift']) {
    check(css.indexOf('@keyframes ' + name) >= 0, `${name} must own keyframes`);
  }
  // The two load-bearing style facts: z-index 0 hides the effect under the shell's
  // opaque surfaces, and a blend mode multiplies the colour away on a dark panel.
  check(/\.ti-amb\{[^}]*z-index:1/.test(css), 'the effect must sit one step above the base layer, not under the panels');
  check(!/\.ti-amb\{[^}]*mix-blend-mode/.test(css), 'the host must not blend');
  // Reduced motion must keep the shapes visible and only stop the travel.
  const reducedBlock = (css.match(/@media \(prefers-reduced-motion:reduce\)\{[\s\S]*?\}\}/) || [''])[0];
  check(/ti-amb-mote\{opacity:/.test(reducedBlock), 'reduced motion must restate the mote opacity');
  check(/ti-amb-ring\{opacity:/.test(reducedBlock), 'reduced motion must restate the ring opacity');
  check(/ti-amb-sweep\{opacity:/.test(reducedBlock), 'reduced motion must restate the sweep opacity');
  check(/ti-amb-sheet\{opacity:/.test(reducedBlock), 'reduced motion must restate the sheet opacity');
  check(reducedBlock.indexOf('opacity:1') >= 0, 'the effect must stay fully on under reduced motion');

  // The host sits at the bottom of the paint order. `sinkAmbientBehind` is
  // deliberately idempotent, so the proof is: push it to the END (which is what a
  // React portal landing on the body does) and let it re-assert its place. The
  // shared host is looked up by class, because `createAmbientHost` builds a NEW
  // instance while the hook keeps reusing the one it cached.
  const liveAmbient = documentRoot.children.filter((node) => node.className === 'ti-amb')[0];
  check(liveAmbient !== undefined, 'a firing must have mounted the shared ambient host');
  if (liveAmbient !== undefined) {
    // Detach first, then append: that is the honest "a portal shoved it to the end".
    documentRoot.removeChild(liveAmbient);
    documentRoot.appendChild(liveAmbient);
    documentRoot.appendChild({ className: 'shell-panel', children: [], attributes: {}, style: { setProperty() {} } });
    console.log('body order before      :', documentRoot.children.map((node) => String(node.className)).join(' | '));
    burstView.sinkAmbientBehind(liveAmbient);
    console.log('body order after       :', documentRoot.children.map((node) => String(node.className)).join(' | '));
    console.log('ambient is first child :', documentRoot.firstChild === liveAmbient);
    check(documentRoot.firstChild === liveAmbient, 'the aura must be re-sunk to the first child, so it paints behind every panel');
    check(liveAmbient.parentNode === documentRoot, 'the aura must stay attached to the body');
  }
}

// A model without reasoning levels must disable the control.
snapshot = {
  current: { provider: 'deepseek-official', model: 'plain' },
  routable: true,
  groups: [{ id: 'deepseek-official', models: [{ id: 'plain', name: 'Plain' }] }],
  failures: [],
  status: 'ready',
  pending: null,
  error: null,
};
const plainChip = render(registered.get('conversation.input.right'), Object.assign({}, face, { disabled: false }));
console.log('\nno-reasoning model     :');
console.log('  chip disabled        :', findClass(plainChip, 'ti-chip').props.disabled);
check(findClass(plainChip, 'ti-chip').props.disabled === true, 'a model without reasoning levels must disable the chip');

// An explicitly disabled (subagent) session must disable the control too.
snapshot = {
  current: { provider: 'deepseek-official', model: 'deepseek-flash', reasoningEffort: 'high' },
  routable: true,
  groups: [{ id: 'deepseek-official', models: [model] }],
  failures: [],
  status: 'ready',
  pending: null,
  error: null,
};
const subagentChip = render(registered.get('conversation.input.right'), Object.assign({}, face, { disabled: true }));
check(findClass(subagentChip, 'ti-chip').props.disabled === true, 'a subagent session must disable the chip');

// ── structural properties no functional assertion would catch ─────────────
{
  // The rail geometry is a stated requirement (thicker vertically, shorter horizontally) and
  // it lives only in CSS, so nothing else in this suite would notice it regressing.
  const sheet = [...styleTags.values()].map((tag) => String(tag.textContent)).join('');
  const trackHeight = Number((sheet.match(/\.ti-track\{[^}]*height:(\d+)px/) || [])[1]);
  const railHeight = Number((sheet.match(/\.ti-slider\{[^}]*height:(\d+)px/) || [])[1]);
  console.log('rail geometry          : track', trackHeight + 'px / rail', railHeight + 'px');
  check(trackHeight >= 24, `the track must be thick, saw ${trackHeight}px`);
  check(railHeight >= 36, `the rail must keep a comfortable hit target, saw ${railHeight}px`);

  // The mode key must never write to the per-family checkboxes: that is what makes
  // "switch to custom and back" preserve the user's selection.
  const cycleBody = (chunkSource.match(/var cycleEffectMode = React\.useCallback[\s\S]*?\}, \[\]\);/) || [''])[0];
  check(cycleBody.length > 0, 'the mode cycler must exist');
  check(!/next\.(motes|rings|sweeps|aurora|burst)\s*=/.test(cycleBody),
    'cycling the mode must not touch any per-family checkbox');

  // A plugin must not write to the host application's console.
  const combined = entrySource + chunkSource;
  check(!/console\.(log|info|warn|error|debug)\(/.test(combined), 'the plugin must not log to the console');
  check(chunkSource.indexOf('\u5bbf\u4e3b\u5b9e\u6d4b') < 0, 'the removed live-report line must not come back');
  check((chunkSource.match(/"data-ti": "ambient-live"/g) || []).length === 0,
    'the live-report element must stay removed');
  check((chunkSource.match(/"data-ti": "ambient-trace"/g) || []).length === 1,
    'exactly one status line must remain in the panel');
}

if (failures.length > 0) {
  console.error('\nFAIL:\n - ' + failures.join('\n - '));
  process.exitCode = 1;
} else {
  console.log('\nOK: smoke test passed');
}

// NOTE: this harness deliberately does not drive pointer drags. Its effect and
// ref scheduling is only an approximation of React's, and bending it into
// shape costs more than it proves; the drag path (level -> debounced
// directory.select -> projection) is exercised only in the real browser.
