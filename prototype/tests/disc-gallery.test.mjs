import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setMaxListeners } from 'node:events';
import * as motion from '../disc-motion.mjs';
import * as THREE from '../vendor/three.module.js';
import { discPose } from '../disc-gallery.js';

function project(offset) {
    const camera = new THREE.PerspectiveCamera(40, 1440 / 800, .1, 40);
    camera.position.z = 4.4;
    camera.updateMatrixWorld();
    const gallery = new THREE.Group();
    gallery.rotation.set(-Math.PI / 6, -Math.PI / 6, 0);
    gallery.scale.setScalar(1.08);
    const disc = new THREE.Object3D();
    const pose = discPose(offset + 2, 2);
    disc.position.set(pose.x, pose.y, pose.z);
    disc.rotation.y = pose.rotationY;
    disc.scale.setScalar(pose.scale);
    gallery.add(disc);
    gallery.updateMatrixWorld(true);
    const points = Array.from({ length: 128 }, (_, i) => disc.localToWorld(new THREE.Vector3(Math.cos(i * Math.PI / 64), Math.sin(i * Math.PI / 64), 0)).project(camera));
    const xs = points.map(p => (p.x + 1) * 720);
    const ys = points.map(p => (1 - p.y) * 400);
    const center = disc.getWorldPosition(new THREE.Vector3()).project(camera);
    return { width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys), x: (center.x + 1) * 720, y: (1 - center.y) * 400 };
}

test('current disc is upright locally, without the old double X tilt', () => {
    const pose = discPose(2, 2);
    assert.equal(pose.x, 0);
    assert.equal(pose.z, 0);
    assert.equal(Math.abs(pose.rotationY), 0);
    assert.equal(pose.scale, 1);
    assert.equal(pose.rotationX, undefined);
});

test('arc placement changes continuously with the current index', () => {
    const a = discPose(3, 2.01);
    const b = discPose(3, 2.02);
    assert.ok(Math.abs(a.x - b.x) < .03);
    assert.ok(Math.abs(a.z - b.z) < .02);
});

test('perspective creates a rising depth sequence, not manual size steps', () => {
    const behind = project(-1);
    const active = project(0);
    const next = project(1);
    assert.ok(behind.x < active.x && active.x < next.x);
    assert.ok(behind.y > active.y && active.y > next.y);
    assert.ok(next.width > active.width);
});

test('1440 × 800 active disc has near-upright reference proportions', () => {
    const { width, height, x, y } = project(0);
    assert.ok(width > 400 && width < 540, `width ${width}`);
    assert.ok(height > 420 && height < 600, `height ${height}`);
    assert.ok(width / height > .85 && width / height < 1.1);
    assert.ok(Math.abs(x - 720) < 30 && Math.abs(y - 400) < 35);
});

test('mobile pose keeps current disc central and all adjacent works addressable', () => {
    for (let current = 0; current < 6; current += 1) {
        assert.equal(discPose(current, current, true).x, 0);
        assert.ok(discPose(current + 1, current, true).x > 0);
        assert.ok(discPose(current - 1, current, true).x < 0);
    }
});

test('arc lift has no half-index jump and keeps the original integer resting poses', () => {
    assert.equal(discPose(2, 2).y, .06);
    assert.equal(discPose(3, 2).y, 0);
    assert.ok(Math.abs(discPose(3, 2.4999).y - discPose(3, 2.5001).y) < .000001);
    assert.deepEqual(discPose(12, 12), discPose(2, 2));
});

// Exercise the real gallery/controller and real Three geometry/raycasting in Node.
// Only DOM, RAF, PMREM and the GPU renderer are replaced. No production test hook
// or public API is needed, and these assertions do not pretend to verify pixels.
const source = readFileSync(new URL('../disc-gallery.js', import.meta.url), 'utf8')
    .replace(/^import \* as THREE from [^\n]+\n/, '')
    .replace(/import \{([\s\S]*?)\} from '\.\/disc-motion\.mjs[^']*';/, 'const {$1} = motion;')
    .replaceAll('export function ', 'function ');
