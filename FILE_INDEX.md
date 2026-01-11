# File Index - Quick Lookup

## Autofill Domain

### Core
- `autofill/core/autofill-orchestrator.js`
- `autofill/core/form-processor.js`

### Workflows  
- `autofill/workflows/classification-workflow.js`
- `autofill/workflows/instant-fill-workflow.js`
- `autofill/workflows/ai-fill-workflow.js`

### Features
- `autofill/features/undo-manager.js`
- `autofill/features/self-healing.js`
- `autofill/features/ai-field-regeneration.js`

### Services - AI
- `autofill/services/ai/neural-classifier.js`
- `autofill/services/ai/batch-processor.js`
- `autofill/services/ai/feature-extractor.js`
- `autofill/services/ai/prefetch-engine.js`

### Services - Cache
- `autofill/services/cache/smart-memory-service.js`
- `autofill/services/cache/selection-cache.js`
- `autofill/services/cache/history-manager.js`
- `autofill/services/cache/cache-manager.js`
- `autofill/services/cache/multi-value-handler.js`

### Services - Extraction
- `autofill/services/extraction/form-detector.js`
- `autofill/services/extraction/section-detector.js`
- `autofill/services/extraction/sibling-cluster.js`

### Services - Other
- `autofill/services/matching/local-matcher.js`
- `autofill/services/indexing/field-indexing-service.js`

### Handlers
- `autofill/handlers/autofill-message-handler.js`
- `autofill/handlers/undo-handler.js`
- `autofill/handlers/handler.js`
- `autofill/handlers/cache-handler.js`
- `autofill/handlers/history-handler.js`
- `autofill/handlers/matcher-handler.js`
- `autofill/handlers/ai-handler.js`

### UI
- `autofill/ui/sidebar/sidebar-components.js`
- `autofill/ui/sidebar/drag-resize.js`
- `autofill/ui/animations/form-visuals.js`
- `autofill/ui/premium-inputs/premium-input-renderer.js`

### Utils & Routers
- `autofill/utils/field-utils.js`
- `autofill/routers/field-router.js`

---

## Chatbot Domain

### Handlers
- `chatbot/handlers/chat-message-handler.js`
- `chatbot/handlers/context-handler.js`

### Services
- `chatbot/services/ai/context-classifier.js`

### UI
- `chatbot/ui/chat.js`
- `chatbot/ui/chat.html`

---

## Common Domain

### Infrastructure
- `common/infrastructure/constants.js`
- `common/infrastructure/config.js`
- `common/infrastructure/lifecycle.js`

### Messaging
- `common/messaging/message-router.js`

---

## Shared Domain

### Utils
- `shared/utils/ai-client.js`
- `shared/utils/resume-manager.js`
- `shared/utils/form-extractor.js`
- `shared/utils/form-analyzer.js`

### State
- `shared/state/state-manager.js`
- `shared/state/action-queue.js`
- `shared/state/orchestrator.js`

---

**Total**: 56 files (49 JS, 6 CSS, 1 HTML)
