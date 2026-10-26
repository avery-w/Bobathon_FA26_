import { create } from 'zustand';
import type { AnalyticsData } from '@/types/analytics';
import type { TemporalNodeData } from '@/types/decision';
import { RAW_DEMO_NODES } from '@/data/demoData';
import { ADR_EPOCH, clampEpoch, todayISO } from '@/lib/dates';

export type UsageStatus = 'idle' | 'loading' | 'ready' | 'error';

interface TimeMachineState {
  /** Today, as the browser sees it. Time travel never goes past this. */
  today: string;
  /** The day the whole app is "locked to". Every page and panel shows what was known then. */
  currentEpoch: string;
  isHistoricalReplay: boolean;

  selectedNode: TemporalNodeData | null;

  isDemoMode: boolean;
  isSimulatingDrop: boolean;

  /** Live Bob usage as of `usageEpoch`. */
  usage: AnalyticsData | null;
  usageEpoch: string | null;
  usageStatus: UsageStatus;
  usageError: string | null;

  setEpoch: (epoch: string) => void;
  selectNode: (node: TemporalNodeData | null) => void;
  toggleDemoMode: () => void;
  triggerLiveDropSimulation: () => void;
  resetTo2024: () => void;
  resetToPresent: () => void;
  loadUsage: () => Promise<void>;
}

const initialToday = todayISO();
let usageRequest = 0;

export const useTimeMachineStore = create<TimeMachineState>((set, get) => ({
  today: initialToday,
  currentEpoch: initialToday,
  isHistoricalReplay: false,

  selectedNode: RAW_DEMO_NODES[2],

  isDemoMode: true,
  isSimulatingDrop: false,

  usage: null,
  usageEpoch: null,
  usageStatus: 'idle',
  usageError: null,

  setEpoch: (epoch) => {
    const { today } = get();
    const next = clampEpoch(epoch, today);
    set({ currentEpoch: next, isHistoricalReplay: next < today });
  },

  selectNode: (node) => set({ selectedNode: node }),

  toggleDemoMode: () => set((state) => ({ isDemoMode: !state.isDemoMode })),

  triggerLiveDropSimulation: () => {
    set({ isSimulatingDrop: true });
    setTimeout(() => {
      const { today } = get();
      set({
        isSimulatingDrop: false,
        currentEpoch: today,
        isHistoricalReplay: false,
      });
    }, 1800);
  },

  resetTo2024: () => {
    const { today } = get();
    set({
      currentEpoch: ADR_EPOCH,
      isHistoricalReplay: ADR_EPOCH < today,
      selectedNode: RAW_DEMO_NODES[2],
    });
  },

  resetToPresent: () => {
    const { today } = get();
    set({ currentEpoch: today, isHistoricalReplay: false, selectedNode: RAW_DEMO_NODES[2] });
  },

  loadUsage: async () => {
    const { currentEpoch, today } = get();
    const id = ++usageRequest;
    set({ usageStatus: 'loading', usageError: null });
    try {
      const query = currentEpoch < today ? `?as_of=${currentEpoch}` : '';
      const res = await fetch(`/api/analytics${query}`, { credentials: 'same-origin' });
      if (res.status === 401) {
        window.location.assign('/login');
        return;
      }
      const body = (await res.json()) as AnalyticsData & { error?: string };
      if (id !== usageRequest) return; // a newer request superseded this one
      if (!res.ok) throw new Error(body.error || 'Request failed');
      set({ usage: body, usageEpoch: currentEpoch, usageStatus: 'ready' });
    } catch (err) {
      if (id !== usageRequest) return;
      set({
        usage: null,
        usageEpoch: null,
        usageStatus: 'error',
        usageError: err instanceof Error && err.message !== 'Failed to fetch' ? err.message : 'Could not reach the local server.',
      });
    }
  },
}));
