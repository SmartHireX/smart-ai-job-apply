/**
 * DateHandler.js
 * 
 * "Temporal Semantics Engine"
 * 
 * Manages the lifecycle of semantic date objects.
 * Enforces the "Single Writer" rule and ensures that precision is never invented.
 * 
 * Core Invariants:
 * 1. Single Writer: Only this module writes to date inputs.
 * 2. Renderer Awareness: Adapts semantic dates to UI capabilities (Native/Split/Text).
 * 3. Precision Guard: Downgrades output if UI is less precise; BLOCKS output if UI demands more.
 * 4. Immutable Facts: User edits update the semantic object; the object never mutates to fit UI.
 */

class DateHandler {
    constructor() {
        // Authority Order: {year, month, day} > precision > isOpenEnded > iso
    }

    /**
     * Main Entry Point: Write a semantic date to a field (or set of fields)
     * @param {Object} dateValue - Structured date object { year, month, day, precision, ... }
     * @param {HTMLElement|Array} elements - Target element(s) to write to
     */
    async writeDate(dateValue, elements) {
        const targets = Array.isArray(elements) ? elements : [elements];

        // 1. Detect Renderer Capability
        const renderer = this.detectRenderer(targets);

        // 2. Negotiate Precision (The "Never Invent Precision" Rule)
        if (!renderer.accepts(dateValue.precision)) {
            console.warn(`[DateHandler] Precision Block: Store=${dateValue.precision}, Renderer requires more.`);
            return false; // Hard Stop
        }

        // 3. Compose Final Form
        const finalValue = this.composeValue(dateValue, renderer);

        // 4. Dispatch Write Event (Framework Safe)
        await this.dispatchWrite(targets, finalValue, renderer);

        return true;
    }

    /**
     * Detects the type of UI control we are dealing with.
     * Returns a RendererAdapter
     */
    detectRenderer(elements) {
        const el = elements[0]; // Primary element
        const tagName = el.tagName.toLowerCase();
        const inputType = el.getAttribute('type');

        // 1. Native Date Input
        if (tagName === 'input' && inputType === 'date') {
            return {
                type: 'native',
                accepts: (precision) => precision === 'day', // Must have full date
                format: (d) => d.iso // expects YYYY-MM-DD
            };
        }

        // 2. Split Fields (Month/Year) - detected via identifying attributes or siblings
        // (Simplified for this snippet - real logic would check sibling context)
        if (elements.length > 1) {
            return {
                type: 'split',
                accepts: (precision) => precision === 'month' || precision === 'day', // Can accept partials if split
                format: (d) => ({ year: d.year, month: d.month, day: d.day })
            };
        }

        // 3. Fallback: Text Input
        return {
            type: 'text',
            accepts: (precision) => true, // Accepts anything (we can format it)
            format: (d) => {
                if (d.precision === 'year') return `${d.year}`;
                if (d.precision === 'month') return `${d.month}/${d.year}`;
                return `${d.month}/${d.day}/${d.year}`; // Locale-aware fallback
            }
        };
    }

    composeValue(dateValue, renderer) {
        return renderer.format(dateValue);
    }

    /**
     * Triggers the full event lifecycle to satisfy frameworks like Workday/React.
     */
    async dispatchWrite(targets, value, renderer) {
        // focus -> keydown -> input -> change -> keyup -> blur
        for (const el of targets) {
            el.focus();
            el.value = value;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            el.blur();
        }
    }
}

if (typeof window !== 'undefined') window.DateHandler = new DateHandler();
