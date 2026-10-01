import React from 'react';
import {
    ClockCircleOutlined,
    CheckCircleOutlined,
    InboxOutlined,
    CheckSquareOutlined,
    HourglassOutlined,
    SendOutlined,
    CarOutlined,
    ThunderboltOutlined,
    HomeOutlined,
    UndoOutlined,
    AuditOutlined,
    CloseCircleOutlined,
    DollarCircleOutlined,
} from '@ant-design/icons';
import type { OrderDetail, OrderStatus, OrderStatusHistoryItem } from '../../../api/orders.api';
import { slt } from '../../../utils/datetime';

interface HorizontalOrderStepperProps {
    order: OrderDetail;
}

interface StepItem {
    key: string;
    number: number | string;
    label: string;
    icon: React.ReactNode;
    timestamp?: string | null;
    isCompleted: boolean;
    isCurrent: boolean;
    isFailedOrCancelled?: boolean;
}

const FORWARD_FLOW: { key: OrderStatus; label: string; icon: React.ReactNode }[] = [
    { key: 'pending', label: 'Pending', icon: <ClockCircleOutlined /> },
    { key: 'confirmed', label: 'Confirmed', icon: <CheckCircleOutlined /> },
    { key: 'packing', label: 'Preparing', icon: <InboxOutlined /> },
    { key: 'packed', label: 'Packed', icon: <CheckSquareOutlined /> },
    { key: 'ready_for_pickup', label: 'Waiting Courier', icon: <HourglassOutlined /> },
    { key: 'handed_to_courier', label: 'Handed Courier', icon: <SendOutlined /> },
    { key: 'shipped', label: 'Shipped', icon: <CarOutlined /> },
    { key: 'out_for_delivery', label: 'Out for Delivery', icon: <ThunderboltOutlined /> },
    { key: 'delivered', label: 'Delivered', icon: <HomeOutlined /> },
];

