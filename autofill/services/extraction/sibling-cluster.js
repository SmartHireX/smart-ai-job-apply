/**
 * sibling-cluster.js
 * Infers field context based on neighboring fields ("Tell me who your neighbors are")
 */

const CLUSTERS = [
    // Address Pattern: [City] -> [State] -> [Zip]
    {
        name: 'Address Block',
        anchors: ['city', 'location'],
        pattern: [
            { type: 'anchor' }, // City
            { type: 'unknown', infer: 'state', confidence: 0.8 }, // State
            { type: 'anchor', match: /zip|postal/i } // Zip
        ]
    },
    // Name Pattern: [First] -> [Middle] -> [Last]
    {
        name: 'Name Block',
        anchors: ['first_name', 'fname'],
        pattern: [
            { type: 'anchor' }, // First
            { type: 'unknown', infer: 'middle_name', confidence: 0.7 }, // Middle
            { type: 'anchor', match: /last.*name|lname/i } // Last
        ]
    },
    // Date Pattern: [Month] -> [Day] -> [Year]
    {
        name: 'Date Block (MDY)',
        anchors: ['month'],
        pattern: [
            { type: 'anchor' }, // Month
            { type: 'unknown', infer: 'day', confidence: 0.8 }, // Day
            { type: 'anchor', match: /year/i } // Year
        ]
    }
];

/**
 * Infer context for unknown fields by analyzing their neighbors
 * @param {Array} fields - All extracted fields
 * @returns {void} Mutates fields with 'inferredLabel'
 */
function analyzeSiblingClusters(fields) {
    if (!fields || fields.length < 3) return;

    // 0. Initialize context for everyone (so user always sees it)
    fields.forEach(f => f.siblingContext = "Isolated");

    // 1. Group by Significant Container (Prioritize Form)
    // Relaxed logic: Don't just look at parent, look closer to the "Section" root
    const groups = new Map();
    fields.forEach(field => {
        if (!field.element) return;

        // Broadest Safe Context: Form -> Body
        // We want to group "First Name" and "Last Name" even if they are in different 'div.rows'
        const container = field.element.closest('form') || field.element.ownerDocument.body;

        if (!groups.has(container)) {
            groups.set(container, []);
        }
        groups.get(container).push(field);
    });

    // 2. Process each Group
    for (const [parent, groupFields] of groups) {
        if (groupFields.length < 2) continue;

        // Sort by DOM order
        groupFields.sort((a, b) => {
            const pos = a.element.compareDocumentPosition(b.element);
            return (pos & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1;
        });

        // Debug: Create a summary of the group
        const groupLabels = groupFields.map(f => f.label || f.name || 'unknown');

        // Attach this context to ALL fields in the group (so user can see it)
        groupFields.forEach((field, idx) => {
            // Sliding Window: Show +/- 2 neighbors for relevance
            const start = Math.max(0, idx - 2);
            const end = Math.min(groupLabels.length, idx + 3); // Exclusive end
            const window = groupLabels.slice(start, end);

            // Re-highlight self within the window (since slice is a copy)
            const selfInWindowIndex = idx - start;
            window[selfInWindowIndex] = `*${window[selfInWindowIndex]}*`;

            field.siblingContext = window.join(', ');
        });

        // Check against Clusters
        CLUSTERS.forEach(cluster => {
            // Find Anchors (Pivots)
            for (let i = 0; i < groupFields.length; i++) {
                const field = groupFields[i];
                const label = (field.label || field.name || '').toLowerCase();

                // Is this an anchor?
                const isAnchor = cluster.anchors.some(a => label.includes(a));

                if (isAnchor) {
                    // Try to match pattern starting from here
                    matchPattern(groupFields, i, cluster);
                }
            }
        });
    }
}

function matchPattern(groupFields, startIndex, cluster) {
    // Check if group has enough remaining fields
    if (startIndex + cluster.pattern.length > groupFields.length) return;

    for (let i = 0; i < cluster.pattern.length; i++) {
        const node = cluster.pattern[i];
        const field = groupFields[startIndex + i];
        const label = (field.label || field.name || '').toLowerCase();

        if (node.type === 'anchor') {
            // Verify match
            if (node.match && !node.match.test(label)) return; // Broken chain
        } else if (node.type === 'unknown') {
            // This is what we want to infer!
            // Only infer if it doesn't already have a strong label
            if (!label || label.length < 3 || /text|input|field/i.test(label)) {
                field.inferredLabel = node.infer;
                field.parentContext = (field.parentContext || '') + ` (Inferred: ${node.infer})`;
                // console.log(`🧩 [SiblingCluster] Inferred "${node.infer}" for field at index ${startIndex + i}`);
            }
        }
    }
}

// Export
if (typeof window !== 'undefined') {
    window.SiblingCluster = {
        analyze: analyzeSiblingClusters
    };
}
