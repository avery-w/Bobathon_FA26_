/** Shapes returned by the Python analytics service (`service/analytics.py`). */

export interface CycleDay {
  date: string;
  cost: number;
  cumulative: number;
  by_folder: Record<string, number>;
}

export type CycleStatus = 'no_budget' | 'exceeded' | 'over_pace' | 'on_track';

export interface Cycle {
  start: string;
  end: string;
  days_total: number;
  days_elapsed: number;
  days_left: number;
  spent: number;
  budget: number | null;
  remaining: number | null;
  avg_daily: number;
  projected: number;
  run_out_date: string | null;
  status: CycleStatus;
  daily: CycleDay[];
}

export interface CycleSummary {
  start: string;
  end: string;
  label: string;
  cost: number;
  by_folder: Record<string, number>;
}

export interface FolderStat {
  folder: string;
  cost: number;
  conversations: number;
  prompts: number;
  last_used: string | null;
  cost_per_conversation: number;
}

export interface ModeStat {
  mode: string;
  prompts: number;
  cost: number;
}

export interface ToolStat {
  tool: string;
  calls: number;
  errors: number;
}

export type Outcome = 'one_shot' | 'multi_turn' | 'cancelled' | 'empty';

export interface EfficiencyComponent {
  key: string;
  label: string;
  value: number;
  weight: number;
  detail: string;
}

export interface EfficiencyMetrics {
  conversations_with_prompts: number;
  avg_prompts_per_conversation: number;
  avg_cost_per_conversation: number;
  avg_cost_per_prompt: number;
  one_shot_rate: number;
  follow_up_rate: number;
  clarification_rate: number;
  questions_asked: number;
  questions_dismissed: number;
  cancelled_rate: number;
  tool_error_rate: number;
  heavy_conversations: number;
  avg_rules_tokens: number;
}

export interface TopConversation {
  date: string;
  folder: string;
  mode: string;
  prompts: number;
  cost: number;
  context_tokens: number;
  outcome: Outcome;
  snippet?: string;
}

/** Costliest conversations for the decision graph. Ids are hashed; no prompt text. */
export interface ConversationNode {
  id: string;
  date: string;
  folder: string;
  mode: string;
  prompts: number;
  cost: number;
  outcome: Outcome;
  quality: number | null;
  context_tokens: number;
  subagents: number;
}

export interface Recommendation {
  id: string;
  level: 'warn' | 'tip' | 'good';
  title: string;
  evidence: string;
  action: string;
}

export interface Habits {
  heatmap: number[][];
  active_days: number;
  longest_streak: number;
  current_streak: number;
  resumed_after_gap: number;
  top20_share: number | null;
  fixed_overhead_share: number | null;
}

export interface Comparison {
  spent: number;
  same_point: number;
  prev_label: string;
  delta_pct: number | null;
}

export interface Hygiene {
  prompts_with_secrets: number;
  repeated: { id: string; count: number }[];
  large_pastes: number;
}

export interface PromptIssue {
  id: string;
  level: 'warn' | 'tip';
  message: string;
  source: string;
  source_label: string;
  why: string;
}

export interface PromptAnalysis {
  score: number;
  bucket: string;
  checks: { length: boolean; context: boolean; goal_or_format: boolean; single_objective: boolean };
  stepwise: boolean;
  issues: PromptIssue[];
  suggested: string;
  redacted: string;
  truncated: boolean;
  chars: number;
}

export interface ReviewItem extends PromptAnalysis {
  date: string;
  folder: string;
  cost: number;
  prompts: number;
}

export interface Settings {
  reset_day: number;
  monthly_budget: number | null;
  cost_multiplier: number;
  show_prompt_snippets: boolean;
  show_prompts: boolean;
}

export interface AnalyticsData {
  generated_at: string;
  unit: string;
  data_range: { first: string | null; last: string | null };
  settings: { reset_day: number; monthly_budget: number | null; cost_multiplier: number };
  totals: { cost: number; conversations: number; prompts: number; folders: number };
  cycle: Cycle;
  cycles: CycleSummary[];
  folders: FolderStat[];
  modes: ModeStat[];
  tools: ToolStat[];
  outcomes: {
    totals: Record<Outcome, number>;
    weekly: { week: string; one_shot: number; multi_turn: number; cancelled: number }[];
  };
  prompt_quality: { average: number | null; buckets: { label: string; count: number }[] };
  efficiency: { score: number | null; components: EfficiencyComponent[]; metrics: EfficiencyMetrics };
  top_conversations: TopConversation[];
  conversations: ConversationNode[];
  recommendations: Recommendation[];
  habits: Habits;
  comparison: Comparison;
  hygiene: Hygiene;
  prompt_review: { enabled: boolean; items: ReviewItem[] };
  best_practices: { title: string; detail: string }[];
}
