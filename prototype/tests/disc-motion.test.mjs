import test from 'node:test';
import assert from 'node:assert/strict';
import {
    MOTION, frameDelta, springStep, springMoving, dragPosition, sampleDrag,
    releaseVelocity, releaseTarget, dragMode, spinAngle, dragRelease,
    wheelStep, velocityReaction, entranceOffset, discMotionOffsets,
} from '../disc-motion.mjs';

const close = (actual, expected, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} ≈ ${expected}`);
function integrate(state, target, duration, hz, options = MOTION.travel) {
    for (let i = 0; i < Math.round(duration * hz); i += 1) state = springStep(state, target, 1 / hz, options);
    return state;
}

test('elapsed time starts gently, rejects negative deltas and caps long background gaps', () => {
    assert.equal(frameDelta(10000, null), 1 / 60);
    assert.equal(frameDelta(100, 110), 0);
    assert.equal(frameDelta(60000, 100), .05);
    assert.equal(frameDelta(116, 100), .016);
});

test('analytical damping gives equivalent motion at 30/60/120 Hz', () => {
    for (const damping of [.84, 1, 1.4]) {
        const options = { frequency: 14, damping, precision: 0 };
        const initial = { value: .2, velocity: 2.4 };
        const slow = integrate(initial, 3, .3, 30, options);
        for (const hz of [60, 120]) {
            const result = integrate(initial, 3, .3, hz, options);
            close(result.value, slow.value);
            close(result.velocity, slow.velocity);
        }
    }
});

test('retargeting preserves momentum instead of restarting an easing tween', () => {
    const state = integrate({ value: 0, velocity: 0 }, 1, .1, 60);
    assert.ok(state.value > .1 && state.value < .7);
    assert.ok(state.velocity > 0);
    const retargeted = springStep(state, 2, 1 / 120, MOTION.travel);
    assert.ok(retargeted.value > state.value);
    assert.ok(retargeted.velocity > state.velocity);
    assert.deepEqual(springStep(state, 2, 0), state);
});

test('settling reaches the exact index and zero velocity within a finite number of frames', () => {
    for (const hz of [30, 60, 120]) {
        const result = integrate({ value: -.2, velocity: 8 }, 3, 2, hz);
        assert.deepEqual(result, { value: 3, velocity: 0 });
        assert.equal(springMoving(result, 3), false);
        assert.deepEqual(springStep(result, 3, 1 / hz), result);
    }
});

test('fast reversals and a long frame remain bounded and converge without flying away', () => {
    let state = { value: 0, velocity: 0 };
    for (let i = 0; i < 90; i += 1) {
        state = springStep(state, i % 7 < 3 ? 0 : 5, i % 8 === 0 ? .05 : 1 / 120, MOTION.travel);
        assert.ok(state.value >= -.2 && state.value <= 5.2);
        assert.ok(Number.isFinite(state.velocity));
    }
    assert.deepEqual(integrate(state, 2, 2, 60), { value: 2, velocity: 0 });
});

test('rubber edge preserves normal dragging and asymptotically limits overscroll', () => {
    assert.equal(dragPosition(1.3, 5), 1.3);
    assert.equal(dragPosition(0, 5), 0);
    assert.equal(dragPosition(4, 5), 4);
    assert.ok(dragPosition(-10, 5) >= -.28);
    assert.ok(dragPosition(100, 5) <= 4.28);
    close(dragPosition(-.000001, 5), -.000001, 1e-10);
    assert.ok(dragPosition(1, 1) <= .28);
});

test('drag velocity is filtered in seconds and a stationary hold forgets the old flick', () => {
    let sample = { position: 0, velocity: 0, time: 0 };
    for (let i = 1; i <= 12; i += 1) sample = sampleDrag(sample, i * .05, i * 10);
    assert.ok(sample.velocity > 4.7 && sample.velocity < 5.01);
    assert.ok(releaseVelocity(sample, 130) < sample.velocity);
    assert.equal(releaseVelocity(sample, 300), 0);
    assert.ok(Math.abs(sampleDrag(sample, .6, 400).velocity) < .01);
    const spike = sampleDrag(sample, 100, 121);
    assert.ok(spike.velocity <= 8);
});

test('flick projection is direction-aware, adds at most one disc, and respects list boundaries', () => {
    assert.equal(releaseTarget(1.2, 0, 6), 1);
    assert.equal(releaseTarget(1.2, 3, 6), 2);
    assert.equal(releaseTarget(1.8, -3, 6), 1);
    assert.equal(releaseTarget(1.2, 500, 6), 2);
    assert.equal(releaseTarget(-.2, -8, 6), 0);
    assert.equal(releaseTarget(5.2, 8, 6), 5);
    assert.equal(releaseTarget(0, 8, 1), 0);
});

test('desktop active-disc dragging spins; background, adjacent and mobile dragging browse', () => {
    assert.equal(dragMode(2, 2), 'spin');
    assert.equal(dragMode(-1, 2), 'browse');
    assert.equal(dragMode(3, 2), 'browse');
    assert.equal(dragMode(2, 2, true), 'browse');
    assert.equal(spinAngle(10000, 1440), Math.PI);
    assert.equal(spinAngle(-10000, 1440), -Math.PI);
    assert.equal(spinAngle(0, 1440), 0);
});

test('spin releases and both cancellation modes never navigate; browse release can commit', () => {
    const gesture = { active: 2, position: 3.7, velocity: 5, count: 6 };
    for (const mode of ['spin', 'browse']) {
        assert.deepEqual(dragRelease({ ...gesture, mode, cancelled: true }), { index: 2, velocity: 0 });
    }
    assert.deepEqual(dragRelease({ ...gesture, mode: 'spin' }), { index: 2, velocity: 0 });
    assert.deepEqual(dragRelease({ ...gesture, mode: 'browse' }), { index: 5, velocity: 5 });
});

test('wheel threshold accumulates fine trackpad deltas and consumes the complete momentum tail once', () => {
    let state;
    const steps = [];
    [4, 8, 14, 20, 30, 32, 28, 22, 18, 14, 10, 7, 5, 3, 2, 1].forEach((delta, i) => {
        const result = wheelStep(state, delta, i * 35);
        state = result.state;
        if (result.step) steps.push(result.step);
    });
    assert.deepEqual(steps, [1]);
    assert.equal(wheelStep(state, 70, 800).step, 1);
});

test('wheel reversals and deliberate notches respond while insignificant noise is ignored', () => {
    let { state } = wheelStep(null, 100, 0);
    assert.equal(wheelStep(state, -50, 20).step, -1);
    assert.equal(wheelStep(state, 100, 100).step, 0);
    state = wheelStep(state, 100, 100).state;
    assert.equal(wheelStep(state, 100, 200).step, 1);
    assert.equal(wheelStep(state, .001, 220).state, state);
    assert.equal(wheelStep(state, NaN, 220).step, 0);
});

test('velocity reaction has a low-speed dead zone, hard limits, and no reduced-motion drift', () => {
    assert.deepEqual(velocityReaction(.1), { bank: 0, push: 0 });
    const positive = velocityReaction(3);
    const negative = velocityReaction(-3);
    assert.equal(positive.bank, -negative.bank);
    assert.equal(positive.push, negative.push);
    assert.ok(positive.bank > 0 && positive.push > 0);
    assert.ok(velocityReaction(1000).bank <= .12);
    assert.ok(velocityReaction(1000).push <= .065);
    assert.deepEqual(velocityReaction(8, true), { bank: 0, push: 0 });
});

test('entry is short, staggered once and exactly zero afterwards or in reduced motion', () => {
    assert.equal(entranceOffset(0), 1);
    assert.ok(entranceOffset(.2, 2) > entranceOffset(.2, 0));
    assert.equal(entranceOffset(.6, 1000), 0);
    assert.equal(entranceOffset(100, 1000), 0);
    assert.equal(entranceOffset(0, 0, true), 0);
    assert.ok(MOTION.openDuration <= .18);
});

test('all resting offsets are the identity; hover/flip/press add real restrained 3D transforms', () => {
    const identity = { y: 0, z: 0, rotationX: 0, rotationY: 0, rotationZ: 0, scale: 1 };
    assert.deepEqual(discMotionOffsets(), identity);
    assert.deepEqual(discMotionOffsets({ flip: Math.PI }), identity);
    assert.deepEqual(discMotionOffsets({ bank: .1, press: 1, hover: 1, reducedMotion: true }), identity);
    const hovered = discMotionOffsets({ hover: 1, hoverX: .6, hoverY: .5 });
    assert.ok(hovered.z > 0 && Math.abs(hovered.rotationX) > 0 && hovered.rotationY > 0);
    const pressed = discMotionOffsets({ press: 1 });
    assert.ok(pressed.z < 0 && pressed.scale < 1);
    const flipping = discMotionOffsets({ flip: Math.PI / 2 });
    assert.ok(flipping.z > 0 && flipping.rotationX > 0);
});
