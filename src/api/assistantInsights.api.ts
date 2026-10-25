/**
 * AI Assistant insights (/api/v1/admin/assistant-insights).
 *
 * The hybrid assistant answers simple messages itself, for free and in
 * milliseconds, and sends the rest to the model. These numbers show how much
 * of the traffic is free, what the model costs, and -- for every built-in
 * rule and every pattern learned from the model -- how often its plan agreed
 * with what the model actually did. Nothing here calls the model.
 *
 * Reading needs analytics:read; switching rules and patterns is Super Admin.
 */
import apiClient from './client';

export type Layer = 'L1' | 'L2' | 'L4' | 'canary' | 'degraded';
export type PatternStatus = 'active' | 'shadow' | 'disabled';

export interface RuleStats {
    turns: number;
    /** Share of judged turns where the rule's plan matched the model's; null = not judged yet. */
    agreement: number | null;
    judged: number;
    ready_to_activate: boolean;
    disagreements: { text: string; rule: unknown; model: unknown }[];
}

export interface Insights {
    days: number;
    turns: number;
    share_by_layer: Partial<Record<Layer, number>>;
    latency_ms_p50_p95: Partial<Record<Layer, [number | null, number | null]>>;
    model_tokens: { prompt: number; output: number };
    model_cost_lkr: number;
    rules: Record<string, RuleStats>;
    config: {
        hybrid_mode: 'off' | 'shadow' | 'active';
        agent: boolean;
        canary_rate: number;
        disabled_rules: string[];
        known_rules: string[];
    };
}

export interface Pattern {
    pattern_id: string;
    /** The message as the assistant keys it (scrubbed, spelling-folded). */
    text_key: string;
    plan: { steps: { name: string; args: Record<string, unknown> }[] };
    status: PatternStatus;
    source: string;
    examples: number;
    shadow: { agree: number; disagree: number; rate: number | null };
    canary: { agree: number; disagree: number; rate: number | null };
    created_at: string | null;
    promoted_at: string | null;
}

export const assistantInsightsApi = {
    get: async (days: number): Promise<Insights> => {
        const { data } = await apiClient.get('/admin/assistant-insights', { params: { days } });
        return data?.data as Insights;
    },

    patterns: async (status?: PatternStatus): Promise<Pattern[]> => {
        const { data } = await apiClient.get('/admin/assistant-insights/patterns', {
            params: status ? { status } : {},
        });
        return (data?.data?.patterns ?? []) as Pattern[];
    },

    setPattern: async (patternId: string, status: PatternStatus): Promise<void> => {
        await apiClient.put(`/admin/assistant-insights/patterns/${patternId}`, { status });
    },

    setRule: async (rule: string, enabled: boolean): Promise<string[]> => {
        const { data } = await apiClient.put(`/admin/assistant-insights/rules/${encodeURIComponent(rule)}`, { enabled });
        return (data?.data?.disabled_rules ?? []) as string[];
    },
};
