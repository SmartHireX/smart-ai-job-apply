# 🏛️ Smart HireX Architecture & Execution Flow

## 🌟 Philosophy: The "FANG-Level" Standard
This project is not just a script; it is an **Enterprise-Grade State Engine** designed to rival the sophistication of Google Autofill and Apple's On-Device Intelligence.

We adhere to three core principles:
1.  **Zero Bloat**: No heavy dependencies. We implement our own Math Kernels (TinyML) and use native browser APIs (CompressionStream).
2.  **Privacy First**: Data is Encrypted (Base64+Salt), Local-Only (No Cloud Sync), and Differential (Anonymous Reporting).
3.  **Self-Healing**: The system learns from its mistakes via "Shadow Validation" (Reinforcement Learning).

---

## 💾 The 2-Tier Data Architecture
We have simplified the system from 3 disconnected caches into **2 Semantic Tiers**:

### Tier 1: Immutable Profile (`HistoryManager`)
*   **Source**: Your Resume / User Profile.
*   **Role**: The "Source of Truth". Contains structured, static data (Job History, Education, Address).
*   **Update Policy**: Read-Only during filling. Updates only when User explicitly edits their profile settings.

### Tier 2: Adaptive Memory (`UnifiedCache`)
*   **Source**: User Actions & Real-time corrections.
*   **Role**: The "Short-term Memory". Remembers that for *this specific form*, you prefer "Remote" over "Hybrid".
*   **Sub-Module**: `SelectionCache` (Now merged conceptually). Handles the specific logic of validating Dropdown Options against memory.
*   **Update Policy**: Write-Through. Updates instantly every time we fill a field or the user checks a box.

---

## 📊 System Architecture Diagram

```mermaid
graph TD
    User((User)) -->|Click Auto-Fill| Sidebar[Sidebar UI]
    Sidebar -->|Msg: FILL_PAGE| Orch[Orchestrator]
    
    subgraph Scanning ["🔵 Scanning & Vision"]
        Orch --> Scanner[FormScanner]
        Orch --> Sections[SectionDetector]
        Scanner -->|Fields| Feat[FeatureExtractor]
        Sections -->|Context| Feat
        Feat -->|Vectors| Neural[NeuralClassifier]
        Neural -->|Classified Fields| Router[FieldRouter]
    end

    subgraph Decision ["🟣 Decision Engine"]
        Router -->|Check key| Tier2[Tier 2: UnifiedCache]
        Router -->|Check index| Tier1[Tier 1: HistoryManager]
        Tier2 -->|Hit| Queue[ActionQueue]
        Tier1 -->|Hit| Queue
        Tier2 -->|Miss| Batch[BatchProcessor]
    end

    subgraph Execution ["🔴 Execution & Learning"]
        Batch -->|LLM Request| Gemini[Gemini 1.5 Flash]
        Gemini -->|Response| Save[Write-Through Save]
        Save -->|Update| Tier2
        Save -->|Fill| Queue
        Queue -->|Type| DOM[Web Page]
        
        DOM -.->|User Correction| Shadow[ShadowValidator]
        Shadow -->|Reinforcement| Tier2
    end
```

---

## 🟢 1. Initialization Phase (`Load`)
**Goal**: Prepare the environment when the user visits a job page.

1.  **Injection**: Chrome reads `manifest.json`.
    *   **File**: `manifest.json`
    *   **Action**: Injects `content/content.js` and all service scripts into the page.
2.  **Boot**: The `StateManager` wakes up.
    *   **File**: `content/core/state-manager.js`
    *   **Action**: Checks if the sidebar should be open. Restores previous session state.
3.  **Cache Hydration**: The `UnifiedCacheManager` loads data from disk.
    *   **File**: `content/services/cache/cache-manager.js`
    *   **Action**: Reads `chrome.storage.local`, decrypts Base64 data, decompresses (Gzip), and warms up the in-memory cache.

---

## 🟡 2. Trigger Phase (`User Action`)
**Goal**: Start the filling process.

1.  **Event**: User clicks "Auto-Fill" on the Sidebar.
2.  **Command**: The UI sends a message to the Orchestrator.
    *   **File**: `content/core/orchestrator.js`
    *   **Action**: `handleFillRequest()` is called. It acts as the "General," coordinating all other services.

---

## 🔵 3. Scanning & Analysis Phase (`The "Eyes"`)
**Goal**: Understand what is on the screen.

1.  **Form Detection**: Find input fields.
    *   **File**: `content/services/extraction/form-detection.js`
    *   **Action**: Scans the DOM for `<input>`, `<select>`, `<textarea>`. Ignores hidden/irrelevant fields.
2.  **Section Detection**: Understand context.
    *   **File**: `content/services/extraction/section-detector.js`
    *   **Action**: Looks for headers like "Education", "Experience". Uses heuristics (font size, keywords) to group fields into sections.
3.  **Feature Extraction**: Vectorize fields for AI.
    *   **File**: `content/services/ai/feature-extractor.js`
    *   **Action**: Converts a field like `<input id="fname">` into a mathematical vector `[0.1, 0.5, ...]`.
