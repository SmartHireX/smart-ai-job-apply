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

    subgraph Inference [Phase 2: Hybrid Decision Orchestration]
        direction TB
        Orch{PipelineOrchestrator}
        
        subgraph Stack [Inference Stack]
            direction LR
            Neural[[Neural V8 Model]]
            Heuristic[Heuristic Regex]
            Gemini[[Gemini AI Resolver]]
        end

        FeatureEx --> Orch
        Orch --> Neural
        Neural -- "Low Confidence Fallback" --> Heuristic
        Heuristic -- "No Pattern Match" --> Gemini
    end

    Gemini --> Label([Final Semantic Label])
    Neural -- "Conf > 85%" --> Label
    Heuristic -- "Match Found" --> Label

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

    subgraph Phase2 [PHASE 2: HYBRID INFERENCE STACK]
        Vector --> Orch[PipelineOrchestrator]
        Orch --> Local[Local Neural V8 Inference]
        Local -- "Confidence < 85%" --> Fallback[Structural Heuristics]
        Fallback -- "Ambiguous Field" --> AI[Gemini 1.5/2.0 Flash]
        
        Local --> Result
        Fallback --> Result
        AI --> Result[Classified Field Labels]
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
The brain of the system. Instead of relying on a single source of truth, Nova Apply uses an ensemble approach:
*   **Neural V8**: A local classifier running a 3-layer Dense network for sub-10ms inference.
*   **Heuristic Regex**: A lightning-fast fallback for standard fields using industry-standard patterns.
*   **Gemini AI**: A powerful large language model for synthesizing complex answers from resume context.

### 2. Pipeline Orchestrator
The "Conductor" that manages state transitions. It ensures that data is only injected once it has passed through validation and structural mapping phases.

### 3. Semantic Memory (InteractionLog)
Moves beyond simple field-name caching. By indexing choices against **semantic meaning**, Nova learns that "What is your gender?" and "Sex" require the same answer across different platforms.

### 4. Atomic Injection
Ensures compatibility with modern frameworks (React, Vue, Angular) by dispatching native `input` and `change` events instead of just setting property values.
