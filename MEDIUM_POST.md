# Under the Hood: Engineering a High-Performance AI Autofiller for Enterprise Forms 🚀

Building a browser extension that accurately fills complex enterprise job forms (Workday, Greenhouse, Ashby) is an exercise in managing DOM entropy. Most "AI" fillers rely on naive scraping and brittle CSS selectors. 

With **Nova Apply**, we took a different path: building a multi-layered orchestration pipeline that combines local neural inference, structural heuristics, and reactive DOM management. Here is the technical breakdown of how we solved the "Form Fatigue" problem at the architectural level.

---

## 🏗️ The Core Architecture: A Reactive Pipeline

Job portals are moving targets. They are built with modern SPA frameworks (React, Angular) that frequently re-render, detaching elements and breaking standard scripts. Nova Apply operates on an asynchronous 5-phase lifecycle:

1.  **Discovery via MutationObservers**: We don't just "run on load." We attach a `MutationObserver` and URL change listeners to detect late-loading forms and SPA page transitions in real-time.
2.  **Structural Scouting**: The `AutofillScanner` traverses the DOM in visual order, generating 95-feature vectors (86 keyword-based + 9 structural) for every interactable node.
3.  **Hybrid Ensemble Arbitration**: Our classification engine isn't a single model. It’s an ensemble of a local **Neural V8 model**, a regex-based **Heuristic Engine**, and an **AI Resolver (Gemini Flash)**.
4.  **Semantic Memory Mapping**: Decisions are indexed against a 3-tier cache (`ATOMIC_SINGLE`, `ATOMIC_MULTI`, `SECTION_REPEATER`) stored in an encrypted local vault.
5.  **Atomic Injection**: We bypass the browser's standard `.value` setter and re-dispatch native `input` and `change` events to ensure that modern framework state managers (like Redux or Formik) recognize the data.

---

## 🧠 The Neural V8 Engine: Multi-Label Inference

Our previous versions used a Softmax-based model, which struggled when a field could theoretically map to two categories (e.g., "Company" vs "Employer"). In V8, we pivoted to a **Multi-Label Sigmoid** architecture.

**Technical Specs:**
*   **Topology**: Input(95) → Dense(256/LeakyReLU) → Dense(128/LeakyReLU) → Dense(87/Sigmoid).
*   **Why LeakyReLU?**: We chose LeakyReLU over standard ReLU to prevent the "Dying ReLU" problem, ensuring that neurons in our deep layers stay active even with sparse feature sets.
*   **Local Inference**: The entire math kernel is hand-optimized in Vanilla JS, achieving sub-10ms inference times directly in the browser's main thread without blocking the UI.
*   **Ensemble Vetoes**: Heuristics act as a "Hard Veto" layer. If a field's HTML type is `tel`, the Neural model cannot override it with a `name` classification, preventing 99% of hallucination errors.

---

## 💾 Security by Architecture: The Encrypted Vault

Privacy isn't just a marketing point; it’s a technical constraint. Nova Apply implements a **Zero-Sync, Local-First** storage policy.

*   **AES-GCM Encryption**: All PII (Personally Identifiable Information) and API keys are stored in a `StorageVault` using industry-standard AES-GCM encryption.
*   **AAD (Additional Authenticated Data)**: We use the Chrome Extension's unique Internal ID as AAD during the encryption process. This ensures that even if the database is exported, it cannot be decrypted outside the context of your specific local installation.
*   **Integrity Checks**: Every read from the local cache performs a cryptographic integrity check. If a single byte has been tampered with or corrupted, the vault fails closed rather than returning unsafe data.

---

## 🛠️ Solving the "Workday Problem": Deterministic Indexing

The hardest part of job applications is **Repeaters** (Work Experience rows). In these forms, the same label ("Company") appears multiple times.

We solved this using **Context-Aware Hashing**:
1.  We identify a "Section Header" (e.g., "Education").
2.  We generate an `instance_uid` by hashing the visual coordinates and sibling structure of the cluster.
3.  This allow us to deterministically map your "1st Job" to the "1st Form Row," even if the portal re-sorts them dynamically.

---

## 🚀 Conclusion: Engineering for Confidence

Nova Apply is more than just a script; it’s a robust system designed for the edge cases that break everything else. By combining the speed of local neural networks with the stability of structural heuristics, we’ve created a tool that understands not just the *label* of a field, but the *intent* behind the form.

**[Try the Technical Alpha on Github] · [Read the ARCHITECTURE.md]**

#WebPerf #NeuralNetworks #ChromeExtensions #PrivacyEngineering #SystemDesign
