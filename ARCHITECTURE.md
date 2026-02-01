# Nova Apply - System Architecture 🏢

This document provides a high-fidelity technical overview of how Nova Apply orchestrates form analysis and intelligent autofilling.

---

## 1. The Inference Pipeline: Intelligence at the Edge 🧠

This diagram illustrates the real-time detection and classification lifecycle — moving from raw DOM mutations to a high-confidence semantic label.

```mermaid
flowchart TD
    %% Node Definitions
    Discovery([Form Discovery Trigger]) --> Signal
    
    subgraph Detection [Phase 1: Discovery & Observation]
        direction LR
        Signal{Mutation/URL Observer} -->|Scout Event| Scan[AutofillScanner]
        Scan -->|DOM Traversal| FeatureEx[ContextFeatureExtractor]
    end

    subgraph Inference [Phase 2: Hybrid Ensemble Arbitration]
        direction TB
        Orch{PipelineOrchestrator}
        
        subgraph Stack [Intelligence Stack]
            direction LR
            Heuristic[Heuristic Regex Engine]
            Neural[[Neural V8 Confirmation Model]]
            Gemini[[Gemini AI Resolver]]
        end

        FeatureEx --> Orch
        Orch --> Heuristic & Neural
        
        Heuristic --> Arb{Ensemble Arbiter}
        Neural --> Arb
        
        Arb -- "Unanimous / Weighted Win" --> Label([Final Semantic Label])
        Arb -- "Ambiguity / Low Conf" --> Gemini
    end

    Gemini --> Label

    %% Styling
    style Trigger fill:#f8fafc,stroke:#94a3b8,color:#1e293b
    style Orch fill:#6366f1,stroke:#4338ca,color:#fff,stroke-width:2px
    style Neural fill:#10b981,stroke:#059669,color:#fff
    style Gemini fill:#8b5cf6,stroke:#7c3aed,color:#fff
    style Label fill:#1f2937,stroke:#111827,color:#fff,stroke-width:2px
    
    linkStyle default stroke:#cbd5e1,stroke-width:1px
    linkStyle 5,6,7 stroke:#6366f1,stroke-width:2px,color:#6366f1
```

---

## 2. The Execution Loop: Memory & Persistence 💾

This diagram shows how Nova Apply bridges the gap between a predicted label and a physically filled form, while building a long-term "Smart Knowledge Base."

```mermaid
flowchart TD
    %% Node Definitions
    In([Predicted Label]) --> Log[InteractionLog]
    
    subgraph Memory [Phase 3: Semantic Learning Loop]
        direction LR
        Log <--> Vault[(Encrypted Semantic Vault)]
        Vault --> Cache[Cross-Domain Persistence]
    end

    subgraph Execution [Phase 4: Validation & Atomic Injection]
        direction TB
        Cache --> Preview[Enterprise Form Preview]
        Preview -->|Approve| Inject[[Atomic Injection Engine]]
        Preview -->|Correct| Feedback[User Feedback Loop]
        Feedback -->|Update| Vault
    end

    Inject -->|Reflect Events| DOM[[DOM Updated & Synced]]

    %% Styling
    style In fill:#1f2937,stroke:#111827,color:#fff
    style Vault fill:#f59e0b,stroke:#d97706,color:#fff,stroke-width:2px
    style Preview fill:#ec4899,stroke:#db2777,color:#fff
    style DOM fill:#1f2937,stroke:#111827,color:#fff,stroke-width:3px
    style Inject fill:#6366f1,stroke:#4338ca,color:#fff
    
    linkStyle default stroke:#cbd5e1,stroke-width:1px
    linkStyle 3,4 stroke:#f59e0b,stroke-width:2px,color:#f59e0b
```

---

## 3. User Journey: End-to-End Form Flow 🚀

This is the comprehensive flow of how a user interacts with Nova Apply on a job portal (Workday, Greenhouse, etc.), detailing the interaction between the Extension UI, the Page DOM, and our Local Intelligence.