const createModule = new Function('environment', `
    const { THREE, motion, document, window, matchMedia, devicePixelRatio, ResizeObserver,
        IntersectionObserver, requestAnimationFrame, cancelAnimationFrame, performance, Image } = environment;
    ${source}
    return { mountDiscGallery };
`);

class FakeTarget {
    listeners = new Map();
    addEventListener(type, listener, options = {}) {
        if (options.signal?.aborted) return;
        if (!this.listeners.has(type)) this.listeners.set(type, new Set());
        this.listeners.get(type).add(listener);
        if (options.signal) {
            setMaxListeners(0, options.signal);
            options.signal.addEventListener('abort', () => this.listeners.get(type)?.delete(listener), { once: true });
        }
    }
    emit(type, properties = {}) {
        const event = { type, target: this, preventDefault() { this.defaultPrevented = true; }, ...properties };
        for (const listener of [...(this.listeners.get(type) || [])]) listener(event);
        return event;
    }
    listenerCount() { return [...this.listeners.values()].reduce((count, values) => count + values.size, 0); }
}

class FakeElement extends FakeTarget {
    attributes = new Map();
    style = {};
    children = [];
    captured = new Set();
    parentNode = null;
    clientWidth = 1440;
    clientHeight = 800;
    constructor() {
        super();
        const attribute = name => `data-${name.replace(/[A-Z]/g, value => `-${value.toLowerCase()}`)}`;
        this.dataset = new Proxy({}, {
            get: (_, name) => this.attributes.get(attribute(name)),
            set: (_, name, value) => { this.attributes.set(attribute(name), String(value)); return true; },
        });
    }
    setAttribute(name, value) { this.attributes.set(name, String(value)); }
    getAttribute(name) { return this.attributes.get(name) ?? null; }
    removeAttribute(name) { this.attributes.delete(name); }
    set tabIndex(value) { this.setAttribute('tabindex', value); }
    replaceChildren(...children) {
        this.children.forEach(child => { child.parentNode = null; });
        this.children = children;
        children.forEach(child => { child.parentNode = this; });
    }
    remove() {
        if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(child => child !== this);
        this.parentNode = null;
    }
    getBoundingClientRect() {
        return { left: 0, top: 0, width: this.parentNode?.clientWidth || this.clientWidth, height: this.parentNode?.clientHeight || this.clientHeight };
    }
    focus() { this.focused = true; }
    setPointerCapture(id) { this.captured.add(id); }
    hasPointerCapture(id) { return this.captured.has(id); }
    releasePointerCapture(id) { this.captured.delete(id); this.emit('lostpointercapture', { pointerId: id }); }
}

class FakeCanvas extends FakeElement {
    context = new Proxy({ createRadialGradient: () => ({ addColorStop() {} }) }, {
        get(target, property) { return target[property] ?? (() => {}); },
    });
    getContext() { return this.context; }
    toDataURL() { return 'data:image/png;base64,disc-artwork'; }
}

