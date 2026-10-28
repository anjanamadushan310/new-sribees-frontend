import React, { useRef } from 'react';
import { Button, Space, Typography } from 'antd';

interface Props {
    value?: string;
    onChange?: (value: string) => void;
    disabled?: boolean;
    placeholder?: string;
}

/** Stores plain Markdown in the existing description fields; no HTML/scripts. */
const DescriptionEditor: React.FC<Props> = ({ value = '', onChange, disabled, placeholder }) => {
    const input = useRef<HTMLTextAreaElement>(null);
    const format = (kind: 'bold' | 'italic' | 'list') => {
        const area = input.current;
        if (!area || disabled) return;
        let start = area.selectionStart;
        let end = area.selectionEnd;
        let replacement: string;
        let selectionStart: number;
        let selectionEnd: number;
        if (kind === 'list') {
            start = start === 0 ? 0 : value.lastIndexOf('\n', start - 1) + 1;
            const nextLine = value.indexOf('\n', end);
            end = nextLine < 0 ? value.length : nextLine;
            const lines = value.slice(start, end).split('\n');
            const remove = lines.every(line => line.startsWith('- '));
            replacement = lines.map(line => remove ? line.slice(2) : `- ${line}`).join('\n');
            selectionStart = start;
            selectionEnd = start + replacement.length;
        } else {
            const marker = kind === 'bold' ? '**' : '*';
            const selected = value.slice(start, end);
            const unformat = selected.startsWith(marker) && selected.endsWith(marker) && selected.length > marker.length * 2;
            const content = unformat ? selected.slice(marker.length, -marker.length) : selected;
            replacement = unformat ? content : `${marker}${content}${marker}`;
            selectionStart = start + (unformat ? 0 : marker.length);
            selectionEnd = selectionStart + content.length;
        }
        onChange?.(value.slice(0, start) + replacement + value.slice(end));
        requestAnimationFrame(() => {
            area.focus();
            area.setSelectionRange(selectionStart, selectionEnd);
        });
    };
    return <div>
        <Space role="toolbar" aria-label="Description formatting" wrap style={{ marginBottom: 8 }}>
            <Button htmlType="button" disabled={disabled} aria-label="Bold" onClick={() => format('bold')}><strong>B</strong></Button>
            <Button htmlType="button" disabled={disabled} aria-label="Italic" onClick={() => format('italic')}><em>I</em></Button>
            <Button htmlType="button" disabled={disabled} onClick={() => format('list')}>Bullet list</Button>
        </Space>
        <textarea ref={input} value={value} disabled={disabled} placeholder={placeholder}
            aria-label={placeholder || 'Full description'} rows={6}
            onChange={event => onChange?.(event.target.value)}
            style={{ display: 'block', width: '100%', boxSizing: 'border-box', padding: '10px 12px',
                border: '1px solid #d9d9d9', borderRadius: 8, font: 'inherit', lineHeight: 1.6,
                resize: 'vertical', background: disabled ? '#f5f5f5' : '#fff' }} />
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            Select words, then choose B or I. Select lines for a bullet list. Formatting is saved as **bold**, *italic* and - list items.
        </Typography.Text>
    </div>;
};
export default DescriptionEditor;
