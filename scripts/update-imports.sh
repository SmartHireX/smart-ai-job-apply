#!/bin/bash

# Script to update import paths for reorganized codebase

echo "Updating import paths..."

# Update imports in autofill/workflows files
find autofill/workflows -name '*.js' -type f -exec sed -i '' \
  -e "s|from '../infrastructure/constants.js'|from '../../common/infrastructure/constants.js'|g" \
  -e "s|from '../utils/memory-utils.js'|from '../services/cache/smart-memory-service.js'|g" \
  -e "s|from '../utils/field-utils.js'|from '../utils/field-utils.js'|g" \
  -e "s|from '../features/undo-manager.js'|from '../features/undo-manager.js'|g" \
  -e "s|from '../features/self-healing.js'|from '../features/self-healing.js'|g" \
  {} \;

# Update imports in autofill/core files
find autofill/core -name '*.js' -type f -exec sed -i '' \
  -e "s|from '../infrastructure/config.js'|from '../../common/infrastructure/config.js'|g" \
  -e "s|from '../utils/memory-utils.js'|from '../services/cache/smart-memory-service.js'|g" \
  -e "s|from './phase0-classification.js'|from '../workflows/classification-workflow.js'|g" \
  -e "s|from './phase1-instant-fill.js'|from '../workflows/instant-fill-workflow.js'|g" \
  -e "s|from './phase2-ai-processing.js'|from '../workflows/ai-fill-workflow.js'|g" \
  {} \;

# Update imports in autofill/features files
find autofill/features -name '*.js' -type f -exec sed -i '' \
  -e "s|from '../utils/field-utils.js'|from '../utils/field-utils.js'|g" \
  -e "s|from '../utils/memory-utils.js'|from '../services/cache/smart-memory-service.js'|g" \
  -e "s|from '../infrastructure/constants.js'|from '../../common/infrastructure/constants.js'|g" \
  {} \;

# Update imports in common/infrastructure files
find common/infrastructure -name '*.js' -type f -exec sed -i '' \
  -e "s|from './constants.js'|from './constants.js'|g" \
  {} \;

# Update imports in common/messaging files
find common/messaging -name '*.js' -type f -exec sed -i '' \
  -e "s|from './message-handlers/|from '../../chatbot/handlers/|g" \
  -e "s|from './message-handlers/context-handler.js'|from '../../chatbot/handlers/context-handler.js'|g" \
  -e "s|from './message-handlers/form-handler.js'|from '../../autofill/handlers/autofill-message-handler.js'|g" \
  -e "s|from './message-handlers/undo-handler.js'|from '../../autofill/handlers/undo-handler.js'|g" \
  -e "s|from './message-handlers/chat-handler.js'|from '../../chatbot/handlers/chat-message-handler.js'|g" \
  {} \;

# Update imports in chatbot/handlers files
find chatbot/handlers -name '*.js' -type f -exec sed -i '' \
  -e "s|from '../../infrastructure/constants.js'|from '../../common/infrastructure/constants.js'|g" \
  -e "s|from '../../features/undo-manager.js'|from '../../autofill/features/undo-manager.js'|g" \
  {} \;

echo "Import paths updated!"
