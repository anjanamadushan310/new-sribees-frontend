/**
 * Helpers for a "Specific Customers" coupon list, shared by the coupon form
 * and its customer search.
 */
import type { WhitelistedCustomer } from '../../api/coupons.api';

/** +94771234567 -> 0771234567; anything else unchanged. */
export const localMobile = (phone?: string | null): string =>
    phone && /^\+947\d{8}$/.test(phone) ? `0${phone.slice(3)}` : phone ?? '';

/**
 * A Sri Lankan mobile number in +94 form, or null. The same rule the server
 * uses (app/utils/identity.py), so the list shows what will actually match.
 */
export const canonicalMobile = (value?: string | null): string | null => {
    let digits = (value ?? '').replace(/\D/g, '');
    if (digits.startsWith('94')) digits = digits.slice(2);
    else if (digits.startsWith('0')) digits = digits.slice(1);
    return /^7\d{8}$/.test(digits) ? `+94${digits}` : null;
};

/** Is this customer (by account or by number) already on the list? */
export const isListed = (
    listed: WhitelistedCustomer[],
    c: { user_id?: string | null; phone?: string | null },
): boolean => {
    const phone = canonicalMobile(c.phone);
    return listed.some(
        (l) =>
            (!!c.user_id && l.user_id === c.user_id) ||
            (!!phone && canonicalMobile(l.phone) === phone),
    );
};
