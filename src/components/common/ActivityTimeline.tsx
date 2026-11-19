/**
 * What a shopper did, newest first, grouped by Sri Lanka day: screens with
 * time on screen and scroll depth, products opened, photo swipes, searches,
 * cart and wishlist changes, offer taps, checkout. Guest rows are tagged —
 * a customer's timeline includes what their phone did before they signed in.
 *
 * Super Admin only (the API refuses everyone else).
 */
import React, { useMemo } from 'react';
import { Button, Card, Empty, Space, Tag, Timeline, Tooltip, Typography } from 'antd';
import {
    AppstoreOutlined,
    EyeOutlined,
    HeartOutlined,
    LoginOutlined,
    LogoutOutlined,
    MinusCircleOutlined,
    MobileOutlined,
    NotificationOutlined,
    PictureOutlined,
    PlusCircleOutlined,
    SearchOutlined,
    ShareAltOutlined,
    ShoppingCartOutlined,
    TagOutlined,
    ZoomInOutlined,
} from '@ant-design/icons';
import { useInfiniteQuery } from '@tanstack/react-query';
import { activityApi, type ActivityEvent, type ActivityWho } from '../../api/activity.api';
import { describe } from './activityText';

const { Text } = Typography;

const ICONS: Record<string, React.ReactNode> = {
    app_open: <MobileOutlined />,
    app_background: <MobileOutlined />,
    screen: <EyeOutlined />,
    product_view: <AppstoreOutlined />,
    image_swipe: <PictureOutlined />,
    image_zoom: <ZoomInOutlined />,
    search: <SearchOutlined />,
    category_open: <AppstoreOutlined />,
    add_to_cart: <PlusCircleOutlined />,
    remove_from_cart: <MinusCircleOutlined />,
    cart_qty: <ShoppingCartOutlined />,
    wishlist_add: <HeartOutlined />,
    wishlist_remove: <HeartOutlined />,
    banner_tap: <NotificationOutlined />,
    offer_tap: <TagOutlined />,
    coupon_collect: <TagOutlined />,
    checkout_step: <ShoppingCartOutlined />,
    share: <ShareAltOutlined />,
    notification_open: <NotificationOutlined />,
    sign_in: <LoginOutlined />,
    sign_up: <LoginOutlined />,
    sign_out: <LogoutOutlined />,
};

const COLORS: Record<string, string> = {
    add_to_cart: 'green',
    checkout_step: 'green',
    sign_up: 'blue',
    sign_in: 'blue',
    remove_from_cart: 'red',
    app_open: 'gray',
    app_background: 'gray',
};

export const ActivityTimeline: React.FC<{ who: ActivityWho }> = ({ who }) => {
    const key = who.userId ? ['activity', 'user', who.userId] : ['activity', 'device', who.deviceId];
    const query = useInfiniteQuery({
        queryKey: key,
        queryFn: ({ pageParam }) => activityApi.timeline(who, pageParam),
        initialPageParam: null as number | null,
        getNextPageParam: (last) => (last.has_more ? last.next_before_id : undefined),
    });

    const days = useMemo(() => {
        const events = query.data?.pages.flatMap((p) => p.events) ?? [];
        const grouped = new Map<string, ActivityEvent[]>();
        for (const e of events) {
            const day = e.occurred_at_lk.slice(0, 10);
            grouped.set(day, [...(grouped.get(day) ?? []), e]);
        }
        return [...grouped.entries()];
    }, [query.data]);

    if (query.isLoading) return <Card loading />;
    if (query.isError) return <Text type="danger">Could not load activity.</Text>;
    if (days.length === 0) return <Empty description="No activity recorded yet" />;

    return (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
            {days.map(([day, events]) => (
                <div key={day}>
                    <Text strong style={{ display: 'block', marginBottom: 8 }}>{day}</Text>
                    <Timeline
                        items={events.map((e) => ({
                            key: e.id,
                            color: COLORS[e.event] ?? 'blue',
                            dot: ICONS[e.event],
                            children: (
                                <Space size={8} wrap>
                                    <Text type="secondary" style={{ fontVariantNumeric: 'tabular-nums' }}>
                                        {e.occurred_at_lk.slice(11)}
                                    </Text>
                                    <span>{describe(e)}</span>
                                    {e.is_guest && <Tag>Guest</Tag>}
                                    {e.platform === 'web' && <Tag color="purple">Web</Tag>}
                                    <Tooltip title={`${e.device_id}${e.app_version ? ` · v${e.app_version}` : ''}`}>
                                        <MobileOutlined style={{ color: '#bbb' }} />
                                    </Tooltip>
                                </Space>
                            ),
                        }))}
                    />
                </div>
            ))}
            {query.hasNextPage && (
                <Button onClick={() => query.fetchNextPage()} loading={query.isFetchingNextPage} block>
                    Load older
                </Button>
            )}
        </Space>
    );
};

export default ActivityTimeline;
