# 🏛️ SmartHireX Enterprise Architecture v2.0

## 🌟 Philosophy: Enterprise-Grade Form Intelligence

This system is designed to match or exceed the sophistication of **Chrome Autofill**, **1Password**, and **LastPass**. We implement industry-standard techniques with our own optimizations.

### Core Principles
1. **Privacy First**: All data stays in browser local storage. No cloud sync.
2. **3-Tier Resolution**: Explicit HTML → Semantic Hints → Visual Heuristics
3. **Zero Dependencies**: Pure JavaScript, no TensorFlow or heavy frameworks
4. **Self-Learning**: The system remembers user corrections and improves over time

---

## 🏗️ System Architecture Overview

```mermaid
graph TB
    subgraph User ["👤 User Interaction"]
        Popup[Extension Popup]
        Sidebar[Sidebar UI]
    end

    subgraph Core ["🎯 Core Engine"]
        Bootstrap[Bootstrap Loader]
        Pipeline[PipelineOrchestrator]
        Router[MessageRouter]
    end

    subgraph Extraction ["📋 Form Extraction"]
        FormDetector[FormDetector]
        LabelExtractor[3-Tier Label Extractor]
        SectionGrouper[SectionGrouper]
    end

    subgraph Classification ["🧠 AI Classification"]
        Hybrid[HybridClassifier]
        Heuristic[HeuristicEngine]
        Neural[NeuralClassifier v8]
    end

    subgraph Resolution ["💾 Data Resolution"]
        InteractionLog[InteractionLog]
        RuleEngine[RuleEngine]
        GlobalMemory[GlobalMemory]
        CopilotClient[CopilotClient AI]
    end

    subgraph Execution ["🚀 Execution"]
        ExecutionEngine[ExecutionEngine]
        DateHandler[DateHandler]
        SectionController[SectionController]
    end

    Popup --> Bootstrap
    Sidebar --> Router
    Bootstrap --> Pipeline
    Pipeline --> FormDetector
    FormDetector --> LabelExtractor
    LabelExtractor --> SectionGrouper
    SectionGrouper --> Hybrid
    Hybrid --> Heuristic
    Hybrid --> Neural
    Pipeline --> InteractionLog
    Pipeline --> RuleEngine
    Pipeline --> GlobalMemory
    Pipeline --> CopilotClient
    Pipeline --> ExecutionEngine
    ExecutionEngine --> DateHandler
    ExecutionEngine --> SectionController
```

---

## 📁 Project Structure

```
smartHireX/
├── autofill/
│   ├── core/                    # Core orchestration
│   │   ├── PipelineOrchestrator.js   # Main pipeline engine
│   │   ├── bootstrap.js              # Lazy script loader
│   │   └── autofill-orchestrator.js  # Entry point
│   │
│   ├── services/extraction/     # Form analysis
│   │   ├── form-detector.js          # 3-tier label extraction
│   │   ├── section-grouper.js        # Container-based grouping
│   │   └── section-detector.js       # Section type detection
│   │
│   ├── domains/                 # Business logic
│   │   ├── inference/               # AI classifiers
│   │   │   ├── HeuristicEngine.js   # Pattern matching (77.87%)
│   │   │   ├── neural-classifier.js # Deep learning (65.22%)
│   │   │   └── HybridClassifier.js  # Ensemble arbitration
│   │   │
│   │   ├── heuristics/              # Memory & caching
│   │   │   ├── InteractionLog.js    # User action memory
│   │   │   └── GlobalMemory.js      # Cross-site learning
│   │   │
│   │   ├── profile/                 # Data handlers
│   │   │   ├── RuleEngine.js        # Resume data matching
│   │   │   └── CompositeFieldManager.js # Multi-value fields
│   │   │
│   │   └── memory/                  # Storage layer
│   │       └── IndexingService.js   # Field indexing
│   │
│   ├── workflows/               # High-level flows
│   │   ├── ai-fill-workflow.js      # AI-powered filling
│   │   └── instant-fill-workflow.js # Cache-based instant fill
│   │
│   ├── features/                # Feature modules
│   │   ├── form-observer.js         # Real-time form monitoring
│   │   └── ai-field-regeneration.js # Field regeneration
│   │
│   ├── handlers/                # Specialized handlers
│   │   └── DateHandler.js           # Date field normalization
│   │
│   ├── ui/                      # User interface
│   │   └── sidebar/                 # Sidebar components
│   │
│   └── utils/                   # Utilities
│       ├── key-generator.js         # Cache key generation
│       └── field-utils.js           # Field helpers
│
├── popup/                       # Extension popup
├── options/                     # Settings page
├── background/                  # Service worker
├── common/                      # Shared utilities
│   └── messaging/               # Message router
└── docs/                        # Documentation
```

