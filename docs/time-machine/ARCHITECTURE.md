bob-time-machine/
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── next.config.mjs
├── src/
│   ├── app/
│   │   ├── layout.tsx                # Obsidian Dark Theme Shell & Font Config
│   │   ├── page.tsx                  # Landing Dashboard / Mission Control
│   │   ├── replay/
│   │   │   └── page.tsx              # Temporal Replay Interactive Workspace
│   │   ├── drift/
│   │   │   └── page.tsx              # Decision Drift Center & Alerts
│   │   ├── executive/
│   │   │   └── page.tsx              # Executive Portfolio Governance View
│   │   └── api/
│   │       ├── ingest/route.ts       # Raw Document Ingestion & Extraction API
│   │       ├── replay/route.ts       # Bi-Temporal Isolated Graph Query API
│   │       └── drift/route.ts        # Live Contradiction & Drift Scoring API
│   ├── components/
│   │   ├── canvas/
│   │   │   ├── DecisionGraph.tsx     # React Flow Causal DAG Visualizer
│   │   │   ├── DecisionNode.tsx      # Custom Glassmorphism React Flow Node
│   │   │   └── AnimatedEdge.tsx      # Pulse & Glow Directed Causal Edge
│   │   ├── timeline/
│   │   │   ├── TimeSlider.tsx        # Framer Motion Scrubbable Time Machine Slider
│   │   │   └── MilestonePill.tsx     # Diamond Epoch Marker
│   │   ├── drift/
│   │   │   ├── DriftAlertCard.tsx    # Critical Exposure $1.4M Alert Banner
│   │   │   └── ContradictionDiff.tsx # Side-by-Side Assumption vs New PDF Diff
│   │   ├── evidence/
│   │   │   ├── EvidenceDrawer.tsx    # Slide-over Provenance & Raw File Viewer
│   │   │   └── CitationBadge.tsx     # Cryptographic SHA-256 Provenance Tag
│   │   ├── navigation/
│   │   │   ├── Sidebar.tsx           # Collapsible Linear-Style Rail
│   │   │   ├── TopBar.tsx            # Live Mode & Search Bar
│   │   │   └── CommandMenu.tsx       # Cmd+K Global Omnisearch (CMDK)
│   │   └── demo/
│   │       └── DemoScriptOverlay.tsx # Stage Presenter Prompter Overlay
│   ├── lib/
│   │   ├── graph-client.ts           # Neo4j & In-Memory Fallback Graph Engine
│   │   ├── temporal-engine.ts        # Valid-Time Subgraph Isolation Algorithms
│   │   └── nli-drift-scorer.ts       # Contradiction Detection & Drift Scoring
│   └── stores/
│       ├── useTimeMachineStore.ts    # Global Zustand Store (Current Epoch & Selection)
│       └── useDriftStore.ts          # Active Drift Alerts & Ingested Files Store
