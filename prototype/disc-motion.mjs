// Motion is expressed in disc units / seconds, independent of renderer and refresh rate.
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export const MOTION = Object.freeze({
    travel: Object.freeze({ frequency: 14, damping: .86, precision: .00015 }),
    follow: Object.freeze({ frequency: 30, damping: 1, precision: .00015 }),
    reaction: Object.freeze({ frequency: 19, damping: 1, precision: .0001 }),
    hover: Object.freeze({ frequency: 22, damping: 1, precision: .0001 }),
    flip: Object.freeze({ frequency: 11.5, damping: .84, precision: .00015 }),
    spin: Object.freeze({ frequency: 14, damping: .82, precision: .00015 }),
    press: Object.freeze({ frequency: 32, damping: 1, precision: .0001 }),
    entryDuration: .5,
    entryMaxDelay: .075,
    openDuration: .15,
});

export function frameDelta(time, previousTime) {
    if (previousTime == null) return 1 / 60;
    return clamp((time - previousTime) / 1000, 0, .05);
}

// Exact damped-oscillator integration. Unlike Euler/lerp, the same gesture feels
// the same at 30, 60 and 120 Hz, and retargeting preserves its current momentum.
export function springStep(state, target, dt, { frequency = 14, damping = .86, precision = .00015 } = {}) {
    if (dt <= 0) return { ...state };
    const x = state.value - target;
    const v = state.velocity;
    const decay = Math.exp(-damping * frequency * dt);
    let displacement;
    let velocity;
    if (Math.abs(damping - 1) < .00001) {
        const slope = v + frequency * x;
        displacement = decay * (x + slope * dt);
        velocity = decay * (v - frequency * slope * dt);
    } else if (damping < 1) {
        const w = frequency * Math.sqrt(1 - damping * damping);
        const sin = Math.sin(w * dt);
        const cos = Math.cos(w * dt);
        displacement = decay * (x * cos + (v + damping * frequency * x) / w * sin);
        velocity = decay * (v * cos - (damping * frequency * v + frequency * frequency * x) / w * sin);
    } else {
        const root = Math.sqrt(damping * damping - 1);
        const a = -frequency * (damping - root);
        const b = -frequency * (damping + root);
        const c = (v - b * x) / (a - b);
        const d = x - c;
        displacement = c * Math.exp(a * dt) + d * Math.exp(b * dt);
        velocity = a * c * Math.exp(a * dt) + b * d * Math.exp(b * dt);
    }
    if (Math.abs(displacement) <= precision && Math.abs(velocity) <= precision * 10) {
        return { value: target, velocity: 0 };
    }
    return { value: target + displacement, velocity };
}

export function springMoving(state, target) {
    return state.value !== target || state.velocity !== 0;
}

// A bounded, continuous rubber edge instead of a hard stop under the pointer.
export function dragPosition(position, count) {
    const end = Math.max(0, count - 1);
    const bound = clamp(position, 0, end);
    const overflow = position - bound;
    return bound + Math.sign(overflow) * .28 * (1 - Math.exp(-Math.abs(overflow) / .28));
}

export function sampleDrag(previous, position, time) {
    const elapsed = (time - previous.time) / 1000;
    if (elapsed <= 0) return { ...previous, position };
    const dt = Math.min(elapsed, .08);
    const instantaneous = clamp((position - previous.position) / elapsed, -8, 8);
    const blend = 1 - Math.exp(-dt / .04);
    const oldVelocity = elapsed > .12 ? 0 : previous.velocity;
    return { position, time, velocity: oldVelocity + (instantaneous - oldVelocity) * blend };
}

export function releaseVelocity(sample, time) {
    const age = Math.max(0, (time - sample.time) / 1000);
    // Holding a dragged disc still must not replay a stale flick on release.
    return age >= .14 ? 0 : sample.velocity * Math.exp(-age / .055);
}

export function releaseTarget(position, velocity, count) {
    const projection = clamp(velocity * .2, -1, 1);
    return clamp(Math.round(position + projection), 0, Math.max(0, count - 1));
}

