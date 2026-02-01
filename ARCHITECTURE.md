# Nova Apply - System Architecture 🏢

This document provides a high-fidelity technical overview of how Nova Apply orchestrates form analysis and intelligent autofilling.

## Architectural Flowchart

```mermaid
flowchart TD
    %% Node Definitions
    Start([User Trigger]) --> Obs
    
    subgraph Layer1 [Phase 1: Observation & Contextualization]
        direction LR
        Obs[FormObserver] -->|DOM Mutation| Scan[AutofillScanner]
        Scan -->|Heuristic Extraction| Context[ContextFeatureExtractor]
    end

    subgraph Layer2 [Phase 2: Hybrid Decision Orchestration]
        direction TB
        Orch{PipelineOrchestrator}
        
        subgraph Models [Classification Stack]
            Neural[[Neural V8 Model]]
            Heuristic[Regex Pattern Matcher]
            Gemini[[Gemini AI Resolver]]
        end

        Context --> Orch
        Orch --> Neural
        Neural -- "Low Confidence" --> Heuristic
        Heuristic -- "No Match" --> Gemini
    end

    subgraph Layer3 [Phase 3: Semantic Memory & Persistence]
        direction LR
        Decision[Final Label] --> Log[InteractionLog]
        Log <--> Cache[(Semantic K/V Vault)]
        Cache --> Learning[Smart Learning Loop]
    end

    subgraph Layer4 [Phase 4: Execution & Feedback]
        direction TB
        Learning --> Preview[Form Preview Dashboard]
        Preview -->|Approve| Inject[Atomic Injection Engine]
        Preview -->|Correct| Feedback[User Correction Loop]
        Feedback -->|Refine| Cache
        Inject -->|Native Event Dispatch| DOM[[DOM Updated]]
    end

    %% Professional Styling
    style Orch fill:#6366f1,stroke:#4338ca,color:#fff,stroke-width:2px
    style Neural fill:#10b981,stroke:#059669,color:#fff
    style Gemini fill:#8b5cf6,stroke:#7c3aed,color:#fff
    style Cache fill:#f59e0b,stroke:#d97706,color:#fff
    style Preview fill:#ec4899,stroke:#db2777,color:#fff
    style DOM fill:#1f2937,stroke:#111827,color:#fff,stroke-width:3px
    style Start fill:#f8fafc,stroke:#94a3b8,color:#1e293b
    
    %% Link Customization
    linkStyle default stroke:#cbd5e1,stroke-width:1px
    linkStyle 5,6,7 stroke:#6366f1,stroke-width:2px
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
