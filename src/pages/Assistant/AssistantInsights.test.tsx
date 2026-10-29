import { message } from 'antd';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Insights, Pattern } from '../../api/assistantInsights.api';
import { assistantInsightsApi } from '../../api/assistantInsights.api';
import { renderPage } from '../../test/renderPage';
import { signIn, signOut } from '../../test/users';
import { AdminRole } from '../../types/admin.types';
import AssistantInsights from './AssistantInsights';

vi.mock('../../api/assistantInsights.api', () => ({
    assistantInsightsApi: { get: vi.fn(), patterns: vi.fn(), setPattern: vi.fn(), setRule: vi.fn() },
}));
const api = vi.mocked(assistantInsightsApi);

const insights: Insights = {
    days: 14,
    turns: 200,
    share_by_layer: { L2: 0.55, L1: 0.05, L4: 0.4 },
    latency_ms_p50_p95: { L2: [12, 40], L4: [8600, 15000] },
    model_tokens: { prompt: 100000, output: 9000 },
    model_cost_lkr: 160.5,
    rules: {
        'products.want': { turns: 80, agreement: 0.99, judged: 60, ready_to_activate: true, disagreements: [] },
        'orders.track': {
            turns: 20, agreement: 0.9, judged: 20, ready_to_activate: false,
            disagreements: [{ text: 'mage order eka kohomada', rule: [], model: [] }],
        },
    },
    config: { hybrid_mode: 'shadow', agent: true, canary_rate: 0.02, disabled_rules: ['cart'], known_rules: [] },
};

const pattern: Pattern = {
    pattern_id: 'p-1', text_key: 'sini godak one',
    plan: { steps: [{ name: 'search_products', args: { query: 'sugar' } }] },
    status: 'shadow', source: 'model', examples: 7,
    shadow: { agree: 19, disagree: 1, rate: 0.95 }, canary: { agree: 0, disagree: 0, rate: null },
    created_at: null, promoted_at: null,
};

describe('AssistantInsights', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        api.get.mockResolvedValue(insights);
        api.patterns.mockResolvedValue([pattern]);
        api.setRule.mockResolvedValue([]);
        api.setPattern.mockResolvedValue();
    });
    afterEach(async () => {
        // Static Ant Design messages own a root outside renderPage's tree.
        await act(async () => { signOut(); message.destroy(); });
    });

    it('shows the free share, cost, mode and what was learned', async () => {
        signIn(AdminRole.SUPER_ADMIN);
        renderPage(<AssistantInsights />);
        expect(await screen.findByText('60%')).toBeInTheDocument(); // L1 + L2
        expect(screen.getByText(/Shadow — learning/)).toBeInTheDocument();
        expect(screen.getByText('99%')).toBeInTheDocument();
        expect(await screen.findByText('sini godak one')).toBeInTheDocument();
        expect(screen.getByText('search_products (query: sugar)')).toBeInTheDocument();
    });

    it('lets a Super Admin switch a rule off', async () => {
        signIn(AdminRole.SUPER_ADMIN);
        renderPage(<AssistantInsights />);
        await screen.findByText('60%');
        const switches = screen.getAllByRole('switch');
        fireEvent.click(switches[0]); // products.list, currently on
        await waitFor(() => expect(api.setRule).toHaveBeenCalledWith('products.list', false));
    });

    it('keeps the switches read-only for everyone else', async () => {
        signIn(AdminRole.BRANCH_MANAGER);
        renderPage(<AssistantInsights />);
        await screen.findByText('60%');
        for (const s of screen.getAllByRole('switch')) expect(s).toBeDisabled();
        expect(screen.queryByRole('combobox')).not.toBeInTheDocument(); // pattern status is a tag, not a select
    });
});