export const HorizontalOrderStepper: React.FC<HorizontalOrderStepperProps> = ({ order }) => {
    // 1. Build timestamp lookup from order history and timestamp fields
    const historyMap: Record<string, string> = {};
    const historyList = order.history || (order as any).status_history || [];
    if (Array.isArray(historyList)) {
        historyList.forEach((h: OrderStatusHistoryItem) => {
            if (h.new_status && h.created_at && !historyMap[h.new_status]) {
                historyMap[h.new_status] = h.created_at;
            }
        });
    }

    const getTimestamp = (statusKey: string): string | null => {
        if (historyMap[statusKey]) return historyMap[statusKey];
        switch (statusKey) {
            case 'pending':
                return order.created_at || null;
            case 'confirmed':
                return historyMap['confirmed'] || (order.payment_status === 'paid' ? order.created_at : null);
            case 'packing':
                return historyMap['packing'] || historyMap['processing'] || null;
            case 'packed':
                return order.packed_at || null;
            case 'ready_for_pickup':
                return order.ready_for_pickup_at || null;
            case 'handed_to_courier':
                return order.handed_to_courier_at || null;
            case 'shipped':
                return order.shipped_at || null;
            case 'out_for_delivery':
                return historyMap['out_for_delivery'] || null;
            case 'delivered':
                return order.delivered_at || historyMap['delivered'] || null;
            case 'return_requested':
                return order.return_requested_at || historyMap['return_requested'] || null;
            case 'return_approved':
                return order.return_approved_at || historyMap['return_approved'] || null;
            case 'return_rejected':
                return order.return_rejected_at || historyMap['return_rejected'] || null;
            case 'refunded':
                return historyMap['refunded'] || order.return_received_at || null;
            case 'cancelled':
                return historyMap['cancelled'] || null;
            default:
                return null;
        }
    };

    // 2. Determine steps
    const currentStatus = order.status;
    const forwardKeys = FORWARD_FLOW.map((f) => f.key);
    const currentIndex = forwardKeys.indexOf(currentStatus as OrderStatus);

    const steps: StepItem[] = [];

    // Check if order reached terminal or post-delivery states
    const isCancelled = currentStatus === 'cancelled';
    const isReturnFlow = [
        'return_requested',
        'return_approved',
        'return_rejected',
        'rto_initiated',
        'rto_delivered',
    ].includes(currentStatus) || (currentStatus === 'refunded' && (order.delivered_at || historyMap['delivered'] || order.return_requested_at)) || order.return_requested_at || historyMap['return_requested'] || order.return_rejected_at;

    if (isCancelled) {
        // Pre-delivery cancellation: Add all milestones passed before cancel
        FORWARD_FLOW.forEach((step, idx) => {
            const ts = getTimestamp(step.key);
            if (idx === 0 || ts) {
                steps.push({
                    key: step.key,
                    number: steps.length + 1,
                    label: step.label,
                    icon: step.icon,
                    timestamp: ts,
                    isCompleted: true,
                    isCurrent: false,
                });
            }
        });
        steps.push({
            key: 'cancelled',
            number: '✕',
            label: 'Cancelled',
            icon: <CloseCircleOutlined />,
            timestamp: getTimestamp('cancelled') || order.created_at,
            isCompleted: true,
            isCurrent: true,
            isFailedOrCancelled: true,
        });
    } else if (isReturnFlow) {
        // Post-delivery return flow: Keep all 9 forward milestones as completed
        FORWARD_FLOW.forEach((step, idx) => {
            steps.push({
                key: step.key,
                number: idx + 1,
                label: step.label,
                icon: step.icon,
                timestamp: getTimestamp(step.key),
                isCompleted: true,
                isCurrent: false,
            });
        });

        // Append return requested
        steps.push({
            key: 'return_requested',
            number: 10,
            label: 'Return Requested',
            icon: <UndoOutlined />,
            timestamp: getTimestamp('return_requested'),
            isCompleted: true,
            isCurrent: currentStatus === 'return_requested',
        });

        // Append return rejected if rejected
        if (
            currentStatus === 'return_rejected' ||
            order.return_rejected_at ||
            historyMap['return_rejected']
        ) {
            steps.push({
                key: 'return_rejected',
                number: 11,
                label: 'Return Rejected',
                icon: <CloseCircleOutlined />,
                timestamp: getTimestamp('return_rejected'),
                isCompleted: true,
                isCurrent: currentStatus === 'return_rejected',
                isFailedOrCancelled: true,
            });
        }

        // Append return approved if reached
        if (
            ['return_approved', 'rto_initiated', 'rto_delivered'].includes(currentStatus) ||
            order.return_approved_at ||
            historyMap['return_approved'] ||
            currentStatus === 'refunded'
        ) {
            steps.push({
                key: 'return_approved',
                number: 11,
                label: 'Return Approved',
                icon: <AuditOutlined />,
                timestamp: getTimestamp('return_approved'),
                isCompleted: true,
                isCurrent: currentStatus === 'return_approved',
            });
        }

        // Append refunded if reached
        if (currentStatus === 'refunded') {
            steps.push({
                key: 'refunded',
                number: 12,
                label: 'Refunded',
                icon: <DollarCircleOutlined />,
                timestamp: getTimestamp('refunded'),
                isCompleted: true,
                isCurrent: true,
            });
        }
    } else {
        // Standard forward flow
        FORWARD_FLOW.forEach((step, idx) => {
            const isCompleted = currentIndex >= 0 ? idx <= currentIndex : idx === 0;
            const isCurrent = idx === currentIndex;
            steps.push({
                key: step.key,
                number: idx + 1,
                label: step.label,
                icon: step.icon,
                timestamp: isCompleted ? getTimestamp(step.key) : null,
                isCompleted,
                isCurrent,
            });
        });
    }

    return (
        <div
            style={{
                background: '#ffffff',
                border: '1px solid #f0f0f0',
                borderRadius: 12,
                padding: '24px 20px 20px',
                marginBottom: 20,
                boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                overflowX: 'auto',
            }}
        >
            <div
                style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    minWidth: steps.length * 115,
                    position: 'relative',
                }}
            >
                {steps.map((step, idx) => {
                    const isLast = idx === steps.length - 1;
                    const nextStep = steps[idx + 1];
                    const isLineActive = step.isCompleted && nextStep && nextStep.isCompleted;

                    let badgeBg = '#f5f5f5';
                    let badgeColor = '#8c8c8c';
                    let badgeBorder = '1.5px solid #d9d9d9';
                    let badgeShadow = 'none';

                    if (step.isFailedOrCancelled) {
                        badgeBg = '#ff4d4f';
                        badgeColor = '#ffffff';
                        badgeBorder = 'none';
                        badgeShadow = '0 0 0 4px rgba(255, 77, 79, 0.2)';
                    } else if (step.isCurrent) {
                        badgeBg = '#1677ff';
                        badgeColor = '#ffffff';
                        badgeBorder = 'none';
                        badgeShadow = '0 0 0 4px rgba(22, 119, 255, 0.22), 0 4px 12px rgba(22, 119, 255, 0.3)';
                    } else if (step.isCompleted) {
                        badgeBg = '#1677ff';
                        badgeColor = '#ffffff';
                        badgeBorder = 'none';
                    }

                    return (
                        <div
                            key={step.key}
                            style={{
                                flex: 1,
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                position: 'relative',
                                minWidth: 100,
                            }}
                        >
                            {/* Connecting line to the next step */}
                            {!isLast && (
                                <div
                                    style={{
                                        position: 'absolute',
                                        top: 18,
                                        left: '50%',
                                        width: '100%',
                                        height: 3,
                                        background: isLineActive
                                            ? 'linear-gradient(90deg, #1677ff 0%, #1677ff 100%)'
                                            : '#e8e8e8',
                                        zIndex: 1,
                                    }}
                                />
                            )}

                            {/* Circular Icon Badge */}
                            <div
                                style={{
                                    width: 36,
                                    height: 36,
                                    borderRadius: '50%',
                                    background: badgeBg,
                                    color: badgeColor,
                                    border: badgeBorder,
                                    boxShadow: badgeShadow,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: 16,
                                    zIndex: 2,
                                    transition: 'all 0.3s ease',
                                }}
                            >
                                {step.icon}
                            </div>

                            {/* Label & Step Number */}
                            <div
                                style={{
                                    marginTop: 10,
                                    textAlign: 'center',
                                    fontSize: 13,
                                    fontWeight: step.isCurrent ? 700 : step.isCompleted ? 600 : 500,
                                    color: step.isFailedOrCancelled
                                        ? '#ff4d4f'
                                        : step.isCurrent
                                        ? '#1677ff'
                                        : step.isCompleted
                                        ? '#1f1f1f'
                                        : '#8c8c8c',
                                }}
                            >
                                {step.number}. {step.label}
                            </div>

                            {/* Timestamp */}
                            <div
                                style={{
                                    marginTop: 3,
                                    fontSize: 11,
                                    color: '#8c8c8c',
                                    textAlign: 'center',
                                    minHeight: 16,
                                }}
                            >
                                {step.timestamp ? slt(step.timestamp).format('hh:mm A') : ''}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default HorizontalOrderStepper;