function harness(t, { width = 1440, reducedMotion, failEnvironment = false, customSelect } = {}) {
    let time = 0;
    let nextFrame = 0;
    let api;
    const frames = new Map();
    const resources = [];
    const images = [];
    const renderers = [];
    const observers = [];
    const metadata = [];
    const selections = [];
    const errors = [];
    const document = Object.assign(new FakeTarget(), { hidden: false, createElement: () => new FakeCanvas() });
    const window = new FakeTarget();
    const media = Object.assign(new FakeTarget(), { matches: false });
    const container = new FakeElement();
    container.clientWidth = width;
    container.setAttribute('aria-label', 'Original accessible title');
    const track = object => { object.disposeCount = 0; object.addEventListener('dispose', () => { object.disposeCount += 1; }); resources.push(object); return object; };
    const Three = { ...THREE };
    for (const name of ['RingGeometry', 'CylinderGeometry', 'PlaneGeometry', 'BufferGeometry', 'MeshBasicMaterial', 'MeshStandardMaterial', 'MeshPhysicalMaterial', 'LineBasicMaterial', 'CanvasTexture']) {
        Three[name] = class extends THREE[name] { constructor(...args) { super(...args); track(this); } };
    }
    Three.WebGLRenderer = class {
        domElement = new FakeCanvas();
        capabilities = { getMaxAnisotropy: () => 8 };
        renderCount = 0;
        disposed = 0;
        lost = 0;
        constructor() { renderers.push(this); }
        setPixelRatio() {}
        setClearColor() {}
        setSize() {}
        render(scene, camera) { this.scene = scene; this.camera = camera; this.renderCount += 1; scene.updateMatrixWorld(true); camera.updateMatrixWorld(true); }
        dispose() { this.disposed += 1; }
        forceContextLoss() { this.lost += 1; this.domElement.emit('webglcontextlost'); }
    };
    Three.PMREMGenerator = class {
        constructor() { this.disposed = 0; }
        fromScene() {
            if (failEnvironment) throw new Error('Environment setup failed');
            const texture = track(new THREE.Texture());
            return { texture, dispose() { texture.dispose(); } };
        }
        dispose() { this.disposed += 1; }
    };
    class Observer {
        constructor(callback) { this.callback = callback; observers.push(this); }
        observe(target) { this.target = target; }
        disconnect() { this.disconnected = true; }
    }
    class FakeImage extends FakeElement {
        constructor() { super(); images.push(this); }
        set src(value) { this.setAttribute('src', value); }
    }
    const module = createModule({
        THREE: Three, motion, document, window, matchMedia: () => media, devicePixelRatio: 1,
        ResizeObserver: Observer, IntersectionObserver: Observer, Image: FakeImage,
        requestAnimationFrame(callback) { frames.set(++nextFrame, callback); return nextFrame; },
        cancelAnimationFrame(id) { frames.delete(id); }, performance: { now: () => time },
    });
    const works = Array.from({ length: 6 }, (_, index) => ({ id: `work-${index}`, name: `Work ${index}`, author: 'Author', scene: `test-${index}.jpg` }));
    const mount = () => {
        api = module.mountDiscGallery(container, works, {
            reducedMotion, onHover: (work, index) => metadata.push(index),
            onSelect(work, rect) { selections.push({ work, rect }); customSelect?.(api, work, rect); },
            onError: error => errors.push(error),
        });
        return api;
    };
    function step(milliseconds = 1000 / 60) {
        time += milliseconds;
        for (const [id, callback] of [...frames]) {
            if (!frames.has(id)) continue;
            frames.delete(id);
            callback(time);
        }
    }
    function settle() {
        let count = 0;
        while (frames.size && count++ < 300) step();
        assert.equal(frames.size, 0, 'animation must release RAF once at rest');
        return count;
    }
    function point(index = 2, x = .55, y = .15) {
        const renderer = renderers[0];
        const disc = renderer.scene.children.find(object => object.isGroup).children[index];
        renderer.scene.updateMatrixWorld(true);
        const p = disc.localToWorld(new THREE.Vector3(x, y, .01)).project(renderer.camera);
        return { clientX: (p.x + 1) * container.clientWidth / 2, clientY: (1 - p.y) * container.clientHeight / 2, pointerId: 1, button: 0, isPrimary: true, pointerType: 'mouse' };
    }
    const result = {
        mount, container, document, window, media, resources, images, renderers, observers, frames, metadata, selections, errors, works, step, settle, point,
        get api() { return api; }, get canvas() { return renderers[0].domElement; },
        get discs() { return renderers[0].scene.children.find(object => object.isGroup).children; },
        key(key, extra = {}) { return container.emit('keydown', { key, ...extra }); },
        pointer(type, properties) { return renderers[0].domElement.emit(type, properties); },
        wheel(delta, extra = {}) { return renderers[0].domElement.emit('wheel', { deltaX: 0, deltaY: delta, deltaMode: 0, ...extra }); },
    };
    t.after(() => api?.destroy());
    return result;
}

