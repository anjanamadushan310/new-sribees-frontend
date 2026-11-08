/**
 * Admin Support Tickets API (/api/v1/admin/support/tickets)
 */
import apiClient from './client';

export interface SupportTicketItem {
    ticket_id: string;
    ticket_number: string;
    user_id?: string | null;
    branch_id?: string | null;
    branch_name?: string | null;
    contact_phone: string;
    customer_name?: string | null;
    category: string;
    message: string;
    status: 'pending' | 'in_progress' | 'resolved' | 'closed';
    assigned_admin_id?: string | null;
    assigned_admin_name?: string | null;
    resolution_notes?: string | null;
    created_at: string;
    updated_at: string;
    resolved_at?: string | null;
}

export interface SupportTicketListResponse {
    items: SupportTicketItem[];
    total: number;
    page: number;
    limit: number;
    total_pages: number;
    pending_count: number;
    in_progress_count: number;
    resolved_count: number;
}

export interface ListTicketsParams {
    page?: number;
    limit?: number;
    status?: string;
    branch_id?: string;
    search?: string;
}

export interface UpdateTicketPayload {
    status?: string;
    assigned_admin_id?: string;
    resolution_notes?: string;
}

export const supportApi = {
    list: async (params?: ListTicketsParams): Promise<SupportTicketListResponse> => {
        const res = await apiClient.get<SupportTicketListResponse>('/admin/support/tickets', {
            params,
        });
        return res.data;
    },

    get: async (ticketId: string): Promise<SupportTicketItem> => {
        const res = await apiClient.get<SupportTicketItem>(`/admin/support/tickets/${ticketId}`);
        return res.data;
    },

    update: async (ticketId: string, payload: UpdateTicketPayload): Promise<SupportTicketItem> => {
        const res = await apiClient.patch<SupportTicketItem>(`/admin/support/tickets/${ticketId}`, payload);
        return res.data;
    },
};

export interface WhatsAppMessage {
    id: string;
    incoming: string | null;
    incoming_type: string | null;
    received_at: string | null;
    outgoing: string | null;
    is_staff: boolean;
    status: string;
    error_code: string | null;
    created_at: string;
}

export interface WhatsAppHistory {
    available: boolean;
    active: boolean;
    staff_active: boolean;
    assigned_admin_id: string | null;
    reply_until: string | null;
    enabled: boolean;
    messages: WhatsAppMessage[];
    next_before: string | null;
}

export const whatsAppSupportApi = {
    history: async (ticketId: string, before?: string): Promise<WhatsAppHistory> => {
        const res = await apiClient.get<WhatsAppHistory>(`/admin/support/tickets/${ticketId}/whatsapp`, {
            params: { before },
        });
        return res.data;
    },
    claim: async (ticketId: string) => apiClient.post(`/admin/support/tickets/${ticketId}/whatsapp/claim`),
    release: async (ticketId: string) => apiClient.post(`/admin/support/tickets/${ticketId}/whatsapp/release`),
    send: async (ticketId: string, body: string, requestId: string): Promise<WhatsAppMessage> => {
        const res = await apiClient.post<WhatsAppMessage>(`/admin/support/tickets/${ticketId}/whatsapp/messages`, {
            body, request_id: requestId,
        });
        return res.data;
    },
};
