# 💾 SmartHireX Cache & Persistence System

## 🧠 Overview: The Persistent Memory Layer
SmartHireX implements a sophisticated, multi-tier persistence layer that transforms it from a static autofiller into a dynamic learning agent. The system observes user interactions, classifies data into semantic categories, and securely persists it across sessions.

---

## 🏗️ 3-Bucket Architecture
At the core of the persistence layer is the **3-Bucket Model**. Fields are not stored in a flat list; instead, they are routed to specific buckets based on their behavioral profile and data complexity.

```text
┌───────────────────────────────────────────────────────────────────┐
│                    CACHE ORCHESTRATION ARCHITECTURE               │
├───────────────────────────────────────────────────────────────────┤
│                                                                   │
│  [Interaction] ───► [Semantic Classifier] ───► [Vault Router]     │
│                                                   │               │
│         ┌──────────────────┬──────────────────────┴┐              │
│         ▼                  ▼                       ▼              │
│  ┌──────────────┐   ┌──────────────┐       ┌──────────────┐       │
│  │ ATOMIC SINGLE│   │ ATOMIC MULTI │       │ SECTION REP. │       │
│  ├──────────────┤   ├──────────────┤       ├──────────────┤       │
│  │ Scalar Data  │   │ Set-Based    │       │ Row-Based    │       │
│  │ (Phone/Email)│   │ (Skills/Langs)       │ (Jobs/Edu)   │       │
│  └──────┬───────┘   └──────┬───────┘       └──────┬───────┘       │
│         │                  │                      │               │
│         └──────────────────┼──────────────────────┘               │
│                            ▼                                      │
│                 [Encryption Service (AES)]                        │
│                            │                                      │
│                            ▼                                      │
│                 [Chrome Storage / Vault]                          │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
```

### 1. ATOMIC_SINGLE (Scalar Values)
*   **Purpose**: Stores one-to-one, singular data points.
*   **Data Model**: `{ key: { value: "...", confidence: 0.9, lastUsed: timestamp } }`
*   **Routing Logic**: Used for fields where a single "Correct" answer exists (e.g., `first_name`, `email`, `linkedin_url`).
*   **Resolution Strategy**: If a user corrects a value, the system updates the entry and increments the `useCount`.

### 2. ATOMIC_MULTI (Collections)
*   **Purpose**: Stores sets of values where multiple entries are additive.
*   **Data Model**: `{ key: Set<String> }`
*   **Routing Logic**: Used for fields where multiple choices are valid simultaneously (e.g., `skills`, `interests`, `languages`).
*   **Resolution Strategy**: Values are added to the existing set (deduplicated).

### 3. SECTION_REPEATER (Row-Based)
*   **Purpose**: Stores complex, structured data that repeats in "Rows".
*   **Data Model**: `{ section_key: [ { field_a: val, field_b: val }, ... ] }`
*   **Routing Logic**: Used for Work Experience, Education, and Certifications.
*   **Resolution Strategy**: Uses `field_index` to map DOM elements to specific array indices, preserving row-level integrity.

---

## 🔄 The Learning Loop: Cache Key Matching
SmartHireX uses the `KeyMatcher` engine to bridge the gap between site-specific labels (e.g., "Enter your Mail", "E-mail Address") and global canonical keys (`email`). This process is known as **Cache Key Matching**.

### 📐 The Algorithm: Weighted Jaccard Similarity
We utilize the **Weighted Jaccard Similarity** algorithm because traditional string matching (like Levenshtein distance) fails on semantic variations. 

#### Why Jaccard Similarity?
*   **Set-Based Comparison**: Jaccard compares sets of tokens rather than character sequences, making it robust against word-order changes (e.g., "First Name" vs "Name First").
*   **Semantic Robustness**: By splitting labels into tokens and applying weights, we focus on the "Signal" (e.g., `phone`) while ignoring the "Noise" (e.g., `please`).
*   **Intersection Over Union (IoU)**: It provides a clean 0 to 1 score representing the overlap between the current field signals and our stored knowledge.

