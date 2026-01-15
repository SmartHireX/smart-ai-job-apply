# Documentation Index

## 📚 Quick Navigation

### User Guides
- **[Installation Guide](./guides/INSTALLATION.md)** - How to install the Chrome extension
- **[Quick Start Guide](./guides/QUICK_START.md)** - Get started in 5 minutes

### Technical Documentation

#### Autofill System
- **[Overview](./autofill/overview.md)** - Complete system architecture and integration
- **[Neural Classifier](./autofill/neural-classifier.md)** - Deep learning model (65.22% accuracy)
- **[HeuristicEngine](./autofill/heuristic-engine.md)** - Pattern matching (77.87% accuracy)
- **[Cache System](./autofill/cache-system.md)** - Performance optimization

#### Architecture
- **[System Architecture](./architecture/ARCHITECTURE.md)** - Complete system design and execution flow
- **[Authentication Flow](./architecture/AUTH_FLOW.md)** - How authentication works

---

## 🎯 Documentation by Role

### For Users
1. Start with [Installation Guide](./guides/INSTALLATION.md)
2. Read [Quick Start](./guides/QUICK_START.md)

### For Developers
1. Read [System Architecture](./architecture/ARCHITECTURE.md) first
2. Deep dive into [Autofill Overview](./autofill/overview.md)
3. Choose specific components:
   - Machine Learning → [Neural Classifier](./autofill/neural-classifier.md)
   - Pattern Matching → [HeuristicEngine](./autofill/heuristic-engine.md)
   - Performance → [Cache System](./autofill/cache-system.md)

### For Contributors
1. Understand the [Architecture](./architecture/ARCHITECTURE.md)
2. Review component docs in [autofill/](./autofill/)
3. Check [Authentication Flow](./architecture/AUTH_FLOW.md)

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
│   ├── ARCHITECTURE.md         (Complete architecture & flow)
│   └── AUTH_FLOW.md            (Authentication process)
│
└── autofill/                    (Technical documentation)
    ├── overview.md             (System overview)
    ├── neural-classifier.md    (ML model documentation)
    ├── heuristic-engine.md     (Pattern matcher docs)
    └── cache-system.md         (Caching strategy)
```

---

## 🔍 Find What You Need

| I want to... | Read this |
|--------------|-----------|
| Install the extension | [Installation Guide](./guides/INSTALLATION.md) |
| Use the extension | [Quick Start](./guides/QUICK_START.md) |
| Understand the system | [Architecture](./architecture/ARCHITECTURE.md) |
| Learn how autofill works | [Autofill Overview](./autofill/overview.md) |
| Deep dive into ML model | [Neural Classifier](./autofill/neural-classifier.md) |
| Understand patterns | [HeuristicEngine](./autofill/heuristic-engine.md) |
| Optimize performance | [Cache System](./autofill/cache-system.md) |
| Understand auth | [Auth Flow](./architecture/AUTH_FLOW.md) |

---

## 🚀 Key Concepts

### Hybrid AI Architecture
The autofill system uses a **dual-classifier approach**:
- **HeuristicEngine** (Primary): 77.87% accuracy via regex patterns
- **NeuralClassifier** (Backup): 65.22% accuracy via deep learning
- **Combined**: ~75-78% accuracy with 100% coverage

### Performance Metrics
- Classification: 3ms per field
- Full form (50 fields): 2-5 seconds
- Cache hit rate: 85%
- Model size: 2.5 MB

### Technology Stack
- Pure JavaScript neural network (no TensorFlow)
- 165+ regex patterns
- Chrome Storage API
- Mermaid diagrams throughout

---

**Last Updated**: January 16, 2026