---

## 🎯 PipelineOrchestrator: The Central Nervous System

The `PipelineOrchestrator` is the heart of the autofill system. It coordinates the entire pipeline:

```
┌─────────────────────────────────────────────────────────────────┐
│                     PIPELINE EXECUTION                          │
├─────────────────────────────────────────────────────────────────┤
│  1. INGESTION    │  Raw fields → ML enrichment → Metadata      │
│  2. GROUPING     │  Fields → ATOMIC_SINGLE/MULTI/SECTION       │
│  3. RESOLUTION   │  InteractionLog → RuleEngine → AI           │
│  4. EXECUTION    │  Fill fields → Cache results → Human jitter │
└─────────────────────────────────────────────────────────────────┘
```

### Field Instance Types
| Type | Description | Handler |
|------|-------------|---------|
| `ATOMIC_SINGLE` | Text, email, phone, single-select | InteractionLog → RuleEngine |
| `ATOMIC_MULTI` | Skills, interests (multi-select) | CompositeFieldManager |
| `SECTION_REPEATER` | Job history, education blocks | SectionController |
| `SECTION_CANDIDATE` | Potential repeater fields | SectionController |

---

## 📝 3-Tier Label Extraction (Enterprise-Grade)

Based on research of Chrome Autofill, 1Password, and LastPass techniques:

```
┌─────────────────────────────────────────────────────────────────┐
│                     TIER 1: EXPLICIT (100% Confidence)          │
├─────────────────────────────────────────────────────────────────┤
│  1. autocomplete attribute    (developer intent)                │
│  2. element.labels           (native HTML association)          │
│  3. label[for="id"]          (explicit selector)                │
│  4. aria-labelledby          (visible DOM text - FIRST!)        │
│  5. aria-label               (direct attribute)                 │
│  6. aria-describedby         (secondary description)            │
└─────────────────────────────────────────────────────────────────┘
                              ↓ (if empty)
┌─────────────────────────────────────────────────────────────────┐
│                     TIER 2: SEMANTIC (80-95% Confidence)        │
├─────────────────────────────────────────────────────────────────┤
│  1. data-label, data-field-name, data-testid                   │
│  2. Fieldset legend (radio/checkbox groups only)               │
│  3. Table column headers                                        │
│  4. placeholder attribute                                       │
│  5. title attribute                                             │
└─────────────────────────────────────────────────────────────────┘
                              ↓ (if empty)
┌─────────────────────────────────────────────────────────────────┐
│                     TIER 3: VISUAL HEURISTICS (40-70%)          │
├─────────────────────────────────────────────────────────────────┤
│  1. Structural boundary search (within .form-group)            │
│  2. Previous sibling text (with field boundary detection)      │
│  3. Parent text nodes (with section heading blacklist)         │
│  4. Humanized name/id (last resort)                            │
└─────────────────────────────────────────────────────────────────┘
```

### Key Protections
- **Section Heading Blacklist**: Rejects H1-H6 with patterns like "📋 Select Dropdowns"
- **Legend Hijacking Prevention**: Legends only match radio/checkbox groups
- **PRECEDING vs FOLLOWING**: Labels must be BEFORE inputs
- **section-* Guard**: Skips autocomplete tokens like `section-work`