export function dragMode(hitIndex, activeIndex, mobile = false) {
    return !mobile && hitIndex === activeIndex ? 'spin' : 'browse';
}

export function spinAngle(distance, width) {
    return clamp(distance / Math.max(220, width * .25) * Math.PI, -Math.PI, Math.PI);
}

export function dragRelease({ mode, cancelled = false, active, position, velocity = 0, count }) {
    return {
        index: cancelled || mode === 'spin' ? active : releaseTarget(position, velocity, count),
        velocity: cancelled || mode === 'spin' ? 0 : velocity,
    };
}

// A wheel burst selects once. Trackpad momentum tails do not become a second
// command; a fresh push, reversal or separated physical notch can select again.
export function wheelStep(previous, delta, time) {
    if (!Number.isFinite(delta) || Math.abs(delta) < .01) return { state: previous, step: 0 };
    const magnitude = Math.abs(delta);
    const direction = Math.sign(delta);
    const gap = previous ? time - previous.time : Infinity;
    const reversed = previous && direction !== previous.direction && magnitude >= 4;
    const notch = previous?.consumed && gap >= 80 && magnitude >= 32 && time - previous.stepTime >= 180;
    const freshPush = previous?.consumed && time - previous.stepTime >= 260
        && previous.magnitude < previous.peak * .45 && magnitude >= 14 && magnitude > previous.magnitude * 1.8;
    const fresh = !previous || gap > 160 || reversed || notch || freshPush;
    const state = fresh
        ? { time, direction, total: delta, magnitude, peak: magnitude, consumed: false, stepTime: -Infinity }
        : { ...previous, time, magnitude, total: previous.total + delta, peak: Math.max(previous.peak, magnitude) };
    let step = 0;
    if (!state.consumed && Math.abs(state.total) >= 34) {
        step = Math.sign(state.total);
        state.consumed = true;
        state.stepTime = time;
    }
    return { state, step };
}

export function velocityReaction(velocity, reducedMotion = false) {
    if (reducedMotion) return { bank: 0, push: 0 };
    const speed = Math.max(0, Math.abs(velocity) - .12);
    return {
        bank: Math.sign(velocity) * Math.min(.12, Math.sqrt(speed) * .043),
        push: Math.min(.065, speed * .012),
    };
}

export function entranceOffset(elapsed, distance = 0, reducedMotion = false) {
    if (reducedMotion) return 0;
    const delay = Math.min(Math.abs(distance) * .025, MOTION.entryMaxDelay);
    if (elapsed >= MOTION.entryDuration + delay) return 0;
    const remaining = 1 - clamp((elapsed - delay) / MOTION.entryDuration, 0, 1);
    return remaining * remaining * remaining;
}

// Only additive, transient transforms live here. At rest these return the exact
// identity, leaving discPose's arc and the gallery's reference camera untouched.
export function discMotionOffsets({ offset = 0, active = false, bank = 0, push = 0, hover = 0, hoverX = 0, hoverY = 0, press = 0, flip = 0, entrance = 0, reducedMotion = false } = {}) {
    if (reducedMotion) return { y: 0, z: 0, rotationX: 0, rotationY: 0, rotationZ: 0, scale: 1 };
    const turn = Math.abs(Math.sin(flip % Math.PI));
    const focus = Math.exp(-Math.abs(offset) * .8);
    return {
        y: -push * (.75 + .25 * focus) - entrance * .12 + turn * .015,
        z: hover * .022 - press * .11 + turn * .07 - entrance * .12 - push * .3,
        rotationX: -hoverY * .065 + hover * .012 + press * .028 + entrance * .045 + turn * .04,
        rotationY: bank * (active ? 1 : 1.08) + hoverX * .075,
        rotationZ: -bank * (active ? .18 : .26) + turn * .025 + entrance * .022 * Math.sign(offset),
        scale: 1 - press * .018 - entrance * .025,
    };
}
