import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import DescriptionEditor from './DescriptionEditor';

function Editor({ initial = 'Fresh tea' }: { initial?: string }) {
    const [value, setValue] = useState(initial);
    return <DescriptionEditor value={value} onChange={setValue} />;
}

describe('description formatting', () => {
    it('formats only selected words and preserves surrounding text', () => {
        render(<Editor />);
        const input = screen.getByRole('textbox') as HTMLTextAreaElement;
        input.setSelectionRange(6, 9);
        fireEvent.click(screen.getByRole('button', { name: 'Bold' }));
        expect(input.value).toBe('Fresh **tea**');
    });
    it('supports italic and bullets without submitting a product form', () => {
        render(<Editor initial="Tea" />);
        const input = screen.getByRole('textbox') as HTMLTextAreaElement;
        input.setSelectionRange(0, 3);
        fireEvent.click(screen.getByRole('button', { name: 'Italic' }));
        expect(input.value).toBe('*Tea*');
        input.setSelectionRange(0, 5);
        fireEvent.click(screen.getByRole('button', { name: 'Bullet list' }));
        expect(input.value).toBe('- *Tea*');
        expect(screen.getByRole('button', { name: 'Bold' }).getAttribute('type')).toBe('button');
    });
    it('preserves plain text and respects read-only catalog permissions', () => {
        render(<DescriptionEditor value="Existing description" disabled />);
        expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('Existing description');
        expect((screen.getByRole('button', { name: 'Bold' }) as HTMLButtonElement).disabled).toBe(true);
    });
});