function assertResting(h, index = Number(h.container.dataset.activeIndex)) {
    h.discs.forEach((disc, i) => {
        const pose = discPose(i, index, h.container.clientWidth < 720);
        assert.equal(disc.position.x, pose.x);
        assert.equal(disc.position.y, pose.y);
        assert.equal(disc.position.z, pose.z || 0);
        assert.equal(Math.abs(disc.rotation.x), 0);
        assert.ok(Math.abs(disc.rotation.y - pose.rotationY) < 1e-10);
        assert.equal(Math.abs(disc.rotation.z), 0);
        assert.equal(disc.scale.x, pose.scale);
    });
}

test('entry runs once, then returns precisely to the reference arc and releases RAF', t => {
    const h = harness(t);
    h.mount();
    h.step();
    assert.equal(h.container.dataset.motion, 'entering');
    assert.ok(h.discs[2].position.z < 0);
    assert.ok(h.settle() < 50);
    assertResting(h, 2);
    assert.equal(h.container.dataset.motion, 'idle');
    const renders = h.renderers[0].renderCount;
    h.step(3000);
    assert.equal(h.renderers[0].renderCount, renders);
    h.observers[0].callback();
    h.step();
    assert.equal(h.container.dataset.motion, 'idle');
    assertResting(h, 2);
});

test('rapid retargets retain physical motion but emit metadata only on real index changes', t => {
    const h = harness(t);
    h.mount(); h.settle();
    h.api.next(); h.step(); h.api.previous(); h.api.next(); h.api.setActive(5);
    assert.equal(h.api.current(), h.works[5]);
    h.api.next(); h.api.setActive(NaN);
    assert.deepEqual(h.metadata, [2, 3, 2, 3, 5]);
    h.step();
    assert.equal(h.container.dataset.motion, 'switching');
    assert.notEqual(h.discs[5].rotation.y, discPose(5, 5).rotationY);
    h.settle();
    assertResting(h, 5);
    h.api.setActive(0, { immediate: true }); h.step();
    assertResting(h, 0);
    assert.equal(h.frames.size, 0);
});

test('desktop active-disc drag spins only that disc and returns without navigation', t => {
    const h = harness(t);
    h.mount(); h.settle();
    const start = h.point();
    const neighbor = h.discs[3].matrix.clone();
    h.pointer('pointerdown', start);
    h.step(16);
    h.pointer('pointermove', { ...start, clientX: start.clientX - 280 });
    for (let i = 0; i < 12; i += 1) h.step();
    assert.equal(h.container.dataset.motion, 'spinning');
    assert.ok(Math.abs(h.discs[2].rotation.y) > 1.5);
    assert.ok(h.discs[3].matrix.equals(neighbor));
    h.pointer('pointerup', { ...start, clientX: start.clientX - 280 });
    h.pointer('pointerleave', start);
    h.settle();
    assertResting(h, 2);
    assert.deepEqual(h.metadata, [2]);
    assert.equal(h.selections.length, 0);
});

test('background browse drag follows movement and settles with release momentum', t => {
    const h = harness(t);
    h.mount(); h.settle();
    const start = { clientX: 500, clientY: 12, pointerId: 4, pointerType: 'mouse', button: 0 };
    h.pointer('pointerdown', start);
    h.step(30);
    h.pointer('pointermove', { ...start, clientX: 280 });
    h.step(30);
    h.pointer('pointermove', { ...start, clientX: 210 });
    h.step(16);
    h.pointer('pointerup', { ...start, clientX: 210 });
    assert.ok(Number(h.container.dataset.activeIndex) > 2);
    h.settle();
    assertResting(h);
    assert.equal(h.selections.length, 0);
});

test('mobile active-disc horizontal drag browses rather than spins', t => {
    const h = harness(t, { width: 390 });
    h.mount(); h.settle();
    const start = { ...h.point(), pointerType: 'touch' };
    h.pointer('pointerdown', start); h.step(30);
    h.pointer('pointermove', { ...start, clientX: start.clientX - 150 }); h.step(30);
    assert.equal(h.container.dataset.motion, 'dragging');
    h.pointer('pointerup', { ...start, clientX: start.clientX - 150 }); h.settle();
    assert.ok(Number(h.container.dataset.activeIndex) > 2);
    assertResting(h);
    assert.equal(h.selections.length, 0);
});