4.  **Classification**: Identify field types.
    *   **File**: `content/services/ai/neural-classifier.js`
    *   **Action**: The TinyML engine runs inference. Logic: *"This field is next to 'Last Name', effectively labeled 'First Name'. I predict it is `first_name` with 99% confidence."*

---

## 🟣 4. Decision Phase (`The "Brain"`)
**Goal**: Decide *where* to get the data from.

1.  **Routing**: The `FieldRouter` takes the classified field and asks: "Who handles this?"
    *   **File**: `content/field-router.js`
    *   **Action**:
        *   If it's a simple text field (Name, Email) -> **Tier 2: UnifiedCache**.
        *   If it's complex (Bio, "Why do you fit?") -> **AI Generation**.
        *   If it's structured (Job History) -> **Tier 1: HistoryManager**.
2.  **Cache Lookup**: Check memory first.
    *   **File**: `content/services/cache/cache-manager.js`
    *   **Action**: `get(field)`. Checks Semantic Signature `sig_v1|context|label`.
        *   **Hit**: Returns decrypted value immediately.
        *   **Miss**: Marks field for AI generation.

---

## 🔴 5. Execution Phase (`The "Hands"`)
**Goal**: Fill the fields and handle complex logic.

1.  **Batch Processing**: Bundle AI requests.
    *   **File**: `content/services/ai/batch-processor.js`
    *   **Action**: Instead of 10 API calls, it groups 10 missing fields into ONE request to the LLM (Gemini/GPT). "Generate answers for [Bio, Cover Letter, Skills]".
2.  **History Matching**: Fill repetitive data.
    *   **File**: `content/services/cache/history-manager.js`
    *   **Action**: Maps "Job 1" on Resume to "Employment History Block 1" on the form.
3.  **Physical Filling**: Type into the page.
    *   **File**: `content/core/action-queue.js`
    *   **Action**: Safely mimics user typing (`input` events, `change` events) to trigger website validation scripts. Prevents "clumsy" errors.

---

## 🟠 6. Learning Phase (`The "Self-Correction"`)
**Goal**: Improve over time.

1.  **Monitoring**: Watch for user edits.
    *   **File**: `content/services/cache/cache-manager.js` (Shadow Validation)
    *   **Action**: If the user deletes "Engineer" and types "Developer", the system catches this change.
2.  **Reinforcement**: Update confidence.
    *   **Action**: Calls `learnCorrection()`. "Engineer" gets downvoted (punished). "Developer" gets cached with High Confidence.
3.  **Compression**: Save state efficiently.
    *   **Action**: Runs `CompressionStream` (Gzip) in `requestIdleCallback` to save the new "brain" to disk without lagging the UI.

---
*Generated by Antigravity Agent*

## 🔮 Roadmap: Future "Google-Level" Improvements

Based on deep analysis of Chrome's internal architecture and modern AI Agent patterns, here are the next steps to reach "State of the Art":

### 1. Accessibility Tree (AXTree) Analysis
*   **Current**: We scan the DOM (`querySelector`).
*   **Limitation**: React/Angular/ShadowDOM often hide real inputs or use non-semantic `<div>`s.
*   **Upgrade**: Use the **Accessibility Tree**. This is how Screen Readers (and Google Autofill) see the page. It ignores visual fluff and sees "This is a Text Field labelled 'Name'", regardless of HTML structure.

### 2. Predictive Prefetching (`prefetch-engine.js`)
*   **Concept**: Don't wait for the click.
*   **Strategy**: When the `FormScanner` detects a job page, **immediately** spin up a background thread to:
    1.  Extract the Job Description.
    2.  Ask the LLM: *"What are the likely 'Gotcha' questions for this role?"*
    3.  Generate draft answers.
*   **Result**: Zero-latency filling when the user finally clicks.

### 3. Multi-Frame "Message Bus"
*   **Problem**: Enterprise forms (Workday, Taleo, Greenhouse) often embed the actual application in an `<iframe>` (Cross-Origin).
*   **Solution**: Implement a `Window.postMessage` bus where the "Main Extension" (Parent) acts as a Server, and each "Frame Script" (Child) acts as a Client. The Parent holds the Memory; the Children hold the Fields.

### 4. Differential Privacy (RAPPOR)
*   **Concept**: Google uses "Randomized Response" to track which fields fail the most without knowing *who* failed.
*   **Upgrade**: When a user corrects a field, we send a hashed report: `{ url_hash: "a1b2", field_hash: "x9y8", success: false }` + random noise. This allows us to build a global map of "Hard Forms" without tracking users.

### 5. Visual Proximity Analysis (Gestalt Heuristics)
*   **Problem**: Some fields have no code labels, only visual labels (text next to input).
*   **Solution**: Implement a "Vision" layer that calculates pixel distance (BoundingBox).
*   **Algorithm**: "If text 'Phone' is within 50px left or top of <input>, associate them." (Based on Gestalt Principles of Proximity).

### 6. Deep DOM Structural Analysis
*   **Problem**: Modern React apps use deeply nested `<div>` structures that look like random noise.
*   **Solution**: Flatten the DOM Tree into a "Zone Tree". Identify repeating patterns (e.g., 3 identical blocks = "Work History").
*   **Benefit**: Allows detection of complex sections even without standard headers.
