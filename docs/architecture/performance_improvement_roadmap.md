# Performance Improvement Roadmap: Hybrid Classifier (v3.0 Strategy)

**Current Status**: 83.30% Accuracy (Training Benchmark)
**Target**: >95% Accuracy (Production Grade)

## Executive Summary
The Hybrid Classifier has reached a stable baseline of 83% accuracy. The remaining error margin (17%) is primarily driven by **dataset quality issues** (legacy aliases vs canonical labels) and **ambiguous fields**. A three-phase optimization strategy is recommended.

---

## Phase 1: Data Quality & Canonicalization (High Impact)
**Estimated Gain**: +5-8% (Resolves 0% accuracy fields)

The benchmark revealed that fields like `address_line` and `salary_expected` have 0% accuracy because the training data uses non-standard labels (e.g., `address` instead of `address_line`).

### 1.1 Dataset Standardization
- **Action**: Run a one-time migration script on `train-dataset-v3.json` to permanently rename legacy labels to their `FieldTypes` canonical equivalents.
- **Goal**: Eliminate the need for `ALIAS_MAP` in benchmarks and inference.
- **Target Fields**: `address` -> `address_line`, `current_company` -> `company_name`, `salary` -> `salary_expected`, etc.

### 1.2 Label Cleaning
- **Action**: Audit the training data for mislabeled examples (e.g., specific `phone_home` labels that should just be `phone`).
- **Goal**: Reduce "confusing" samples that penalize model confidence.

---

## Phase 2: Advanced Feature Engineering (Medium Impact)
**Estimated Gain**: +3-5% (Improves ambiguous cases)

The current `FeatureExtractor` (V3) is **literal** (keywords, trigrams). It fails when words don't match exactly (Synonyms) or when context is needed (Ambiguity).

### 2.1 Semantic Embeddings (Contextual Understanding)
We can upgrade from matching *letters* to matching *meaning*.
- **Concept**: Map words to 3D space (`Salary` ≈ `Compensation`).
- **Implementation**: Integrate **TensorFlow.js** (Universal Sentence Encoder Lite).
- **Process**: Convert `field.label` -> 512-dim vector -> Project to 20 dims for Neural Input.
- **Benefit**: The model "understands" the intent regardless of phrasing.

### 2.2 Visual & DOM Features (Structural Hints)
Forms are visual structures. We can extract signals that humans subconsciously use:
| Feature | Why it matters |
|:---|:---|
| **`isVisible`** | Hidden fields are often honeypots. |
| **`inputType`** | `<input type="tel">` is a 99% strong signal for `phone`. |
| **`rect.top`** | Fields at the top are usually "Name/Search". |
| **`distanceToSubmit`** | Essential fields (Email, Password) are near the button. |

---

## Phase 3: Ensemble Stacking (Refinement)
**Estimated Gain**: +2-3% (Squeezes out final performance)

The current arbitration logic uses **static weights** (0.6 / 0.4), treating all fields equally.

### 3.1 The "Meta-Learner" Architecture
Instead of rigid `if/else` rules, we train a **Logistic Regression** manager.

1.  **Level 0 (Base Learners)**:
    - **Heuristic**: Prediction $H$, Confidence $C_h$
    - **Neural**: Prediction $N$, Confidence $C_n$
    
2.  **Level 1 (Meta-Learner)**:
    - **Input**: `[C_h, C_n, Agreement_Boolean, Category_ID]`
    - **Output**: Probability of $H$ being correct vs $N$.

### 3.2 Why it works better
- **Specialization**: It learns that "Neural is usually right about *Job Descriptions*, but Heuristic is better for *Emails*."
- **Calibration**: It learns to ignore "overconfident" components.
- **Robustness**: If one engine outputs 0 confidence, the weight shifts 100% to the other automatically.

---

## Immediate Action Plan

1.  **Run `standardize_dataset.js`**: Convert all training data to canonical labels.
2.  **Retrain Neural V7**: Train on the standardized clean dataset.
3.  **Benchmark**: Verify 0% fields jump to >80%.
4.  **Prototype TF.js**: Test embedding extraction performance in the browser.
