import { create } from 'zustand';
import { TemporalNodeData, DecisionDriftPayload, HistoricalMilestone } from '@/types/decision';
import { RAW_DEMO_NODES, DEMO_DRIFT_ALERT, HISTORICAL_MILESTONES } from '@/data/demoData';

interface TimeMachineState {
  currentEpoch: string; // "2024-12-12" or "2026-03-31"
  sliderIndex: number;  // 0: Nov 2024, 1: Dec 2024 (ADR), 2: Mar 2026 (Today)
  isHistoricalReplay: boolean;
  
  selectedNode: TemporalNodeData | null;
  activeDriftAlert: DecisionDriftPayload | null;
  
  isDemoMode: boolean;
  isSimulatingDrop: boolean;
  
  nodes: (TemporalNodeData & { position: { x: number; y: number } })[];
  milestones: HistoricalMilestone[];
  
  setSliderIndex: (index: number) => void;
  selectNode: (node: TemporalNodeData | null) => void;
  toggleDemoMode: () => void;
  triggerLiveDropSimulation: () => void;
  resetTo2024: () => void;
  resetToPresent: () => void;
}

const EPOCHS = ['2024-11-28', '2024-12-12', '2026-03-31'];

export const useTimeMachineStore = create<TimeMachineState>((set) => ({
  currentEpoch: '2026-03-31',
  sliderIndex: 2,
  isHistoricalReplay: false,
  
  selectedNode: RAW_DEMO_NODES[2],
  activeDriftAlert: DEMO_DRIFT_ALERT,
  
  isDemoMode: true,
  isSimulatingDrop: false,
  
  nodes: RAW_DEMO_NODES,
  milestones: HISTORICAL_MILESTONES,
  
  setSliderIndex: (index) => {
    const epoch = EPOCHS[index] || '2026-03-31';
    set({
      sliderIndex: index,
      currentEpoch: epoch,
      isHistoricalReplay: index < 2,
    });
  },
  
  selectNode: (node) => set({ selectedNode: node }),
  
  toggleDemoMode: () => set((state) => ({ isDemoMode: !state.isDemoMode })),
  
  triggerLiveDropSimulation: () => {
    set({ isSimulatingDrop: true });
    setTimeout(() => {
      set({
        isSimulatingDrop: false,
        sliderIndex: 2,
        currentEpoch: '2026-03-31',
        isHistoricalReplay: false,
        activeDriftAlert: DEMO_DRIFT_ALERT
      });
    }, 1800);
  },
  
  resetTo2024: () => {
    set({
      sliderIndex: 1,
      currentEpoch: '2024-12-12',
      isHistoricalReplay: true,
      selectedNode: RAW_DEMO_NODES[2]
    });
  },
  
  resetToPresent: () => {
    set({
      sliderIndex: 2,
      currentEpoch: '2026-03-31',
      isHistoricalReplay: false,
      selectedNode: RAW_DEMO_NODES[2]
    });
  }
}));
