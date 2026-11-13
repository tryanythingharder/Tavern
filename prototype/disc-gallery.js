import * as THREE from './vendor/three.module.js?v=0.178.0';
import {
    MOTION, frameDelta, springStep, springMoving, dragPosition, sampleDrag,
    releaseVelocity, dragMode, spinAngle, dragRelease, wheelStep, velocityReaction, entranceOffset, discMotionOffsets,
} from './disc-motion.mjs?v=20261102-1';

const TAU = Math.PI * 2;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

// The disc is upright in its own space. Only the gallery supplies the X tilt.
export function discPose(index, position, mobile = false) {
    const offset = index - position;
    const angle = offset * .35;
    return mobile
        ? { x: offset * 2.05, y: 0, z: -Math.abs(offset) * .28, rotationY: -angle * .3, scale: Math.max(.78, 1 - Math.abs(offset) * .12) }
        : { x: Math.sin(angle) * 5.52, y: Math.abs(offset) < .5 ? .03 * (1 + Math.cos(offset * TAU)) : 0, z: (1 - Math.cos(angle)) * 2.4, rotationY: -angle, scale: Math.max(.8, 1 - Math.abs(offset) * .12) };
}

function ring(inner, outer, reverse = false) {
    const geometry = new THREE.RingGeometry(inner, outer, 128, 1);
    const positions = geometry.attributes.position;
    const uv = geometry.attributes.uv;
    for (let i = 0; i < positions.count; i += 1) {
        uv.setXY(i, positions.getX(i) / 2 + .5, positions.getY(i) / 2 + .5);
    }
    if (reverse) geometry.rotateY(Math.PI);
    return geometry;
}

function discArtwork(work, index, invalidate) {
    const size = 1024;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    let disposed = false;
    let image;
    const styles = {
        'lin-wanzhao': ['photo', '#eee9dd', '#172522', 'AFTER THREE YEARS'],
        'bai-lu': ['snow', '#d3d9d9', '#263a3b', 'THE LAST GUARDIAN'],
        'lu-shiyan': ['type', '#cf4b22', '#32211d', 'THE LAST NEGOTIATION'],
        'a-heng': ['bold', '#193642', '#e4db8b', 'A LIGHT LEFT ON'],
    };
    const [style, paper, ink, subtitle] = styles[work.id] || ['photo', '#ece6d7', '#272521', 'AN UNFINISHED STORY'];

    function paint(photo) {
        ctx.clearRect(0, 0, size, size);
        ctx.fillStyle = paper;
        ctx.fillRect(0, 0, size, size);
        if (photo && (style === 'photo' || style === 'snow')) {
            const factor = Math.max(size / photo.width, size / photo.height);
            ctx.drawImage(photo, (size - photo.width * factor) / 2, (size - photo.height * factor) / 2, photo.width * factor, photo.height * factor);
            ctx.fillStyle = style === 'snow' ? 'rgba(15,28,32,.18)' : 'rgba(20,26,24,.08)';
            ctx.fillRect(0, 0, size, size);
        }
        ctx.textAlign = 'center';
        if (style === 'photo') {
            ctx.fillStyle = paper;
            ctx.fillRect(0, 690, size, 334);
            ctx.fillStyle = ink;
            ctx.font = '400 104px "Songti SC", "Noto Serif SC", serif';
            ctx.fillText(work.name, 512, 823, 800);
            ctx.font = '18px Georgia, serif';
            ctx.fillText(subtitle, 512, 732);
        } else if (style === 'snow') {
            ctx.fillStyle = '#f7f5ed';
            ctx.font = '500 138px "Songti SC", serif';
            ctx.fillText(work.name, 512, 262, 800);
            ctx.font = '22px Georgia, serif';
            ctx.fillText(subtitle, 512, 305);
        } else if (style === 'type') {
            const light = ctx.createRadialGradient(280, 200, 0, 540, 520, 800);
            light.addColorStop(0, 'rgba(255,204,121,.28)');
            light.addColorStop(1, 'rgba(77,15,4,.18)');
            ctx.fillStyle = light;
            ctx.fillRect(0, 0, size, size);
            ctx.save();
            ctx.translate(512, 260);
            ctx.rotate(.055);
            ctx.fillStyle = ink;
            ctx.font = '600 108px "Songti SC", serif';
            ctx.fillText(work.name, 0, 0, 820);
            ctx.font = '28px Georgia, serif';
            ctx.fillText('THE LAST', 0, 62);
            ctx.fillText('NEGOTIATION', 0, 104);
            ctx.restore();
        } else {
            ctx.save();
            ctx.translate(512, 310);
            ctx.rotate(-.04);
            ctx.fillStyle = ink;
            ctx.font = '700 185px "PingFang SC", sans-serif';
            ctx.fillText(work.name, 0, 0, 780);
            ctx.font = '700 74px Arial, sans-serif';
            ctx.fillText('A LIGHT', 0, 110);
            ctx.fillText('LEFT ON', 0, 390);
            ctx.restore();
        }
        ctx.fillStyle = style === 'snow' ? '#f7f5ed' : ink;
        ctx.font = '500 27px "PingFang SC", sans-serif';
        ctx.fillText('酒馆', 512, 895);
        ctx.font = '17px "PingFang SC", sans-serif';
        ctx.fillText(`创作 / ${work.author}     ·     VOL. ${String(index + 1).padStart(2, '0')}`, 512, 930, 560);
        // A subtle print texture, rather than a dark photographic vignette.
        let seed = 19 + index;
        for (let i = 0; i < 16000; i += 1) {
            seed = (seed * 16807) % 2147483647;
            const x = seed % size;
            seed = (seed * 16807) % 2147483647;
            ctx.fillStyle = i % 2 ? 'rgba(255,255,255,.035)' : 'rgba(0,0,0,.025)';
            ctx.fillRect(x, seed % size, 1, 1);
        }
        texture.needsUpdate = true;
        invalidate();
    }
    paint();
    if (work.scene && (style === 'photo' || style === 'snow')) {
        image = new Image();
        image.onload = () => { if (!disposed) paint(image); };
        image.onerror = () => { if (!disposed) paint(); };
        image.src = `scenes/${encodeURIComponent(work.scene)}`;
    }
    return { texture, dispose() {
        if (disposed) return;
        disposed = true;
        if (image) { image.onload = null; image.onerror = null; image.removeAttribute('src'); }
        texture.dispose();
        canvas.width = canvas.height = 1;
    } };
}

