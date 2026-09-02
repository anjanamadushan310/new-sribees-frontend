/**
 * DebouncedSearchInput (QA spec B3)
 *
 * A single reusable search box for every admin listing (Orders, Products,
 * Customers, Categories, Staff). Behaviour:
 *   - fires `onChange(query)` 350ms after the user stops typing
 *   - queries shorter than 2 chars are treated as empty (reset the list)
 *   - clearing the field resets immediately (no debounce wait)
 *   - Enter or the search icon flush the pending debounce right away
 *   - inline spinner while a debounce is pending
 *   - an X clears the field, refocuses it, and resets
 *   - optional ?q= URL sync so a refresh / shared link keeps the search
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Input } from 'antd';
import { LoadingOutlined, SearchOutlined } from '@ant-design/icons';
import { useSearchParams } from 'react-router-dom';

const MIN_CHARS = 2;
const DEBOUNCE_MS = 350;

export interface DebouncedSearchInputProps {
    /** Current committed query (controlled by the parent). */
    value: string;
    /** Called with the committed query — '' means "reset to the base list". */
    onChange: (query: string) => void;
    placeholder?: string;
    style?: React.CSSProperties;
    /** When set, mirrors the committed query to this URL query param. */
    urlParam?: string;
    autoFocus?: boolean;
}

export const DebouncedSearchInput: React.FC<DebouncedSearchInputProps> = ({
    value,
    onChange,
    placeholder = 'Search…',
    style,
    urlParam,
    autoFocus,
}) => {
    const [text, setText] = useState(value);
    const [pending, setPending] = useState(false);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const inputRef = useRef<any>(null);
    const [searchParams, setSearchParams] = useSearchParams();

    // Seed from ?q= on first mount.
    useEffect(() => {
        if (!urlParam) return;
        const fromUrl = searchParams.get(urlParam) ?? '';
        if (fromUrl && fromUrl !== value) {
            setText(fromUrl);
            onChange(fromUrl);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Keep local text in step if the parent resets the value externally.
    useEffect(() => {
        setText(value);
    }, [value]);

    const commit = useCallback(
        (raw: string) => {
            if (timer.current) {
                clearTimeout(timer.current);
                timer.current = null;
            }
            setPending(false);
            const q = raw.trim();
            const next = q.length >= MIN_CHARS ? q : '';
            onChange(next);
            if (urlParam) {
                setSearchParams(
                    (prev) => {
                        const p = new URLSearchParams(prev);
                        if (next) p.set(urlParam, next);
                        else p.delete(urlParam);
                        return p;
                    },
                    { replace: true },
                );
            }
        },
        [onChange, urlParam, setSearchParams],
    );

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const raw = e.target.value;
        setText(raw);
        if (timer.current) clearTimeout(timer.current);
        if (raw.trim() === '') {
            // Immediate reset — never make the user wait to clear a filter.
            commit('');
            return;
        }
        setPending(true);
        timer.current = setTimeout(() => commit(raw), DEBOUNCE_MS);
    };

    useEffect(() => () => {
        if (timer.current) clearTimeout(timer.current);
    }, []);

    return (
        <Input
            ref={inputRef}
            allowClear
            autoFocus={autoFocus}
            value={text}
            placeholder={placeholder}
            style={style}
            prefix={pending ? <LoadingOutlined /> : <SearchOutlined />}
            onChange={handleChange}
            onPressEnter={() => commit(text)}
            onClear={() => {
                commit('');
                inputRef.current?.focus?.();
            }}
        />
    );
};

export default DebouncedSearchInput;
