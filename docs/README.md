# 📚 SmartHireX Documentation

## Quick Navigation

### 👤 For Users
| Guide | Description |
|-------|-------------|
| [Installation Guide](./guides/INSTALLATION.md) | How to install the Chrome extension |
| [Quick Start Guide](./guides/QUICK_START.md) | Get started in 5 minutes |

### 🛠️ For Developers

#### System Architecture
| Document | Description |
|----------|-------------|
| [**Architecture v2.0**](./architecture/ARCHITECTURE.md) | Complete system design, pipeline flow, and enterprise patterns |
| [Authentication Flow](./architecture/AUTH_FLOW.md) | How API key authentication works |
| [Performance Roadmap](./architecture/performance_improvement_roadmap.md) | Future optimization plans |

#### Autofill System
| Document | Description |
|----------|-------------|
| [System Overview](./autofill/overview.md) | Complete autofill architecture and integration |
| [Neural Classifier](./autofill/neural-classifier.md) | Deep learning model (65.22% accuracy) |
| [Heuristic Engine](./autofill/heuristic-engine.md) | Pattern matching (77.87% accuracy) |
| [Cache System](./autofill/cache-system.md) | Caching strategy and performance |

---

## 🏗️ Architecture Overview

SmartHireX v2.0 uses enterprise-grade patterns:

### 3-Tier Label Extraction
Based on Chrome Autofill, 1Password, and LastPass research:

```
TIER 1: Explicit HTML (100% confidence)
├── autocomplete, element.labels, label[for]
└── aria-labelledby, aria-label, aria-describedby

TIER 2: Semantic Hints (80-95% confidence)
├── data-label, data-testid
├── fieldset legend, table headers
└── placeholder, title

TIER 3: Visual Heuristics (40-70% confidence)
├── Structural boundary search
└── Previous sibling, parent text
```

### Pipeline Architecture
```
PipelineOrchestrator
    ↓
┌─────────────────────────────────────────────────┐
│ 1. INGEST    →  Form detection + ML enrichment  │
│ 2. GROUP     →  ATOMIC/SECTION classification   │
│ 3. RESOLVE   →  Memory → Rules → AI            │
│ 4. EXECUTE   →  Fill + Cache + Human jitter    │
└─────────────────────────────────────────────────┘
```

### Key Components
| Component | Role |
|-----------|------|
| `PipelineOrchestrator` | Central nervous system - coordinates all operations |
| `FormDetector` | 3-tier label extraction engine |
| `HybridClassifier` | Ensemble of Heuristic + Neural classifiers |
| `InteractionLog` | User action memory and caching |
| `RuleEngine` | Resume data to form field matching |
| `ExecutionEngine` | Human-like form filling |

---

## 📁 Documentation Structure

```
docs/
├── README.md                    (This file - Navigation hub)
│
├── guides/                      (User documentation)
│   ├── INSTALLATION.md         (Installation instructions)
│   └── QUICK_START.md          (Getting started guide)
│
├── architecture/                (System design)
│   ├── ARCHITECTURE.md         (v2.0 Enterprise Architecture)
│   ├── AUTH_FLOW.md            (Authentication process)
│   └── performance_improvement_roadmap.md
│
└── autofill/                    (Technical documentation)
    ├── overview.md             (System overview)
    ├── neural-classifier.md    (ML model documentation)
    ├── heuristic-engine.md     (Pattern matcher docs)
    └── cache-system.md         (Caching strategy)
```

---

## 🔍 Quick Reference

| I want to... | Read this |
|--------------|-----------|
| Install the extension | [Installation Guide](./guides/INSTALLATION.md) |
| Use the extension | [Quick Start](./guides/QUICK_START.md) |
| Understand the system | [Architecture v2.0](./architecture/ARCHITECTURE.md) |
| Learn how autofill works | [Autofill Overview](./autofill/overview.md) |
| Deep dive into ML model | [Neural Classifier](./autofill/neural-classifier.md) |
| Understand patterns | [Heuristic Engine](./autofill/heuristic-engine.md) |
| Optimize performance | [Cache System](./autofill/cache-system.md) |

---

## 📊 Key Metrics

| Metric | Value |
|--------|-------|
| Classification Accuracy | 75-78% (hybrid) |
| Label Extraction Accuracy | 95%+ (3-tier) |
| Classification Speed | 3ms per field |
| Cache Hit Rate | 85% |
| Form Fill Time | 2-5 seconds |

---

## 🔑 Key Concepts

### Enterprise-Grade Label Extraction
The system uses the same priority order as Chrome Autofill: explicit HTML associations are checked BEFORE visual heuristics. This dramatically improves accuracy on well-structured forms.

### Hybrid AI Classification
Two classifiers (Heuristic + Neural) work together with 5-tier confidence arbitration to maximize accuracy while maintaining 100% coverage.

### Self-Learning Memory
The InteractionLog remembers user corrections and preferences, improving accuracy over time without any cloud sync.

---

**Version**: 2.0  
**Last Updated**: January 28, 2026
