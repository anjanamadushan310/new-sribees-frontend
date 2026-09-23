/**
 * Cancellation review (/api/v1/admin/cancellations) — branch-scoped on the
 * server, read-only by design.
 *
 * Cancelling is a button in the customer's app now and it moves money, so
 * these endpoints exist to show the pattern rather than the individual event.
 * Nothing here cancels, refunds, blocks or bans: deciding what to do about a
 * customer is a human judgement with a conversation attached.
 */
import apiClient from './client';

/** One cancellation, with the context to judge it. */
export interface CancellationRow {
    cancellation_id: string;
    order_id: string;
    order_number: string | null;
    user_id: string | null;
    customer_name: string | null;
    customer_phone: string | null;
    customer_nic: string | null;
    /** 'customer' or 'admin'. Only the first counts against anyone. */
    cancelled_by: string;
    reason: string | null;
    order_total: number;
    payment_method: string | null;
    /** What landed in the customer's wallet. */
    refund_amount: number;
    /** Kept back because a courier had already been booked. */
    courier_fee: number;
    /** The expensive kind — this one cost us a courier booking. */
    cancelled_after_booking: boolean;
    refund_destination: string;
    ip_address: string | null;
    device_id: string | null;
    user_agent: string | null;
    client_platform: string | null;
    order_placed_at: string | null;
    cancelled_at: string | null;
    /** How long after ordering it arrived. Null when the order has no placed-at. */
    seconds_to_cancel: number | null;
    flagged: boolean;
    flag_reason: string | null;
}

/** One customer's totals over the window. */
export interface CancellationCustomerRow {
    user_id: string;
    customer_name: string | null;
    customer_phone: string | null;
    customer_nic: string | null;
    cancellations: number;
    refunded_total: number;
    courier_fees_charged: number;
    cancelled_after_booking: number;
    flagged: number;
    distinct_ips: number;
    distinct_devices: number;
    first_seen: string | null;
    last_seen: string | null;
}

/** Another account that looks like the same person. */
export interface LinkedAccount {
    user_id: string;
    customer_name: string | null;
    customer_phone?: string | null;
    customer_nic?: string | null;
    cancellations?: number;
}

export interface LinkedAccounts {
    by_device: LinkedAccount[];
    by_ip: LinkedAccount[];
    by_address: LinkedAccount[];
    note: string;
}

export const cancellationsApi = {
    list: async (params: {
        days?: number;
        flagged_only?: boolean;
        user_id?: string;
        limit?: number;
        offset?: number;
    }) => {
        const { data } = await apiClient.get('/admin/cancellations', { params });
        return (data?.data?.items ?? []) as CancellationRow[];
    },

    customers: async (params: { days?: number; min_count?: number; limit?: number }) => {
        const { data } = await apiClient.get('/admin/cancellations/customers', { params });
        return (data?.data?.items ?? []) as CancellationCustomerRow[];
    },

    links: async (userId: string) => {
        const { data } = await apiClient.get(`/admin/cancellations/customers/${userId}/links`);
        return data?.data as LinkedAccounts;
    },
};
