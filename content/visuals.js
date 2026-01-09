/**
 * visuals.js
 * Handles animations, field highlights, and visual feedback effects.
 */

let beamAnimationFrameId = null;

function highlightField(element, confidence = 1.0) {
    if (!element) return;

    // Remove existing highlights
    element.classList.remove(
        'smarthirex-filled-high',
        'smarthirex-filled-medium',
        'smarthirex-filled-low',
        'smarthirex-filled'
    );

    // Apply new highlight based on confidence
    if (confidence >= 0.85) {
        element.classList.add('smarthirex-filled-high');
    } else if (confidence >= 0.5) {
        element.classList.add('smarthirex-filled-medium');
    } else {
        element.classList.add('smarthirex-filled-low');
    }

    // Global generic class for any filled field
    element.classList.add('smarthirex-filled');

    // Add subtle pulse on entry
    element.style.animation = 'none';
    element.offsetHeight; // trigger reflow
    // element.style.animation = 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1)'; // Disabled pulse animation
}

function clearAllFieldHighlights() {
    const selector = '.smarthirex-filled, .smarthirex-filled-high, .smarthirex-filled-medium, .smarthirex-filled-low, .smarthirex-field-highlight, .smarthirex-typing, .smarthirex-spotlight';
    const highlighted = document.querySelectorAll(selector);

    highlighted.forEach(el => {
        el.classList.remove(
            'smarthirex-filled',
            'smarthirex-filled-high',
            'smarthirex-filled-medium',
            'smarthirex-filled-low',
            'smarthirex-field-highlight',
            'smarthirex-typing',
            'smarthirex-spotlight'
        );
        // Also clear any stuck inline styles from highlightField animation
        el.style.animation = '';
    });

    console.log(`🧹 Cleared highlights from ${highlighted.length} fields.`);
}

async function simulateTyping(element, value, confidence = 1.0) {
    if (!element || !value) return;

    // Add visual state
    element.classList.add('smarthirex-typing');
    element.focus();

    // Check if text input
    const isText = (element.tagName === 'INPUT' && !['checkbox', 'radio', 'range', 'color', 'file', 'date', 'time'].includes(element.type)) || element.tagName === 'TEXTAREA';

    if (isText) {
        // Use Native Setter for robust filling
        setNativeValue(element, '');

        const chars = String(value).split('');
        for (const char of chars) {
            const currentVal = element.value;
            setNativeValue(element, currentVal + char);

            // Random delay 10-20ms (Human-like but fast)
            await new Promise(r => setTimeout(r, Math.random() * 15 + 5));
        }
    } else {
        await new Promise(r => setTimeout(r, 100));
        setFieldValue(element, value);
    }

    element.classList.remove('smarthirex-typing');
    highlightField(element, confidence);
    dispatchChangeEvents(element);
    await new Promise(r => setTimeout(r, 50));
}

function triggerConfetti() {
    const colors = ['#0a66c2', '#38bdf8', '#818cf8', '#10b981', '#f59e0b'];

    for (let i = 0; i < 50; i++) {
        const confetti = document.createElement('div');
        confetti.className = 'smarthirex-confetti-particle'; // Controlled by sidebar.css
        confetti.style.cssText = `
            position: fixed;
            top: -10px;
            left: ${Math.random() * 100}vw;
            width: ${Math.random() * 10 + 5}px;
            height: ${Math.random() * 10 + 5}px;
            background: ${colors[Math.floor(Math.random() * colors.length)]};
            border-radius: ${Math.random() > 0.5 ? '50%' : '2px'};
            z-index: 2147483647;
            pointer-events: none;
            opacity: ${Math.random()};
            transform: rotate(${Math.random() * 360}deg);
        `;

        document.body.appendChild(confetti);

        const animDuration = Math.random() * 2 + 3;
        const animDelay = Math.random() * 2;

        confetti.style.animation = `confettiFall ${animDuration}s linear ${animDelay}s forwards`;

        // Use the decoupled CSS animation name
        setTimeout(() => confetti.remove(), (animDuration + animDelay) * 1000);
    }
}

