/* DOM motion for the exhibition; scene physics remain in disc-gallery.js. */
(() => {
    const reduce = matchMedia('(prefers-reduced-motion: reduce)');
    let gallery = null;
    let pending = 0;
    const animations = new Set();
    const groups = ['.p-cinema-discovery-meta h1', '.p-cinema-discovery-meta .p-cinema-credits', '.p-cinema-discovery-quotes'];

    function stop() {
        cancelAnimationFrame(pending);
        pending = 0;
        animations.forEach(animation => animation.cancel());
        animations.clear();
    }

    function reveal() {
        pending = 0;
        if (reduce.matches || document.hidden || !gallery?.isConnected) return;
        animations.forEach(animation => animation.cancel());
        animations.clear();
        groups.forEach((selector, index) => {
            const element = document.querySelector(selector);
            if (!element) return;
            const animation = element.animate([
                { opacity: .3, transform: 'translateY(5px)' },
                { opacity: 1, transform: 'translateY(0)' },
            ], { duration: 250, delay: index * 24, easing: 'cubic-bezier(.16,1,.3,1)' });
            animations.add(animation);
            animation.onfinish = () => animations.delete(animation);
        });
    }

    const sceneObserver = new MutationObserver(records => {
        if (['opening','selected','paused','lost'].includes(gallery?.dataset.motion)) { stop(); return; }
        if (!records.some(record => record.attributeName === 'data-active-id')) return;
        cancelAnimationFrame(pending);
        pending = requestAnimationFrame(reveal);
    });
    const attach = () => {
        const next = document.getElementById('discover-gallery');
        if (next === gallery) return;
        stop();
        sceneObserver.disconnect();
        gallery = next;
        if (gallery) sceneObserver.observe(gallery, { attributes: true, attributeFilter: ['data-active-id','data-motion'] });
    };
    const pageObserver = new MutationObserver(attach);
    pageObserver.observe(document.body, { subtree: true, childList: true });
    reduce.addEventListener('change', stop);
    document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
    window.addEventListener('pagehide', stop);
    attach();
})();