**The Formula**:
```text
Similarity(A, B) = Σ Weight(Intersection Tokens) / Σ Weight(Union Tokens)
```
Where `A` is the set of tokens from the field label and `B` is the set of tokens from a cached key.

### 🛣️ Algorithm Pipeline Diagram
```text
┌───────────────────────────────────────────────────────────────────┐
│                    ALGORITHM EXECUTION FLOW                       │
├───────────────────────────────────────────────────────────────────┤
│                                                                   │
│  [Raw Label] ────┐                                                │
│                  ▼                                                │
│  [Tokenization] ─► Split by underscores/spaces                    │
│                  │                                                │
│  [Normalization] ─► lowercase(), strip_special_chars()            │
│                  │                                                │
│  [Stemming]      ─► employment → employ, education → educat       │
│                  │                                                │
│  [Expansion]     ─► zip → postal, telephone → phone               │
│                  │                                                │
│  [Weighting]     ─► salary (3.0), phone (3.0), first (3.0)        │
│                  │  please (0.2), enter (0.2), select (0.2)      │
│                  ▼                                                │
│  [Similarity]    ─► Match Found! (Score > 0.70)                   │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
```

### 💡 Matching Example: "Work Phone" vs "phone_number"
To clarify how SmartHireX matches keys, consider a field with the label **"Primary Work Phone"**:

1.  **Tokenization**: `["primary", "work", "phone"]`
2.  **Weighting**:
    *   `phone`: **3.0** (High Signal)
    *   `work`: **1.0** (Standard)
    *   `primary`: **0.5** (Low Signal)
3.  **Comparison**: The engine compares these tokens against the cached key `phone_number` (`tokens: ["phone", "number"]`).
4.  **Result**: Because `phone` matches perfectly and carries a high weight, the similarity score exceeds **0.70**, resulting in a successful cache hit even though the keys are not identical.

---

**Key Features**:
*   **Token Stemming**: Reduces `employment` and `employer` to the same root (`employ`).
*   **Synonym Expansion**: Maps `zip` to `postal` and `telephone` to `phone` using `SYNONYM_MAP`.
*   **Weighted Tokens**: Priority tokens (`TOKEN_WEIGHTS`) carry more weight than noise tokens.

---

## 🔒 Security & Persistence Details

### Storage Layers
1.  **Vault Memory**: Active cache stored in `StorageVault` (accessible to the background and content scripts).
2.  **Chrome Storage Local**: Persistent storage for predictions and session state.
3.  **Encrypted Profiles**: Personal profile data is encrypted at rest using AES-256-GCM.

### Quality Guards
The `GlobalMemory.isCacheable()` service prevents memory noise by filtering out:
*   **Short Labels**: Minimum length requirements.
*   **Generic Values**: "Yes/No", "True/False" are not cached as global facts.
*   **Number Heavy**: Prevents caching of purely numerical IDs as semantic labels.

---

## 📁 Technical Glossary

| Key | Implementation | Role |
|:---|:---|:---|
| `InteractionLog` | `InteractionLog.js` | The "Hippocampus" - tracks all user selections and corrections. |
| `GlobalMemory` | `GlobalMemory.js` | The manager for `ATOMIC_SINGLE` data consistency and quality. |
| `KeyMatcher` | `InteractionLog.js` | The fuzzy logic core for semantic alignment. |
| `StorageVault` | Core Infrastructure | Multi-bucket abstraction layer over Chrome Storage. |

---

## 🛠️ API Reference (Internal)

#### Get Cached Value
```javascript
const result = await InteractionLog.getCachedValue(field, label);
// Returns: { value, confidence, source, semanticType }
```

#### Resolve Global Batch
```javascript
const batchResults = await GlobalMemory.resolveBatch(fields);
// Optimized batch lookup for ATOMIC_SINGLE fields
```

---
**Version**: 2.2  
**Status**: [ENTERPRISE READY]
