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

### Technical Specification:
*   **Vector Composition (Input 95)**: We distill every DOM node into a 95-dimension vector.
    *   **86 Semantic Features**: Boolean flags for keyword proximity (mapped from a normalized dictionary).
    *   **9 Structural Features**: Encoded signals including heading proximity, preceding syntax (Question/Colon detection), group sequence (isFirstInGroup), and historical transition probabilities.
*   **Topology**: Input(95) → Dense(256/LeakyReLU) → Dense(128/LeakyReLU) → Dense(87/Sigmoid).
*   **Zero-Dependency Math Kernel**: To minimize bundle size and overhead, we implemented a custom matrix-math kernel in Vanilla JS. By avoiding heavy libraries like TensorFlow.js for inference, we achieved sub-1ms computation on the primary feature vector and sub-10ms total latency for the entire classification cycle.

---

## ⚖️ The 5-Tier Hybrid Arbitration Matrix

Classification isn't just about the "highest score." We use a tiered decision matrix to handle the edge cases where AI might hallucinate or Heuristics might be too rigid.

1.  **Unanimous Agreement**: If both Neural V8 and Heuristics identify the same label, confidence is boosted to 99% (Deterministic Win).
2.  **Strong Heuristic Override**: For high-trust fields (Email/Phone), heuristics win if confidence > 95%.
3.  **Neural Margin Enforcement**: To prevent "confused" classifications, a Neural prediction only wins if it maintains a **15% minimum margin** over the second-best class likelihood.
4.  **Weighted Conflict Resolution**: We identify "Conflict Groups" (e.g., *Current Salary* vs *Expected Salary*). In these cases, we use a weighted scoring system that penalizes Neural predictions that violate HTML type constraints (e.g., predicting 'Name' for a `type="tel"` field).
5.  **Fallback to LLM**: If the local ensemble is split or confidence is below the **0.35 calibrated threshold**, the field is routed to our **Gemini Flash Resolver** for high-context synthesis.

---

## 🛠️ Reactive DOM Management: Atomic Injection

Filling a form in 2024 isn't as simple as `element.value = "John"`. Modern frameworks (React, Vue, Svelte) track state in virtual DOMs that often ignore direct property mutations.

We solved this with **Atomic Injection**:
*   **Native Event Dispatching**: After setting values, we trigger a sequential blast of `input`, `change`, and `blur` events using `dispatchEvent(new Event('input', { bubbles: true }))`.
*   **Human Jitter Emulation**: We apply a randomized 30ms-150ms "jitter" between field fills. This bypasses naive bot-detection and ensures that the page's event-loop can keep up with the data injection without crashing.
*   **Self-Healing Observers**: If a framework re-renders a component and replaces the DOM node, our `MutationObserver` detects the "Detached Element" and automatically re-binds the injection to the new node.

## 💾 Security by Architecture: The Encrypted Vault

Privacy isn't just a marketing point; it’s a technical constraint. Nova Apply implements a **Zero-Sync, Local-First** storage policy.

*   **AES-GCM Encryption**: All PII (Personally Identifiable Information) and API keys are stored in a `StorageVault` using industry-standard AES-GCM encryption.
*   **AAD (Additional Authenticated Data)**: We use the Chrome Extension's unique Internal ID as AAD during the encryption process. This ensures that even if the database is exported, it cannot be decrypted outside the context of your specific local installation.
*   **Integrity Checks**: Every read from the local cache performs a cryptographic integrity check. If a single byte has been tampered with or corrupted, the vault fails closed rather than returning unsafe data.

---

## 🧩 Fuzzy Semantic Matching (Jaccard Indexing)

Not every field explicitly lists "Java" in its underlying HTML `value`. Some use "JAVA_SPRING_BOOT" or "Core Java". 

We implemented a **Composite Resolver** that uses a custom fuzzy matching algorithm:
*   **Tokenization + Jaccard Index**: We tokenize both the target value (from your resume) and the candidate option (from the DOM). We then calculate the Jaccard similarity coefficient to handle multi-word matches.
*   **Levenshtein Typos**: For single-word tokens, we apply a Levenshtein distance check with a maximum edit distance of 1 to catch slight variations or typos in employer data.
*   **Semantic Conflict Prevention**: The matcher includes "Hard Negatives" (e.g., preventing "Man" from matching "Woman" or "Java" matching "JavaScript") to ensure demographic and technical accuracy.

---

## 🛡️ Infrastructure: The Redeclaration Shield

Browser extensions are notoriously prone to crashing or memory leaks during partial page reloads. We built a robust **Lifecycle & Config Guard** to handle these edge cases:

*   **Idempotent Loading**: Every core module is wrapped in a `typeof` guard (e.g., `if (typeof window.NovaConfig === 'undefined')`). This prevents "Redeclaration Errors" when an SPA triggers a full script injection multiple times on the same page.
*   **Safe-Global Registry**: Instead of polluting the `window` object with loose variables, all services are registered in a centralized `NovaLifecycle` map. This allows us to perform a clean "shutdown" and "reset" of observers whenever a user navigates between a job listing and an application form.

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