function showConnectionBeam(sourceEl, targetEl) {
    hideConnectionBeam(); // Clear existing

    if (!sourceEl || !targetEl || !isFieldVisible(targetEl)) return;

    // Create SVG Overlay
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.id = 'smarthirex-connection-beam';
    svg.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        pointer-events: none;
        z-index: 2147483646; /* Just below the sidebar */
        overflow: visible;
    `;

    // Create Path
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "url(#beamGradient)");
    path.setAttribute("stroke-width", "2");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-dasharray", "4, 6");
    path.setAttribute("filter", "url(#glow)");
    path.style.transition = "opacity 0.2s ease";

    // Continuous flowing data effect
    path.style.animation = "flowBeam 1s linear infinite";

    // Create Gradient Definition
    const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    defs.innerHTML = `
        <linearGradient id="beamGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" style="stop-color:#3b82f6;stop-opacity:0.8" />
            <stop offset="100%" style="stop-color:#8b5cf6;stop-opacity:0.8" />
        </linearGradient>
        <filter id="glow">
            <feGaussianBlur stdDeviation="1.5" result="coloredBlur"/>
            <feMerge>
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
            </feMerge>
        </filter>
    `;

    svg.appendChild(defs);
    svg.appendChild(path);
    document.body.appendChild(svg);

    // Add glowing dot at target
    const targetDot = document.createElement('div');
    targetDot.id = 'smarthirex-beam-target';
    targetDot.style.cssText = `
        position: fixed;
        width: 8px;
        height: 8px;
        background: #8b5cf6;
        border-radius: 50%;
        box-shadow: 0 0 8px #8b5cf6, 0 0 16px #8b5cf6;
        z-index: 2147483647;
        pointer-events: none;
        transform: scale(0);
        opacity: 0; 
        animation: popIn 0.3s cubic-bezier(0.17, 0.67, 0.83, 0.67) 0.1s forwards;
    `;
    document.body.appendChild(targetDot);

    // Animation / Tracking Loop
    function updateBeam() {
        if (!sourceEl || !targetEl || !document.getElementById('smarthirex-connection-beam')) {
            cancelAnimationFrame(beamAnimationFrameId);
            return;
        }

        const sourceRect = sourceEl.getBoundingClientRect();
        const targetRect = targetEl.getBoundingClientRect();

        const startX = sourceRect.right;
        const startY = sourceRect.top + (sourceRect.height / 2);
        const endX = targetRect.left;
        const endY = targetRect.top + (targetRect.height / 2);

        // Control points
        const deltaX = endX - startX;
        const cp1x = startX + (deltaX * 0.4);
        const cp1y = startY;
        const cp2x = endX - (deltaX * 0.4);
        const cp2y = endY;

        const d = `M ${startX} ${startY} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${endX} ${endY}`;
        path.setAttribute("d", d);

        // Update target dot position
        targetDot.style.left = `${endX - 4}px`;
        targetDot.style.top = `${endY - 4}px`;

        // Request next frame
        beamAnimationFrameId = requestAnimationFrame(updateBeam);
    }

    // Start tracking
    updateBeam();
}

function hideConnectionBeam() {
    if (beamAnimationFrameId) {
        cancelAnimationFrame(beamAnimationFrameId);
        beamAnimationFrameId = null;
    }
    const beam = document.getElementById('smarthirex-connection-beam');
    if (beam) beam.remove();

    const dot = document.getElementById('smarthirex-beam-target');
    if (dot) dot.remove();
}

function highlightFileField(element) {
    element.style.outline = '3px solid #F59E0B';
    element.style.outlineOffset = '2px';
}

function highlightSubmitButton() {
    const submitBtn = document.querySelector('button[type="submit"], input[type="submit"]');
    if (submitBtn) {
        submitBtn.style.outline = '3px solid #10b981';
        submitBtn.style.outlineOffset = '2px';
        submitBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

/**
 * NEW: Show ghosting/typing animation for batched field filling
 * @param {HTMLElement} element - Form field element
 * @param {string} value - Value to type
 * @param {number} confidence - AI confidence level
 */
async function showGhostingAnimation(element, value, confidence = 0.8) {
    if (!element || !value) return;

    // Check accessibility preference for reduced motion
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion) {
        // Instant fill for users who prefer no animations
        setFieldValue(element, value);
        highlightField(element, confidence);
        dispatchChangeEvents(element);
        return;
    }

    // Add visual state
    element.classList.add('smarthirex-typing');
    element.classList.add('smarthirex-ai-writing'); // New class for pulse effect
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    element.focus();

    // Check if text input
    const isText = (element.tagName === 'INPUT' && !['checkbox', 'radio', 'range', 'color', 'file', 'date', 'time'].includes(element.type)) || element.tagName === 'TEXTAREA';

    if (isText) {
        const chars = String(value).split('');

        // Use Native Setter for robust filling
        setNativeValue(element, '');

        // Use SAME speed as simulateTyping: 10-20ms per character (human-like but fast)
        for (const char of chars) {
            const currentVal = element.value;
            setNativeValue(element, currentVal + char);
            // Random delay 10-20ms (same as cache/heuristic fills)
            await new Promise(r => setTimeout(r, Math.random() * 10 + 10));
        }
    } else {
        // For non-text fields, show brief animation then fill
        await new Promise(r => setTimeout(r, 200));
        setFieldValue(element, value);
    }

    element.classList.remove('smarthirex-typing');
    element.classList.remove('smarthirex-ai-writing');
    highlightField(element, confidence);
    dispatchChangeEvents(element);
}