test('spin and browse cancellation restore active without metadata or selection callbacks', t => {
    for (const mode of ['spin', 'browse']) {
        const h = harness(t);
        h.mount(); h.settle();
        const start = mode === 'spin' ? h.point() : { ...h.point(), clientX: 500, clientY: 12 };
        h.pointer('pointerdown', start); h.step(30);
        h.pointer('pointermove', { ...start, clientX: start.clientX - 450 }); h.step(30);
        h.pointer('pointercancel', start);
        h.pointer('pointerup', start);
        h.settle();
        assert.deepEqual(h.metadata, [2]);
        assert.equal(h.selections.length, 0);
        assert.equal(h.canvas.captured.size, 0);
        assertResting(h, 2);
    }
});

test('lost capture cancels, and a second pointer cannot hijack or complete a gesture', t => {
    const h = harness(t);
    h.mount(); h.settle();
    const start = h.point();
    h.pointer('pointerdown', start);
    h.pointer('pointermove', { ...start, clientX: start.clientX - 100, pointerId: 99 });
    h.pointer('pointerup', { ...start, pointerId: 99 });
    assert.ok(h.canvas.hasPointerCapture(1));
    h.canvas.releasePointerCapture(1);
    h.pointer('pointerup', start);
    h.settle();
    assert.equal(h.selections.length, 0);
    assert.deepEqual(h.metadata, [2]);
    assertResting(h, 2);
});

test('active hover changes real tilt and clearcoat, adds two outlines and eventually sleeps', t => {
    const h = harness(t);
    h.mount(); h.settle();
    h.pointer('pointermove', h.point());
    h.settle();
    assert.notEqual(h.discs[2].rotation.y, 0);
    assert.ok(h.discs[2].children[0].material.clearcoatRoughness < .16);
    assert.equal(h.discs[2].children.filter(object => object.isLineLoop && object.visible).length, 2);
    assert.equal(h.frames.size, 0);
    assert.deepEqual(h.metadata, [2]);
    h.pointer('pointermove', { ...h.point(), clientX: 10, clientY: 10 }); h.settle();
    assertResting(h);
    assert.equal(h.discs[2].children.filter(object => object.isLineLoop && object.visible).length, 0);
    assert.equal(h.discs[2].children[0].material.clearcoatRoughness, .16);
});

test('hovering another disc does not add active-hover effects; a click selects, never opens it', t => {
    const h = harness(t);
    h.mount(); h.settle();
    const start = h.point(1);
    h.pointer('pointermove', start); h.settle();
    assertResting(h);
    h.pointer('pointerdown', start); h.pointer('pointerup', start); h.settle();
    assert.equal(h.api.current(), h.works[1]);
    assert.equal(h.selections.length, 0);
});

test('Space flip is per-disc and springs back independently when changing selection', t => {
    const h = harness(t);
    h.mount(); h.settle();
    h.key(' '); h.step();
    assert.equal(h.container.dataset.motion, 'flipping');
    h.settle();
    assert.equal(h.discs[2].rotation.y, Math.PI);
    assert.equal(h.frames.size, 0);
    h.api.next(); h.settle();
    assertResting(h, 3);
    assert.equal(h.selections.length, 0);
});

test('opening has a short real 3D prepress, emits one rect.image, and ignores repeated input', t => {
    const h = harness(t, { customSelect: api => api.openCurrent() });
    h.mount(); h.settle();
    h.api.openCurrent(); h.api.openCurrent(); h.key('Enter'); h.api.next();
    assert.equal(h.selections.length, 0);
    h.step();
    assert.equal(h.container.dataset.motion, 'opening');
    assert.ok(h.discs[2].position.z < 0);
    for (let i = 0; i < 10; i += 1) h.step();
    assert.equal(h.selections.length, 1);
    const { work, rect } = h.selections[0];
    assert.equal(work, h.works[2]);
    assert.ok(rect.width > 0 && rect.height > 0);
    assert.match(rect.image, /^data:image\/png/);
    h.api.openCurrent(); h.settle();
    assert.equal(h.selections.length, 1);
    assert.equal(h.container.dataset.motion, 'selected');
    assert.deepEqual(h.metadata, [2]);
});