function studioEnvironment(renderer) {
    const room = new THREE.Scene();
    room.background = new THREE.Color('#c7c9cc');
    const panels = [];
    for (const [x, y, z, w, h, color] of [[0, 5, 1, 10, 4, '#ffffff'], [-5, 0, 2, 4, 8, '#dfe9f5'], [4, -2, 3, 3, 9, '#fff8ec']]) {
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
        mesh.position.set(x, y, z);
        mesh.lookAt(0, 0, 0);
        room.add(mesh);
        panels.push(mesh);
    }
    let generator;
    try {
        generator = new THREE.PMREMGenerator(renderer);
        return generator.fromScene(room, .04);
    } finally {
        generator?.dispose();
        panels.forEach(mesh => { mesh.geometry.dispose(); mesh.material.dispose(); });
        room.clear();
    }
}

export function mountDiscGallery(container, works, { onHover, onSelect, onError, initialIndex = 2, reducedMotion } = {}) {
    if (!container || !Array.isArray(works) || !works.length) throw new Error('Disc gallery requires a mounted container and works.');
    const media = reducedMotion == null ? matchMedia('(prefers-reduced-motion: reduce)') : null;
    let reduce = reducedMotion ?? media.matches;
    const originalAttributes = new Map(['tabindex', 'role', 'aria-roledescription', 'aria-keyshortcuts', 'aria-label', 'data-renderer', 'data-ready', 'data-active-id', 'data-active-index', 'data-motion'].map(name => [name, container.getAttribute(name)]));
    const entryEnd = MOTION.entryDuration + MOTION.entryMaxDelay;
    const initial = clamp(Math.round(Number.isFinite(initialIndex) ? initialIndex : 2), 0, works.length - 1);
    const still = value => ({ value, velocity: 0 });
    let renderer, canvas, scene, camera, gallery, env, resizeObserver, intersection;
    let destroyed = false;
    let failed = false;
    let frame = 0;
    let lastTime = null;
    let inView = true;
    let mobile = false;
    let active = initial;
    let target = active;
    let travel = still(active);
    let bank = still(0);
    let push = still(0);
    let entryElapsed = reduce ? entryEnd : 0;
    let hovered = -1;
    let hoverPoint = { x: 0, y: 0 };
    let drag = null;
    let wheel = null;
    let selected = false;
    let selectionPending = false;
    let openElapsed = 0;
    const geometries = new Set();
    const materials = new Set();
    const artworks = [];
    const discs = [];
    const animations = [];
    const pickFaces = [];
    const listen = new AbortController();
    const signal = listen.signal;
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const geometry = value => { geometries.add(value); return value; };
    const material = value => { materials.add(value); return value; };

    function invalidate() {
        if (!destroyed && !failed && !frame && !document.hidden && inView) frame = requestAnimationFrame(draw);
    }

    function stopFrame() {
        if (frame) cancelAnimationFrame(frame);
        frame = 0;
        lastTime = null;
    }

    function releaseDrag() {
        const previous = drag;
        drag = null; // lostpointercapture can fire synchronously on release.
        if (previous && canvas.hasPointerCapture(previous.id)) canvas.releasePointerCapture(previous.id);
        if (canvas) canvas.style.cursor = 'grab';
        return previous;
    }

    function clearHover() {
        if (hovered < 0) return;
        hovered = -1;
        invalidate();
    }

    function cancelDrag(event) {
        if (!drag || (event?.pointerId != null && event.pointerId !== drag.id)) return;
        const previous = releaseDrag();
        const release = dragRelease({ mode: previous.mode, cancelled: true, active, position: target, count: works.length });
        animations[active].spinTarget = 0;
        animations[active].spin = reduce ? still(0) : { ...animations[active].spin, velocity: 0 };
        target = release.index;
        travel = reduce ? still(active) : { ...travel, velocity: release.velocity };
        clearHover();
        // Cancellation restores the current selection; it never commits a new one.
        invalidate();
    }

    function pause() {
        stopFrame();
        cancelDrag();
        clearHover();
        wheel = null;
        if (!destroyed && !failed) container.dataset.motion = 'paused';
    }

    function fail(error) {
        if (destroyed || failed) return;
        failed = true;
        selectionPending = false;
        stopFrame();
        releaseDrag();
        container.dataset.renderer = 'lost';
        container.dataset.motion = 'lost';
        onError?.(error);
    }

    function updateMetadata() {
        if (destroyed || failed) return;
        container.dataset.activeId = works[active].id;
        container.dataset.activeIndex = String(active);
        container.setAttribute('aria-label', `角色光盘：${works[active].name}，第 ${active + 1} / ${works.length} 张。左右方向键切换，Enter 查看详情，空格翻面。`);
        // Kept as the active-work callback for the existing metadata integration.
        onHover?.(works[active], active);
    }

    function snapKinetics() {
        travel = still(target);
        bank = still(0);
        push = still(0);
        for (const animation of animations) {
            animation.flip = still(animation.flipTarget);
            animation.spin = still(0);
            animation.spinTarget = 0;
            animation.hover = still(0);
            animation.x = still(0);
            animation.y = still(0);
            animation.press = still(0);
        }
    }

    function setActive(index, { immediate = false } = {}) {
        if (destroyed || failed || selected || !Number.isFinite(index)) return;
        const next = clamp(Math.round(index), 0, works.length - 1);
        const changed = next !== active;
        releaseDrag();
        active = next;
        target = active;
        entryElapsed = entryEnd;
        clearHover();
        animations.forEach(animation => { animation.spinTarget = 0; if (changed) animation.flipTarget = 0; });
        if (immediate || reduce) snapKinetics();
        if (changed) updateMetadata();
        invalidate();
    }

    function projectedRect(disc) {
        scene.updateMatrixWorld(true);
        camera.updateMatrixWorld(true);
        const bounds = canvas.getBoundingClientRect();
        const points = Array.from({ length: 64 }, (_, i) => disc.localToWorld(new THREE.Vector3(Math.cos(i * TAU / 64), Math.sin(i * TAU / 64), .008)).project(camera));
        const xs = points.map(p => bounds.left + (p.x + 1) * bounds.width / 2);
        const ys = points.map(p => bounds.top + (1 - p.y) * bounds.height / 2);
        return { left: Math.min(...xs), top: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
    }

    function finishSelection() {
        if (destroyed || failed || !selectionPending) return;
        selectionPending = false; // Lock before invoking user code, including re-entrant opens.
        container.dataset.motion = 'selected';
        try {
            const rect = projectedRect(discs[active]);
            onSelect(works[active], { ...rect, image: artworks[active].texture.image.toDataURL('image/png') });
        } catch (error) { fail(error); }
    }

    function openCurrent() {
        if (destroyed || failed || selected || !onSelect) return;
        releaseDrag();
        clearHover();
        target = active;
        animations[active].spinTarget = 0;
        entryElapsed = entryEnd;
        selected = selectionPending = true;
        openElapsed = 0;
        // A rapid index jump must not hand the transition an off-screen disc.
        if (Math.abs(travel.value - active) > 1.25) travel = still(active);
        if (!document.hidden && (reduce || !inView)) {
            snapKinetics();
            applyPoses();
            finishSelection();
        } else invalidate();
    }

    function pick(event) {
        const bounds = canvas.getBoundingClientRect();
        if (!bounds.width || !bounds.height) return null;
        pointer.set((event.clientX - bounds.left) / bounds.width * 2 - 1, 1 - (event.clientY - bounds.top) / bounds.height * 2);
        scene.updateMatrixWorld(true);
        camera.updateMatrixWorld(true);
        raycaster.setFromCamera(pointer, camera);
        const hit = raycaster.intersectObjects(pickFaces, false).find(value => discs[value.object.userData.discIndex].visible);
        if (!hit) return null;
        const index = hit.object.userData.discIndex;
        const local = discs[index].worldToLocal(hit.point.clone());
        return { index, x: clamp(local.x, -1, 1), y: clamp(local.y, -1, 1) };
    }

    function hoverAt(event) {
        const picked = event.pointerType === 'touch' ? null : pick(event);
        const hit = picked?.index === active ? picked : null;
        const index = hit?.index ?? -1;
        canvas.style.cursor = index < 0 ? 'grab' : 'pointer';
        if (index === hovered && (!hit || (hit.x === hoverPoint.x && hit.y === hoverPoint.y))) return;
        hovered = index;
        hoverPoint = hit || { x: 0, y: 0 };
        invalidate();
    }

    function applyPoses() {
        discs.forEach((disc, index) => {
            const pose = discPose(index, travel.value, mobile);
            const animation = animations[index];
            const motion = discMotionOffsets({
                offset: index - travel.value, active: index === active, bank: bank.value, push: push.value,
                hover: animation.hover.value, hoverX: animation.x.value, hoverY: animation.y.value,
                press: animation.press.value, flip: animation.flip.value + animation.spin.value,
                entrance: entranceOffset(entryElapsed, index - initial, reduce), reducedMotion: reduce,
            });
            disc.visible = Math.abs(index - travel.value) < 3.4;
            disc.position.set(pose.x, pose.y + motion.y, pose.z + motion.z);
            disc.rotation.set(motion.rotationX, pose.rotationY + animation.flip.value + animation.spin.value + motion.rotationY, motion.rotationZ);
            disc.scale.setScalar(pose.scale * motion.scale);
            // Actual clearcoat/environment lighting, not a CSS/cursor-only hover.
            animation.printed.clearcoatRoughness = .16 - animation.hover.value * .045;
            animation.printed.roughness = .42 - animation.hover.value * .025;
            const outline = !selected && index === active ? animation.hover.value : 0;
            animation.outlines.forEach((line, layer) => {
                line.visible = outline > .001;
                line.material.opacity = outline * (layer ? .27 : .4);
            });
        });
    }

    function draw(time) {
        frame = 0;
        if (destroyed || failed || document.hidden || !inView) { lastTime = null; return; }
        const dt = frameDelta(time, lastTime);
        lastTime = time;
        try {
            travel = reduce ? still(target) : springStep(travel, target, dt, drag?.moved && drag.mode === 'browse' ? MOTION.follow : MOTION.travel);
            const reaction = velocityReaction(travel.velocity, reduce);
            bank = reduce ? still(0) : springStep(bank, reaction.bank, dt, MOTION.reaction);
            push = reduce ? still(0) : springStep(push, reaction.push, dt, MOTION.reaction);
            entryElapsed = reduce ? entryEnd : Math.min(entryEnd, entryElapsed + dt);
            const travelling = springMoving(travel, target);
            let flipping = false;
            let moving = travelling || springMoving(bank, reaction.bank) || springMoving(push, reaction.push) || entryElapsed < entryEnd;
            animations.forEach((animation, index) => {
                const hoverTarget = !selected && index === active && ((index === hovered && !drag) || drag?.mode === 'spin') ? 1 : 0;
                const pressTarget = (selected && index === active) || (drag && !drag.moved && drag.hit === index) ? 1 : 0;
                const targets = { hover: hoverTarget, x: drag ? 0 : hoverTarget * hoverPoint.x, y: drag ? 0 : hoverTarget * hoverPoint.y, press: pressTarget, flip: animation.flipTarget, spin: animation.spinTarget };
                for (const name of ['hover', 'x', 'y', 'press', 'flip', 'spin']) {
                    const config = name === 'flip' ? MOTION.flip : name === 'spin' ? drag?.mode === 'spin' ? MOTION.follow : MOTION.spin : name === 'press' ? MOTION.press : MOTION.hover;
                    animation[name] = reduce ? still(targets[name]) : springStep(animation[name], targets[name], dt, config);
                    const changing = springMoving(animation[name], targets[name]);
                    moving ||= changing;
                    if (name === 'flip' || name === 'spin') flipping ||= changing;
                }
            });
            if (selectionPending) openElapsed += dt;
            applyPoses();
            renderer.render(scene, camera);
            container.dataset.ready = 'true';
            container.dataset.motion = selectionPending ? 'opening' : selected ? 'selected' : drag ? drag.mode === 'spin' ? 'spinning' : 'dragging' : entryElapsed < entryEnd ? 'entering' : travelling ? 'switching' : flipping ? 'flipping' : moving ? 'settling' : 'idle';
            if (selectionPending && (reduce || openElapsed >= MOTION.openDuration)) finishSelection();
            if (moving || selectionPending) invalidate();
            else lastTime = null;
        } catch (error) { fail(error); }
    }

    function resize() {
        if (destroyed || failed) return;
        const width = Math.max(1, container.clientWidth);
        const height = Math.max(1, container.clientHeight);
        mobile = width < 720;
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.position.z = mobile ? Math.max(4.4, 2.7 / camera.aspect / (2 * Math.tan(Math.PI / 9))) : 4.4;
        camera.updateProjectionMatrix();
        gallery.rotation.set(mobile ? -.36 : -Math.PI / 6, mobile ? -.32 : -Math.PI / 6, 0);
        gallery.scale.setScalar(mobile ? .94 : 1.08);
        invalidate();
    }

    function destroy() {
        if (destroyed) return;
        destroyed = true;
        selectionPending = false;
        stopFrame();
        listen.abort();
        releaseDrag();
        resizeObserver?.disconnect();
        intersection?.disconnect();
        artworks.forEach(art => art.dispose());
        materials.forEach(mat => mat.dispose());
        geometries.forEach(geo => geo.dispose());
        env?.dispose();
        if (scene) { scene.environment = null; scene.clear(); }
        gallery?.clear();
        renderer?.dispose();
        renderer?.forceContextLoss();
        // A stale instance must not remove a newer gallery's attributes.
        if (canvas?.parentNode === container) {
            originalAttributes.forEach((value, name) => value == null ? container.removeAttribute(name) : container.setAttribute(name, value));
            canvas.remove();
        }
        artworks.length = discs.length = animations.length = pickFaces.length = 0;
        materials.clear();
        geometries.clear();
    }

    try {
        renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
        renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.05;
        renderer.setClearColor(0xffffff, 0);
        canvas = renderer.domElement;
        canvas.setAttribute('aria-hidden', 'true');
        canvas.dataset.engine = `three.js r${THREE.REVISION}`;
        canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;cursor:grab;';
        container.replaceChildren(canvas);
        container.tabIndex = 0;
        container.setAttribute('role', 'group');
        container.setAttribute('aria-roledescription', 'carousel');
        container.setAttribute('aria-keyshortcuts', 'ArrowLeft ArrowRight Home End Enter Space');
        container.dataset.renderer = 'webgl';
        container.removeAttribute('data-ready');

        scene = new THREE.Scene();
        camera = new THREE.PerspectiveCamera(40, 1, .1, 40);
        camera.position.z = 4.4;
        gallery = new THREE.Group();
        scene.add(gallery);
        env = studioEnvironment(renderer);
        scene.environment = env.texture;
        scene.add(new THREE.AmbientLight('#ffffff', .65));
        const key = new THREE.DirectionalLight('#fff9e8', 1.4);
        key.position.set(3.5, -8, 6);
        scene.add(key);
        const fill = new THREE.DirectionalLight('#ffffff', .6);
        fill.position.set(-5, -2, 4);
        scene.add(fill);
        const rim = new THREE.DirectionalLight('#499ff5', .6);
        rim.position.set(0, 3, -6);
        scene.add(rim);

        const frontGeometry = geometry(ring(.245, 1));
        const backGeometry = geometry(ring(.245, 1, true));
        const edgeGeometry = geometry(new THREE.CylinderGeometry(1, 1, .012, 128, 1, true));
        edgeGeometry.rotateX(Math.PI / 2);
        const holeGeometry = geometry(new THREE.CylinderGeometry(.14, .14, .012, 96, 1, true));
        holeGeometry.rotateX(Math.PI / 2);
        const edgeMaterial = material(new THREE.MeshStandardMaterial({ color: '#dfe0e3', metalness: .7, roughness: .16, side: THREE.DoubleSide }));
        const backMaterial = material(new THREE.MeshPhysicalMaterial({ color: '#8c929f', metalness: .95, roughness: .24, clearcoat: .34, iridescence: 1, iridescenceIOR: 1.86, iridescenceThicknessRange: [140, 900] }));
        const hubMaterial = material(new THREE.MeshPhysicalMaterial({ color: '#d1d3d5', metalness: .38, roughness: .32, clearcoat: .6, side: THREE.DoubleSide }));
        const matrixMaterial = material(new THREE.MeshStandardMaterial({ color: '#969ba5', metalness: .75, roughness: .24, side: THREE.DoubleSide }));
        const frostMaterial = material(new THREE.MeshStandardMaterial({ color: '#e2e3e6', metalness: .22, roughness: .55, side: THREE.DoubleSide }));
        const hubGeometry = geometry(ring(.19, .245));
        const matrixGeometry = geometry(ring(.162, .19));
        const frostGeometry = geometry(ring(.14, .162));
        // Imperfect but static outlines: no idle noise or permanent animation loop.
        const outlineGeometries = [1.035, 1.055].map((radius, layer) => geometry(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 160 }, (_, i) => {
            const angle = i / 160 * TAU;
            const r = radius + Math.sin(angle * 3 + layer * 1.8) * .004 + Math.cos(angle * 5 - layer) * .002;
            return new THREE.Vector3(Math.cos(angle) * r, Math.sin(angle) * r, .014 + layer * .002);
        }))));
        works.forEach((work, index) => {
            const disc = new THREE.Group();
            const art = discArtwork(work, index, invalidate);
            artworks.push(art);
            art.texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
            const printed = material(new THREE.MeshPhysicalMaterial({ map: art.texture, roughness: .42, metalness: .15, clearcoat: .8, clearcoatRoughness: .16 }));
            for (const [geo, mat, z] of [[frontGeometry, printed, .006], [backGeometry, backMaterial, -.006], [edgeGeometry, edgeMaterial, 0], [holeGeometry, matrixMaterial, 0], [hubGeometry, hubMaterial, .007], [matrixGeometry, matrixMaterial, .008], [frostGeometry, frostMaterial, .008]]) {
                const mesh = new THREE.Mesh(geo, mat);
                mesh.position.z = z;
                mesh.userData.discIndex = index;
                disc.add(mesh);
                // Raycast physical surfaces only, never the central hole or a rectangle.
                pickFaces.push(mesh);
            }
            const outlines = outlineGeometries.map(geo => {
                const line = new THREE.LineLoop(geo, material(new THREE.LineBasicMaterial({ color: '#4d4138', transparent: true, opacity: 0, depthWrite: false })));
                line.visible = false;
                disc.add(line);
                return line;
            });
            gallery.add(disc);
            discs.push(disc);
            animations.push({ printed, outlines, flipTarget: 0, spinTarget: 0, flip: still(0), spin: still(0), hover: still(0), x: still(0), y: still(0), press: still(0) });
        });

        canvas.addEventListener('pointerdown', event => {
            if (destroyed || failed || selected || drag || event.button !== 0 || event.isPrimary === false) return;
            container.focus({ preventScroll: true });
            const hit = pick(event);
            const mode = dragMode(hit?.index ?? -1, active, mobile || event.pointerType === 'touch');
            drag = { mode, x: event.clientX, y: event.clientY, start: travel.value, moved: false, hit: hit?.index ?? -1, id: event.pointerId, sample: { position: travel.value, velocity: 0, time: performance.now() } };
            target = mode === 'spin' ? active : travel.value;
            wheel = null;
            entryElapsed = entryEnd;
            clearHover();
            canvas.setPointerCapture(event.pointerId);
            canvas.style.cursor = 'grabbing';
            invalidate();
        }, { signal });
        canvas.addEventListener('pointermove', event => {
            if (destroyed || failed || selected) return;
            if (!drag) { hoverAt(event); return; }
            if (event.pointerId !== drag.id) return;
            const dx = event.clientX - drag.x;
            drag.moved ||= Math.hypot(dx, event.clientY - drag.y) > 7;
            if (drag.moved) {
                if (drag.mode === 'spin') animations[active].spinTarget = spinAngle(dx, container.clientWidth);
                else {
                    target = dragPosition(drag.start - dx / (mobile ? 180 : 290), works.length);
                    drag.sample = sampleDrag(drag.sample, target, performance.now());
                }
                invalidate();
            }
        }, { signal });
        canvas.addEventListener('pointerup', event => {
            if (!drag || event.pointerId !== drag.id || destroyed || failed || selected) return;
            const previous = releaseDrag();
            if (previous.moved) {
                const velocity = reduce ? 0 : releaseVelocity(previous.sample, performance.now());
                const release = dragRelease({ mode: previous.mode, active, position: target, velocity, count: works.length });
                if (previous.mode === 'spin') {
                    animations[active].spinTarget = 0;
                    target = active;
                    hoverAt(event);
                    invalidate();
                } else {
                    travel = { ...travel, velocity: release.velocity };
                    setActive(release.index);
                }
            } else {
                target = active;
                const hit = pick(event);
                if (hit && hit.index === previous.hit) {
                    if (hit.index === active) openCurrent();
                    else setActive(hit.index);
                }
                invalidate();
            }
        }, { signal });
        canvas.addEventListener('pointercancel', cancelDrag, { signal });
        canvas.addEventListener('lostpointercapture', cancelDrag, { signal });
        canvas.addEventListener('pointerleave', clearHover, { signal });
        canvas.addEventListener('wheel', event => {
            if (destroyed || failed || event.ctrlKey || selected || drag) return;
            event.preventDefault();
            const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
            const result = wheelStep(wheel, delta * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? container.clientHeight : 1), performance.now());
            wheel = result.state;
            if (result.step) setActive(active + result.step);
        }, { signal, passive: false });
        container.addEventListener('keydown', event => {
            if (destroyed || failed || selected || event.target !== container || event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
            const actions = {
                ArrowLeft: () => setActive(active - 1), ArrowRight: () => setActive(active + 1), Home: () => setActive(0), End: () => setActive(works.length - 1), Enter: openCurrent,
                ' ': () => { cancelDrag(); clearHover(); entryElapsed = entryEnd; animations[active].flipTarget = animations[active].flipTarget ? 0 : Math.PI; invalidate(); },
            };
            if (actions[event.key]) { event.preventDefault(); wheel = null; actions[event.key](); }
        }, { signal });
        canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); fail(new Error('WebGL context lost')); }, { signal });
        resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(container);
        intersection = new IntersectionObserver(entries => {
            if (destroyed || failed) return;
            inView = entries[0].isIntersecting;
            if (inView) invalidate(); else pause();
        }, { threshold: 0 });
        intersection.observe(container);
        document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); else invalidate(); }, { signal });
        window.addEventListener('blur', () => { cancelDrag(); clearHover(); wheel = null; }, { signal });
        window.addEventListener('pageshow', event => {
            if (!event.persisted || destroyed || failed) return;
            selected = selectionPending = false;
            entryElapsed = entryEnd;
            snapKinetics();
            invalidate();
        }, { signal });
        media?.addEventListener('change', event => {
            reduce = event.matches;
            entryElapsed = entryEnd;
            cancelDrag();
            clearHover();
            snapKinetics();
            invalidate();
        }, { signal });
        resize();
        applyPoses();
        updateMetadata();
        invalidate();
    } catch (error) {
        destroy();
        throw error;
    }

    return {
        setActive,
        next() { setActive(active + 1); },
        previous() { setActive(active - 1); },
        openCurrent,
        current() { return works[active]; },
        destroy,
    };
}
