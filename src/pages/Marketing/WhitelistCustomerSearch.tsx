/**
 * Type-ahead for a "Specific Customers" coupon.
 *
 * Suggestions start from the first character: the start of any word of the
 * name, the mobile number however it is typed, the email, the SB number or the
 * NIC. Picking one lists the customer by account -- the only way to list a
 * Google / Apple customer who has no mobile number. A valid mobile number that
 * matches nobody can still be added on its own: whoever later signs up with it
 * is who the coupon was meant for.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { AutoComplete, Input, Space, Tag, Typography } from 'antd';
import { GoogleOutlined, AppleOutlined, MobileOutlined, SearchOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { couponsApi } from '../../api/coupons.api';
import type { CustomerSuggestion, WhitelistedCustomer } from '../../api/coupons.api';
import { canonicalMobile, isListed, localMobile } from './whitelist';

const { Text } = Typography;

function useDebounced<T>(value: T, ms: number): T {
    const [debounced, setDebounced] = useState(value);
    useEffect(() => {
        const t = setTimeout(() => setDebounced(value), ms);
        return () => clearTimeout(t);
    }, [value, ms]);
    return debounced;
}

const ProviderIcon: React.FC<{ provider: string | null }> = ({ provider }) => {
    if (provider === 'google') return <GoogleOutlined title="Signed in with Google" style={{ color: '#4285F4' }} />;
    if (provider === 'apple') return <AppleOutlined title="Signed in with Apple" />;
    return null;
};

interface Props {
    listed: WhitelistedCustomer[];
    onAdd: (c: WhitelistedCustomer) => void;
}

const NUMBER_ONLY = '__number__';

const WhitelistCustomerSearch: React.FC<Props> = ({ listed, onAdd }) => {
    const [text, setText] = useState('');
    const term = useDebounced(text.trim(), 250);

    const { data: found = [], isFetching } = useQuery({
        queryKey: ['admin', 'coupons', 'customer-search', term],
        queryFn: ({ signal }) => couponsApi.searchCustomers(term, signal),
        enabled: term.length >= 1,
        staleTime: 30_000,
    });

    const typedNumber = canonicalMobile(text);
    const numberIsKnown = !!typedNumber && found.some((c) => canonicalMobile(c.phone) === typedNumber);

    const options = useMemo(() => {
        const rows = term ? found : [];
        const out: { value: string; label: React.ReactNode; disabled?: boolean }[] = rows.map(
            (c: CustomerSuggestion) => {
                const already = isListed(listed, c);
                const details = [localMobile(c.phone), c.email, c.customer_code].filter(Boolean).join(' · ');
                return {
                    value: c.user_id,
                    disabled: already,
                    label: (
                        <div data-testid="wl-suggestion" style={{ lineHeight: 1.35, padding: '2px 0' }}>
                            <Space size={6}>
                                <Text strong>{c.name}</Text>
                                <ProviderIcon provider={c.auth_provider} />
                                {c.is_blocked && <Tag color="red">Blocked</Tag>}
                                {already && <Tag>Added</Tag>}
                            </Space>
                            <div>
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                    {details || 'No number or email'}
                                </Text>
                            </div>
                        </div>
                    ),
                };
            },
        );
        if (typedNumber && !numberIsKnown && !isFetching) {
            out.push({
                value: NUMBER_ONLY,
                disabled: isListed(listed, { phone: typedNumber }),
                label: (
                    <Space size={6}>
                        <MobileOutlined />
                        <span>
                            Add <Text strong>{localMobile(typedNumber)}</Text> as a number
                        </span>
                        <Text type="secondary" style={{ fontSize: 12 }}>(not signed up yet)</Text>
                    </Space>
                ),
            });
        }
        return out;
    }, [found, listed, term, typedNumber, numberIsKnown, isFetching]);

    const handleSelect = (value: string) => {
        if (value === NUMBER_ONLY && typedNumber) {
            onAdd({ name: localMobile(typedNumber), phone: typedNumber });
        } else {
            const c = found.find((f) => f.user_id === value);
            if (!c) return;
            onAdd({
                user_id: c.user_id,
                name: c.name,
                phone: c.phone,
                email: c.email,
                customer_code: c.customer_code,
            });
        }
        setText('');
    };

    const noMatch = term.length >= 1 && !isFetching && options.length === 0;

    return (
        <AutoComplete
            value={text}
            options={options}
            onSearch={setText}
            onSelect={handleSelect}
            style={{ width: '100%' }}
            popupMatchSelectWidth
            notFoundContent={
                noMatch ? (
                    <Text type="secondary" style={{ fontSize: 12 }}>
                        No customer found. Type a full mobile number (e.g. 0771234567) to add it.
                    </Text>
                ) : null
            }
        >
            <Input
                allowClear
                prefix={<SearchOutlined />}
                placeholder="Type a name, mobile number, email, SB number or NIC"
                aria-label="Search customers to add"
            />
        </AutoComplete>
    );
};

export default WhitelistCustomerSearch;