test('a real pointer click opens once; destroy during prepress cancels the pending callback', t => {
    const h = harness(t);
    h.mount(); h.settle();
    const start = h.point();
    h.pointer('pointerdown', start); h.step(20); h.pointer('pointerup', start);
    h.step(30);
    assert.equal(h.container.dataset.motion, 'opening');
    h.api.destroy();
    h.step(500); h.api.openCurrent(); h.api.next();
    assert.equal(h.selections.length, 0);
    assert.deepEqual(h.metadata, [2]);
    assert.equal(h.frames.size, 0);
});

test('reduced motion has no entry/drift, snaps input, and opens without a delayed animation', t => {
    const h = harness(t, { reducedMotion: true });
    h.mount();
    assert.equal(h.settle(), 1);
    assertResting(h, 2);
    h.api.next(); h.step();
    assertResting(h, 3);
    h.pointer('pointermove', h.point(3)); h.step();
    assertResting(h, 3);
    assert.equal(h.frames.size, 0);
    h.key(' '); h.step();
    assert.equal(h.discs[3].rotation.y, Math.PI);
    h.api.openCurrent(); h.api.openCurrent();
    assert.equal(h.selections.length, 1);
});

test('live reduced-motion preference changes cancel automatic motion and never replay entry', t => {
    const h = harness(t);
    h.mount(); h.step();
    h.media.emit('change', { matches: true }); h.step();
    assertResting(h, 2);
    assert.equal(h.frames.size, 0);
    h.media.emit('change', { matches: false }); h.step();
    assertResting(h, 2);
    assert.equal(h.container.dataset.motion, 'idle');
});

test('document hidden and offscreen gallery pause frames, then resume without time jumps or re-entry', t => {
    const h = harness(t);
    h.mount(); h.settle();
    h.api.next(); h.step();
    const before = h.discs[3].position.x;
    h.document.hidden = true; h.document.emit('visibilitychange');
    assert.equal(h.frames.size, 0);
    h.step(20000);
    assert.equal(h.discs[3].position.x, before);
    h.document.hidden = false; h.document.emit('visibilitychange'); h.step();
    assert.notEqual(h.discs[3].position.x, 0);
    h.settle(); assertResting(h, 3);
    h.observers[1].callback([{ isIntersecting: false }]);
    h.api.next();
    assert.equal(h.frames.size, 0);
    h.observers[1].callback([{ isIntersecting: true }]); h.settle();
    assertResting(h, 4);
});

test('hidden prepress cannot navigate until visible and does not multiply selection callbacks', t => {
    const h = harness(t);
    h.mount(); h.settle();
    h.api.openCurrent(); h.step();
    h.document.hidden = true; h.document.emit('visibilitychange'); h.step(30000);
    assert.equal(h.selections.length, 0);
    h.document.hidden = false; h.document.emit('visibilitychange'); h.settle();
    assert.equal(h.selections.length, 1);
});

test('wheel tails and held keys do not repeat; line/page deltas and deliberate next inputs work', t => {
    const h = harness(t);
    h.mount(); h.settle();
    for (const delta of [50, 45, 30, 20, 12, 6, 2]) { h.wheel(delta); h.step(40); }
    assert.equal(h.api.current(), h.works[3]);
    h.step(200); h.wheel(3, { deltaMode: 1 });
    assert.equal(h.api.current(), h.works[4]);
    h.key('ArrowRight', { repeat: true });
    assert.equal(h.api.current(), h.works[4]);
    h.key('ArrowRight');
    assert.equal(h.api.current(), h.works[5]);
    h.wheel(-1, { deltaMode: 2 });
    assert.equal(h.api.current(), h.works[4]);
    h.wheel(300, { ctrlKey: true });
    assert.equal(h.api.current(), h.works[4]);
    h.settle(); assertResting(h);
});

test('context loss stops work, reports once, cancels pending opens, and remains destroyable', t => {
    const h = harness(t);
    h.mount(); h.settle();
    h.api.openCurrent(); h.step();
    h.canvas.emit('webglcontextlost');
    h.canvas.emit('webglcontextlost');
    h.api.next(); h.step(1000);
    assert.equal(h.errors.length, 1);
    assert.equal(h.selections.length, 0);
    assert.deepEqual(h.metadata, [2]);
    assert.equal(h.frames.size, 0);
    assert.equal(h.container.dataset.renderer, 'lost');
});