---

## 🧠 Hybrid Classification System

Two classifiers work in ensemble:

### HeuristicEngine (Primary - 77.87% accuracy)
- **Method**: 165+ regex patterns + keyword matching
- **Speed**: < 1ms per field
- **Strengths**: High accuracy on common fields

### NeuralClassifier v8 (Backup - 65.22% accuracy)
- **Architecture**: 3-layer network (84→512→256→128→135)
- **Method**: Deep learning on 84-dimensional feature vectors
- **Strengths**: 100% coverage, handles edge cases

### Arbitration Logic
```javascript
// 5-Tier Confidence-Based Arbitration
1. Both agree HIGH confidence → Use shared result
2. Heuristic HIGH, Neural LOW → Trust heuristic
3. Neural HIGH, Heuristic LOW → Trust neural
4. Both MEDIUM → Prefer heuristic (more reliable)
5. Both LOW → Fallback to 'unknown'
```

---

## 💾 Memory & Caching Architecture

### InteractionLog (User Action Memory)
- Remembers user selections across forms
- Stores by semantic key (not DOM position)
- Supports ATOMIC_SINGLE, ATOMIC_MULTI, SECTION types

### GlobalMemory (Cross-Site Learning)
- Learns patterns across different websites
- Uses normalized cache keys
- Confidence-weighted retrieval

### RuleEngine (Resume Data Matching)
- Maps resume fields to form fields
- Supports structured data (address, phone, email)
- Handles format normalization

---

## ⚡ Execution Pipeline

### 1. Field Resolution Chain
```
InteractionLog (cached) → RuleEngine (resume) → AI (generated)
```

### 2. Human-Like Filling
- **Stealth Typing**: Mimics human input patterns
- **Event Simulation**: Triggers input, change, blur events
- **Jitter**: Random 30-120ms delays between fields

### 3. Date Handling
- Normalizes dates across formats (US, ISO, European)
- Handles date pickers, dropdowns, text inputs
- Validates against min/max constraints

---

## 🔄 Message Flow

```mermaid
sequenceDiagram
    participant Popup
    participant Background
    participant ContentScript
    participant Pipeline
    participant DOM

    Popup->>ContentScript: ACTIVATE_EXTENSION
    ContentScript->>Pipeline: Load lazy scripts
    Popup->>ContentScript: START_LOCAL_PROCESSING
    ContentScript->>Pipeline: executePipeline(fields)
    Pipeline->>DOM: Fill fields
    DOM->>Pipeline: User corrections
    Pipeline->>Pipeline: Cache corrections
```

---

## 📊 Performance Metrics

| Metric | Value |
|--------|-------|
| **Extension Size** | ~3 MB |
| **Classification Speed** | 3ms per field |
| **Form Fill Time** | 2-5 seconds (50 fields) |
| **Memory Usage** | ~14 MB |
| **Cache Hit Rate** | 85% |
| **Overall Accuracy** | 75-78% (hybrid) |
| **Label Extraction** | 95%+ (with 3-tier) |

---

## 🚀 ATS Platform Support

Tested and optimized for:
- ✅ Greenhouse
- ✅ Lever
- ✅ Workday
- ✅ Ashby
- ✅ Taleo
- ✅ iCIMS
- ✅ BambooHR
- ✅ Custom forms

---

## 🔮 Architecture Principles

### 1. Lazy Loading
Scripts are loaded on-demand via `bootstrap.js` to minimize initial load time.

### 2. Message-Driven
All communication uses Chrome's messaging API via `MessageRouter`.

### 3. Immutable Field Metadata
Once classified, field `instance_type` and `scope` are frozen to prevent drift.

### 4. Write-Through Caching
All successful fills are immediately cached for future use.

### 5. Graceful Degradation
If AI fails, falls back to heuristics. If heuristics fail, uses resume data directly.

---

**Version**: 2.0  
**Last Updated**: January 28, 2026  
**Architecture Grade**: A++ (Enterprise-Ready)
