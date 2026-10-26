# Bob Time Machine — Decision Intelligence Platform

> **"Every enterprise tracks code. Every enterprise tracks incidents. Almost none track whether their decisions are still correct. Bob Time Machine does."**

Bob Time Machine is a Decision Intelligence platform that reconstructs why architectural, technical, and strategic decisions were made in the past, allows historical replay without hindsight bias, and continuously alerts organizations when foundational assumptions break.

---

## 🚀 Live Demo & Quickstart

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Or build & start production server
npm run build
npm run start
```

Open [http://localhost:3000](http://localhost:3000) to view the Temporal Cockpit.

---

## 🛠️ Tool Integration & REST API Endpoints

Bob Time Machine provides plug-and-play REST endpoints for external agentic coding tools, CI/CD runners, and governance bots:

### 1. Bi-Temporal Historical Replay
- **Endpoint**: `GET /api/replay?cutoffDate=2024-12-12`
- **Description**: Returns the isolated causal decision subgraph exactly as it existed on the target cutoff date, with zero hindsight data leakage.

### 2. Decision Drift Evaluation & Ingestion
- **Endpoint**: `GET /api/drift`
  - Returns currently active decision drift alerts and financial exposure metrics.
- **Endpoint**: `POST /api/drift`
  - Ingests raw documents (CVEs, security bulletins, cloud rate cards) and runs natural language inference (NLI) against historical assumptions to trigger drift alerts.

---

## 🏛️ Architecture & Tech Stack

- **Framework**: Next.js 14+ (App Router)
- **Graph Visualization**: `@xyflow/react` (React Flow 12)
- **State Management**: `zustand`
- **Styling**: Tailwind CSS + Custom Obsidian Dark Theme
- **Icons**: `lucide-react`
