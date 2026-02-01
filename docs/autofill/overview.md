# Autofill System - Complete Overview

The SmartHireX autofill system uses a **Neural-Heuristic Hybrid Engine** to automatically detect, classify, and fill job application forms with high accuracy and stealth.

## 🏗️ System Architecture

```text
┌──────────────────────────────────────────────────────────┐
│               AUTOFILL SYSTEM ARCHITECTURE               │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  [Job Form] ──► [Detector] ──► [Feature Extraction]      │
│                                       │                  │
│                   ┌───────────────────┴──────────────┐   │
│                   ▼                                  ▼   │
│           [Heuristic Engine]                 [Neural V8] │
│                   │                                  │   │
│                   └───────────────────┬──────────────┘   │
│                                       ▼                  │
│                              [5-Tier Arbitration]        │
│                                       │                  │
│                ┌──────────────────────┴────────────────┐ │
│                ▼                                       ▼ │
│         (Cached Result)                         (New Result) │
│                │                                       │ │
│                ▼                                       ▼ │
│         [Load from Cache]                       [Profile Data] │
│                │                                       │ │
│                └──────────────────────┬────────────────┘ │
│                                       ▼                  │
│                               [Execution Engine]         │
│                                       │                  │
│                               [Interaction Log]          │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

---

## 🧩 Component Breakdown

### 1. Field Detection
**Purpose**: Identify all fillable fields (including Shadow DOM & Iframes).

```javascript
// Scan DOM for interactable fields
const scanner = new AutofillScanner();
const fields = scanner.scan(document.body);

// Each field contains:
// - HTML attributes (id, name, type)
// - Semantic signals (label, placeholder)
// - Visual context (nearby text nodes)
```

### 2. Classification (Hybrid)

#### HeuristicEngine (Primary - 77.87%)
- **Method**: Chrome-inspired Regex patterns + Keyword analysis.
- **Speed**: Extremely fast (< 1ms).
- **Details**: [heuristic-engine.md](./heuristic-engine.md)

#### NeuralClassifier (Backup - 65.22%)
- **Method**: 87-class Sigmoid Neural Network.
- **Speed**: ~3ms.
- **Details**: [neural-classifier.md](./neural-classifier.md)

### 3. Data Retrieval & Strategy

```text
┌──────────────────────────────────────────────────────────┐
│                   DATA RETRIEVAL STRATEGY                │
├──────────────────────────────────────────────────────────┤
│                                                          │
│   [Field Type] ────► ┌────────────────────┐              │
│                      │   Profile Lookup   │              │
│                      └─────────┬──────────┘              │
│                                │                         │
│                  ┌─────────────┴─────────────┐           │
│                  ▼                           ▼           │
│            [Value Found]               [Missing Value]   │
│                  │                           │           │
│                  ▼                           ▼           │
│            [Format Data]               [Prompt User]     │
│                  │                           │           │
│                  └─────────────┬─────────────┘           │
│                                ▼                         │
│                         [Autofill Inject]                │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### 4. High-Fidelity Injection
**Strategy**: Stealth value injection to bypass framework trackers (React/Angular).

```javascript
// Stealth setter to bypass Virtual DOM trackers
const nativeSetter = Object.getOwnPropertyDescriptor(
  window.HTMLInputElement.prototype, 'value'
).set;
nativeSetter.call(field, value);
field.dispatchEvent(new Event('input', { bubbles: true }));
```

---

## 📊 Performance & Accuracy

| Metric | Current Status | Target |
|:---|:---:|:---:|
| **Overall Accuracy** | **78.50%** | 90% |
| **Classification Speed** | **~3ms** | < 5ms |
| **Cache Hit Rate** | **85%** | 90% |

### 🎯 Accuracy benchmarks

| Engine | Confidence | Accuracy |
| :--- | :---: | :---: |
| **HeuristicEngine** | HIGH | 77.87% |
| **Neural V8** | MEDIUM | 65.22% |
| **Hybrid Ensemble** | **ELITE** | **78.50%** |

---

## 🔄 End-to-End Sequence

```text
┌────────┐      ┌────────────┐      ┌─────────────┐      ┌─────────┐
│  USER  │      │ EXTENSION  │      │ CLASSIFIER  │      │ MEMORY  │
└───┬────┘      └─────┬──────┘      └─────┬───────┘      └───┬─────┘
    │   Page Load     │                   │                  │
    │────────────────►│    Scan Page      │                  │
    │                 │──────────────────►│                  │
    │                 │                   │                  │
    │                 │   Classify Field  │                  │
    │                 │◄──────────────────│                  │
    │                 │                   │                  │
    │                 │    Check Cache    │                  │
    │                 │─────────────────────────────────────►│
    │                 │                   │                  │
    │                 │    Get Profile    │                  │
    │                 │◄──────────────────│                  │
    │                 │                   │                  │
    │   Autofilled    │    Inject Value   │                  │
    │◄────────────────│──────────────────►│                  │
    │                 │                   │                  │
    │                 │    Store Learn    │                  │
    │                 │─────────────────────────────────────►│
┌───┴────┐      ┌─────┴──────┐      ┌─────┴───────┐      ┌───┴─────┘
│  USER  │      │ EXTENSION  │      │ CLASSIFIER  │      │ MEMORY  │
└────────┘      └────────────┘      └─────────────┘      └─────────┘
```

---

## 📂 Project Structure

```text
autofill/
├── domains/
│   ├── inference/
│   │   ├── HeuristicEngine.js       (Pattern matching logic)
│   │   ├── neural-classifier.js     (AI inference)
│   │   └── FieldTypes.js            (Categorization)
│   │
│   ├── cache/
│   │   ├── cache-manager.js         (Orchestration)
│   │   └── storage-adapter.js       (Chrome Storage)
│   │
│   └── filling/
│       ├── field-filler.js          (Injection engine)
│       └── form-detector.js         (Signal extraction)
```

---

## 🔒 Privacy & Security
- **Local-Only**: All classification happens locally in the browser.
- **Encryption**: User data is encrypted at rest using Chrome's secure storage.
- **Control**: Users have full control over data clearing and incognito behavior.

---

## 📈 Roadmap
- [ ] Multi-language support (Q1 2026)
- [ ] Visual feature extraction (position, size)
- [ ] Active learning from user corrections
- [ ] Transformer-based neural architecture (LLM fallback)

**Last Updated**: February 1, 2026  
**Status**: Production Ready
