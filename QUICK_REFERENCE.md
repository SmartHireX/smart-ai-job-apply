# Quick Reference - New Domain Structure

## Directory Guide

```
autofill/          → Form filling logic
chatbot/           → AI chatbot logic
common/            → Shared infrastructure (constants, config, messaging)
shared/            → Shared utilities (AI client, resume manager, state)
```

## Finding Files

| Need to... | Look in... |
|------------|-----------|
| Modify autofill workflows | `autofill/workflows/` |
| Add autofill feature | `autofill/features/` |
| Update AI services | `autofill/services/ai/` |
| Modify cache logic | `autofill/services/cache/` |
| Update sidebar UI | `autofill/ui/sidebar/` |
| Modify chatbot | `chatbot/` |
| Update constants | `common/infrastructure/constants.js` |
| Change config/feature flags | `common/infrastructure/config.js` |
| Add shared utility | `shared/utils/` |

## Import Paths

### From autofill/workflows/
```javascript
import { CONSTANTS } from '../../common/infrastructure/constants.js';
import { FieldUtils } from '../utils/field-utils.js';
import { SmartMemoryService } from '../services/cache/smart-memory-service.js';
```

### From autofill/features/
```javascript
import { FieldUtils } from '../utils/field-utils.js';
import { CONSTANTS } from '../../common/infrastructure/constants.js';
```

### From chatbot/handlers/
```javascript
import { CONSTANTS } from '../../common/infrastructure/constants.js';
import { UndoManager } from '../../autofill/features/undo-manager.js';
```

### From autofill-orchestrator.js
```javascript
import { Lifecycle } from '../../common/infrastructure/lifecycle.js';
import { MessageRouter } from '../../common/messaging/message-router.js';
```

## Key Entry Points

- **Autofill Main**: `autofill/core/autofill-orchestrator.js`
- **Form Processor**: `autofill/core/form-processor.js`
- **Workflows**: `autofill/workflows/*.js`
- **Chatbot Main**: `chatbot/ui/chat.js`
- **Message Router**: `common/messaging/message-router.js`

## Manifest.json Load Order

1. Shared utils (AI client, resume manager, etc.)
2. Autofill services
3. Autofill handlers
4. Autofill UI
5. Shared state
6. Common infrastructure
7. Autofill features & workflows
8. Chatbot handlers
9. Message router
10. Autofill orchestrator (last)