test('destroy releases all GPU resources, listeners, observers, image callbacks and capture exactly once', t => {
    const h = harness(t);
    h.mount(); h.settle();
    const start = h.point();
    h.pointer('pointerdown', start);
    const lateImage = h.images[0].onload;
    h.api.destroy(); h.api.destroy(); lateImage();
    h.api.next(); h.api.openCurrent();
    assert.ok(h.resources.length > 20);
    assert.ok(h.resources.every(resource => resource.disposeCount === 1));
    assert.equal(h.renderers[0].disposed, 1);
    assert.equal(h.renderers[0].lost, 1);
    assert.ok(h.observers.every(observer => observer.disconnected));
    assert.ok(h.images.every(image => image.onload === null && image.onerror === null && image.getAttribute('src') === null));
    assert.equal(h.canvas.captured.size, 0);
    for (const target of [h.canvas, h.container, h.document, h.window, h.media]) assert.equal(target.listenerCount(), 0);
    assert.equal(h.container.children.length, 0);
    assert.equal(h.container.dataset.ready, undefined);
    assert.equal(h.container.dataset.motion, undefined);
    assert.equal(h.container.getAttribute('aria-label'), 'Original accessible title');
    assert.equal(h.frames.size, 0);
    assert.equal(h.selections.length, 0);
    assert.equal(h.errors.length, 0);
    assert.deepEqual(h.metadata, [2]);
});

test('partial environment setup failure disposes resources and restores the container', t => {
    const h = harness(t, { failEnvironment: true });
    assert.throws(() => h.mount(), /Environment setup failed/);
    assert.ok(h.resources.every(resource => resource.disposeCount === 1));
    assert.equal(h.renderers[0].disposed, 1);
    assert.equal(h.renderers[0].lost, 1);
    assert.equal(h.container.children.length, 0);
    assert.equal(h.container.getAttribute('aria-label'), 'Original accessible title');
    assert.equal(h.frames.size, 0);
    assert.equal(h.metadata.length, 0);
});

test('holding a stationary pressed disc releases RAF even while it owns pointer capture', t => {
    const h = harness(t);
    h.mount(); h.settle();
    const start = h.point();
    h.pointer('pointerdown', start); h.settle();
    assert.ok(h.canvas.hasPointerCapture(1));
    const renders = h.renderers[0].renderCount;
    h.step(1000);
    assert.equal(h.renderers[0].renderCount, renders);
    h.pointer('pointercancel', start); h.settle();
    assertResting(h, 2);
});

test('an API open requested while hidden waits for visibility, including reduced motion', t => {
    const h = harness(t, { reducedMotion: true });
    h.mount(); h.settle();
    h.document.hidden = true; h.document.emit('visibilitychange');
    h.api.openCurrent(); h.step(5000);
    assert.equal(h.frames.size, 0);
    assert.equal(h.selections.length, 0);
    h.document.hidden = false; h.document.emit('visibilitychange'); h.step();
    assert.equal(h.selections.length, 1);
});

test('synchronous destruction from onSelect never queues another frame or callback', t => {
    const h = harness(t, { customSelect: api => api.destroy() });
    h.mount(); h.settle(); h.api.openCurrent(); h.settle();
    assert.equal(h.selections.length, 1);
    assert.equal(h.frames.size, 0);
    assert.equal(h.errors.length, 0);
    assert.equal(h.canvas.parentNode, null);
});

test('ordinary pageshow never unlocks a navigation; only a restored bfcache page can reopen', t => {
    const h = harness(t, { reducedMotion: true });
    h.mount(); h.settle(); h.api.openCurrent();
    h.window.emit('pageshow', { persisted: false }); h.api.openCurrent();
    assert.equal(h.selections.length, 1);
    h.window.emit('pageshow', { persisted: true }); h.step(); h.api.openCurrent();
    assert.equal(h.selections.length, 2);
});
