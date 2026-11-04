import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { PriceFloor } from '../../api/inventory.api';
import { PriceFloorIcon } from './PriceFloorIcon';

const floor: PriceFloor = {
    product_id: 'p1',
    variant_id: null,
    min_price: '257.00',
    ready_cost: '228.66',
    purchase_cost: '221.55',
    materials_cost: '7.11',
    margin_pct: '10.00',
    cashback_pct: '0.50',
    referral_pct: '0.50',
    cost_ref: 'RPK-000002 (2026-10-17)',
    no_floor_reason: null,
    as_of: null,
};

describe('PriceFloorIcon', () => {
    it('stays out of the way at or above the minimum', () => {
        const { container } = render(<PriceFloorIcon floor={floor} price={257} />);
        expect(container).toBeEmptyDOMElement();
    });

    it('stays out of the way when Finance has no floor', () => {
        const { container } = render(<PriceFloorIcon floor={{ ...floor, min_price: null }} price={10} />);
        expect(container).toBeEmptyDOMElement();
    });

    it('shows a quiet icon below the minimum, and explains on tap', async () => {
        render(<PriceFloorIcon floor={floor} price={250} />);
        const icon = screen.getByLabelText('Below the minimum price');
        fireEvent.click(icon);
        expect(await screen.findByText(/below the minimum of/)).toBeInTheDocument();
        expect(screen.getByText(/RPK-000002/)).toBeInTheDocument();
    });
});
