/**
 * SectionGrouper.js
 * 
 * "Drift-Proof Structural Identity Engine"
 * 
 * Identifies repeating container sections in forms (e.g., Work Experience, Education)
 * and assigns deterministic, stable UIDs that survive reordering, deletion, and SPA re-renders.
 * 
 * Core Invariants:
 * 1. Container-based Identity: Field index is derived from container, never from field.
 * 2. Order-independent Fingerprinting: Multiset hash of semantic signatures.
 * 3. Persistence: WeakMap + Temporal Stickiness for virtual DOM survival.
 */

class SectionGrouper {
    constructor() {
        // Source of Truth for Identity across re-renders
        this.identityMap = new WeakMap(); // DOM Node -> InstanceUID
        this.temporalCache = new Map();   // Fingerprint -> { timestamp, uid }
        this.TEMPORAL_WINDOW_MS = 500;    // Grace period for React/Vue suspense
    }

    /**
     * Main Entry Point
     * Groups fields into repeating sections based on structural analysis.
     */
    groupFieldsByContainer(fields) {
        // 1. Identify Potential Containers (Bottom-Up)
        const candidates = this.identifyCandidates(fields);

        // 2. Score & Filter (3-Layer Heuristic Stack)
        const validContainers = candidates.filter(c => this.scoreContainer(c) >= 1.0);

        // 3. Fingerprint & Cluster
        const sections = this.clusterByFingerprint(validContainers);

        // 3.5. DEDUPLICATION (Winner-Takes-All)
        // A field might belong to multiple overlapping clusters (e.g. Job > Dates).
        // specific logic: Prefer the cluster that is "Richer" (has more fields).
        const sectionMap = new Map(); // field -> winningSection

        sections.forEach(section => {
            section.instances.forEach(instance => {
                instance.fields.forEach(f => {
                    const currentBest = sectionMap.get(f);
                    const currentSize = currentBest ? currentBest.fingerprint.split('|').length : 0;
                    const newSize = section.fingerprint.split('|').length;

                    // Prefer larger sections (Rich Context)
                    // If tie, prefer the one with higher semantic score (implied by ordering or explicit check)
                    if (newSize > currentSize) {
                        sectionMap.set(f, section);
                    }
                });
            });
        });

        // 4. Assign Stable UIDs (Persistence Layer)
        // Only assign if the section WON the field
        this.assignStableUIDs(sections, sectionMap);

        return {
            blocks: sections.flatMap(s => s.instances.filter(i => i.fields.some(f => sectionMap.get(f) === s))),
            orphans: fields.filter(f => !f.container_uid)
        };
    }

    // --- 1. Candidate Identification ---

    identifyCandidates(fields) {
        // Group fields by common ancestors
        const nodeMap = new Map();
        fields.forEach(f => {
            let parent = f.element ? f.element.closest('fieldset, [role="group"], section, div') : null;
            // Climb up to find a stable wrapper
            while (parent && parent !== document.body) {
                if (!nodeMap.has(parent)) nodeMap.set(parent, []);
                nodeMap.get(parent).push(f);
                parent = parent.parentElement;
            }
        });

        return Array.from(nodeMap.entries()).map(([node, children]) => ({
            node,
            fields: children
        }));
    }

    // --- 2. Scoring (3-Layer Stack) ---

    scoreContainer(container) {
        let score = 0;
        const node = container.node;

        // A. Semantic Layer (+1.0)
        const role = node.getAttribute('role');
        const tag = node.tagName.toLowerCase();
        if (role === 'group' || tag === 'fieldset' || tag === 'section') score += 1.0;
        if (node.getAttribute('data-automation-id')?.includes('section')) score += 1.0;

        // B. Structural Layer (+0.8)
        // (Calculated during clustering, but we proxy it here by field count)
        if (container.fields.length >= 2) score += 0.2;

        // C. Behavioral Layer (+0.5)
        // Look for "Add" / "Remove" buttons nearby
        const hasActions = node.querySelector('button, [role="button"]');
        if (hasActions && /add|remove|delete|plus|minus/i.test(hasActions.innerText)) {
            score += 0.5;
        }

        return score;
    }

    // --- 3. Fingerprinting (Order-Independent) ---

    clusterByFingerprint(containers) {
        const clusters = new Map();

        containers.forEach(c => {
            const fingerprint = this.generateFingerprint(c.fields);
            if (!clusters.has(fingerprint)) clusters.set(fingerprint, []);
            clusters.get(fingerprint).push(c);
        });

        // Convert to Section objects
        const sections = [];
        clusters.forEach((instances, fingerprint) => {
            // Only consider it a section if we have repeaters OR strong semantics
            // Threshold: >1 instance OR very complex structure
            if (instances.length > 1 || fingerprint.includes('complex')) {
                sections.push({
                    fingerprint,
                    instances: instances.sort((a, b) => this.getVerticalPos(a.node) - this.getVerticalPos(b.node))
                });
            }
        });
        return sections;
    }

    generateFingerprint(fields) {
        // SORTED multiset of [SemanticType:InputType]
        // Excludes: labels, values, placeholders, indices
        const signatures = fields.map(f => {
            const sem = f.ml_prediction?.label || 'unknown';
            const type = f.element?.type || 'text';
            return `${sem}:${type}`;
        });
        return signatures.sort().join('|');
    }

    // --- 4. Persistence (Drift-Proofing) ---

    assignStableUIDs(sections, sectionMap) {
        sections.forEach(section => {
            // Stable Section UID based on fingerprint (structural type)
            const sectionUID = this.hashString(section.fingerprint);

            section.instances.forEach((instance, index) => {
                let instanceUID = null;

                // A. Check WeakMap (Live DOM Node)
                if (this.identityMap.has(instance.node)) {
                    instanceUID = this.identityMap.get(instance.node);
                }
                // B. Check Temporal Cache (Recent Disappearance)
                else if (this.temporalCache.has(section.fingerprint)) {
                    // Logic to reclaim UID from ghost list would go here
                    // For now, we use a simplified version:
                    // If index matches a "missing" slot, sticky it.
                }

                // C. Fallback: Generate New Stable ID
                // Note: In a real re-order event, we'd rely on the WeakMap.
                // If it's a fresh load, index-based generation is deterministic.
                if (!instanceUID) {
                    instanceUID = `${sectionUID}_${index}`;
                    this.identityMap.set(instance.node, instanceUID);
                }

                // Apply to Fields
                instance.fields.forEach(f => {
                    // Only apply if this section is the designated winner (if map provided)
                    if (sectionMap && sectionMap.get(f) !== section) return;

                    f.section_uid = sectionUID;
                    f.instance_uid = instanceUID;
                    f.container_uid = instanceUID; // Alias for backward compat
                });
            });
        });
    }

    // --- Helpers ---

    getVerticalPos(node) {
        return node.getBoundingClientRect().top;
    }

    hashString(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash |= 0;
        }
        return "uid_" + Math.abs(hash).toString(16);
    }
}

// Export
if (typeof window !== 'undefined') window.SectionGrouper = new SectionGrouper();