```mermaid
flowchart TB
    %% Start State
    Start([User Navigates to Job Portal]) --> Init

    subgraph Phase1 [PHASE 1: DISCOVERY & SCOUTING]
        Init[Mutation / URL Change] --> Detector{MutationObserver}
        Detector -->|Identify Container| Scanner[AutofillScanner]
        Scanner -->|Extract Context| Context[ContextFeatureExtractor]
        Context --> Vector[95-Feature Vector Generated]
    end

    subgraph Phase2 [PHASE 2: ENSEMBLE ARBITRATION]
        Vector --> Orch[PipelineOrchestrator]
        Orch --> Local[Local Neural V8 Validation]
        Orch --> Fallback[Structural Heuristics]
        
        Local --> Arb{Hybrid Arbiter}
        Fallback --> Arb
        
        Arb -- "Agreement / High Conf" --> Result[Classified Field Labels]
        Arb -- "Ambiguity / Need Context" --> AI[Gemini Flash Synthesis]
        AI --> Result
    end

    subgraph Phase3 [PHASE 3: UI SYNC & RESUME MAPPING]
        Result --> Mapping[ResumeManager: Map Resume to Labels]
        Mapping --> UI[Floating Rhombus Badge Injected]
        UI --> Sidebar[Sidebar: Preview & App-Fill Tabs]
    end

    subgraph Phase4 [PHASE 4: USER INTERACTION & LEARNING]
        Sidebar --> Action{User Action}
        Action -->|Instant Fill| Filling
        Action -->|Manual Input| Obs[FormObserver: Listen to Input]
        Action -->|Regenerate| Regen[AI Assistant: Refine Content]
        
        Obs --> Persistence[InteractionLog: Learn Patterns]
        Regen -->|Update| Filling
        Persistence --> Vault[(Encrypted Semantic Vault)]
    end

    subgraph Phase5 [PHASE 5: ATOMIC INJECTION & SYNC]
        Filling[Atomic Injection Engine] --> Events[Dispatch Native input/change Events]
        Events --> DOM[[DOM Updated & Validated]]
        DOM --> Healing{Form Changed?}
        Healing -- "Yes" --> Init
        Healing -- "No" --> Done([Application Ready])
    end

    %% Professional Styling
    style Orch fill:#6366f1,stroke:#4338ca,color:#fff,stroke-width:2px
    style Local fill:#10b981,stroke:#059669,color:#fff
    style AI fill:#8b5cf6,stroke:#7c3aed,color:#fff
    style Vault fill:#f59e0b,stroke:#d97706,color:#fff
    style Sidebar fill:#ec4899,stroke:#db2777,color:#fff
    style Regen fill:#3b82f6,stroke:#1d4ed8,color:#fff
    style DOM fill:#1f2937,stroke:#111827,color:#fff,stroke-width:3px
    
    %% Link Customization
    linkStyle default stroke:#cbd5e1,stroke-width:1px
    linkStyle 16,17,18,19 stroke:#ec4899,stroke-width:2px
```

## Key Components

### 1. Hybrid Classifier
The brain of the system. Instead of a simple serial fallback, Nova Apply uses a **Hybrid Ensemble Arbitration** strategy:
*   **Neural V8 Validation**: A local 3-layer Dense network providing deep contextual verification. It acts as a "second opinion" to ensure structural patterns match the underlying field intent.
*   **Heuristic Regex Engine**: Lightning-fast pattern matching based on years of industry-standard field normalization.
*   **Gemini AI Synthesis**: A powerful LLM used for high-stakes decision arbitration when the local ensemble encounters ambiguity or requires synthesized resume data.

### 2. Pipeline Orchestrator
The "Conductor" that manages state transitions. It ensures that data is only injected once it has passed through validation and structural mapping phases.

### 3. Semantic Memory (InteractionLog)
Moves beyond simple field-name caching. By indexing choices against **semantic meaning**, Nova learns that "What is your gender?" and "Sex" require the same answer across different platforms.

### 4. Atomic Injection
Ensures compatibility with modern frameworks (React, Vue, Angular) by dispatching native `input` and `change` events instead of just setting property values.
