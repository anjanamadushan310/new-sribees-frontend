import React, { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import WeightOptionsEditor from './WeightOptionsEditor';
import { followPricePerKg, markups, proRata, weightLabel, type WeightOptionInput } from '../../api/weightOptions.api';

const Harness: React.FC<{ initial: WeightOptionInput[]; perKg: number; onRows?: (r: WeightOptionInput[]) => void }> = ({
    initial,
    perKg,
    onRows,
}) => {
    const [rows, setRows] = useState(initial);
    return (
        <WeightOptionsEditor
            value={rows}
            onChange={(r) => {
                setRows(r);
                onRows?.(r);
            }}
            pricePerKg={perKg}
        />
    );
};

describe('weight option helpers', () => {
    it('reprices every weight from a new price per kg, keeping a hand-set markup', () => {
        const rows = [
            { weight_grams: 250, price: 270 },
            { weight_grams: 1000, price: 1000 },
        ];
        const marks = markups(rows, 1000);
        // Typed one character at a time: 1, 10, 105, 1050 -- no drift on the way.
        let now = rows;
        for (const typed of [1, 10, 105, 1050]) now = followPricePerKg(now, typed, marks);
        expect(now).toEqual([
            { weight_grams: 250, price: 283.5 },
            { weight_grams: 1000, price: 1050 },
        ]);
    });

    it('labels grams and kilos the way the backend does', () => {
        expect([250, 1000, 1500, 10000].map(weightLabel)).toEqual(['250g', '1kg', '1.5kg', '10kg']);
    });

    it('prices pro rata to the cent', () => {
        expect(proRata(333.33, 250)).toBe(83.33);
        expect(proRata(1000, 5000)).toBe(5000);
    });
});

describe('WeightOptionsEditor', () => {
    it('lists the weights lightest first and reprices them from the kilo price', () => {
        let latest: WeightOptionInput[] = [];
        render(
            <Harness
                initial={[
                    { weight_grams: 1000, price: 1 },
                    { weight_grams: 250, price: 1 },
                ]}
                perKg={800}
                onRows={(r) => (latest = r)}
            />
        );
        const labels = screen.getAllByText(/^\d+(\.\d+)?(g|kg)$/).map((n) => n.textContent);
        expect(labels).toEqual(['250g', '1kg']);

        fireEvent.click(screen.getByText('Price from 1 kg'));
        expect(latest).toEqual([
            { weight_grams: 250, price: 200 },
            { weight_grams: 1000, price: 800 },
        ]);
    });

    it('removes a weight but never the last one', () => {
        let latest: WeightOptionInput[] = [];
        render(
            <Harness
                initial={[
                    { weight_grams: 500, price: 400 },
                    { weight_grams: 1000, price: 800 },
                ]}
                perKg={800}
                onRows={(r) => (latest = r)}
            />
        );
        fireEvent.click(screen.getByLabelText('Remove 500g'));
        expect(latest).toEqual([{ weight_grams: 1000, price: 800 }]);
        expect(screen.getByLabelText('Remove 1kg')).toBeDisabled();
    });
});
