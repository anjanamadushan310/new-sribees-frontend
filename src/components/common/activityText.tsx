/**
 * Plain-English lines for the activity timeline (ActivityTimeline.tsx).
 */
import React from 'react';
import { Typography } from 'antd';
import type { ActivityEvent } from '../../api/activity.api';

const { Text } = Typography;

const SCREEN_LABELS: Record<string, string> = {
    home: 'Home',
    saved: 'Saved',
    orders: 'Orders',
    profile: 'Profile',
    product_details: 'Product page',
    search: 'Search',
    category_products: 'Category',
    cart: 'Cart',
    checkout: 'Checkout',
    offers: 'Offers',
    chat: 'Chat assistant',
    notifications: 'Notifications',
    photo_gallery: 'Photo viewer',
    splash: 'Splash',
    phone_login: 'Login',
};

export function screenLabel(name: string | null): string {
    if (!name) return 'a screen';
    return SCREEN_LABELS[name] ?? name.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

export function formatSeconds(s: number): string {
    if (s < 60) return `${Math.round(s)}s`;
    const m = Math.floor(s / 60);
    const rest = Math.round(s % 60);
    return rest ? `${m}m ${rest}s` : `${m}m`;
}

const product = (e: ActivityEvent) => e.product_name ?? (e.props.name as string | undefined) ?? 'a product';

/** One plain sentence per event. */
export function describe(e: ActivityEvent): React.ReactNode {
    const p = e.props;
    switch (e.event) {
        case 'app_open':
            return 'Opened the app';
        case 'app_background':
            return 'Left the app';
        case 'screen': {
            const parts = [`${screenLabel(e.screen)} — ${formatSeconds(Number(p.seconds ?? 0))}`];
            if (p.scroll_pct != null) parts.push(`scrolled ${p.scroll_pct}%`);
            return parts.join(', ');
        }
        case 'product_view':
            return <>Opened <Text strong>{product(e)}</Text>{p.source === 'link' ? ' (from a link)' : ''}</>;
        case 'image_swipe':
            return <>Photo {Number(p.index ?? 0) + 1}{p.total ? ` of ${p.total}` : ''} of <Text strong>{product(e)}</Text></>;
        case 'image_zoom':
            return <>Zoomed photo {Number(p.index ?? 0) + 1} of <Text strong>{product(e)}</Text></>;
        case 'search':
            return <>Searched “<Text strong>{String(p.query ?? '')}</Text>”{e.category_name ? ` in ${e.category_name}` : ''}</>;
        case 'category_open':
            return <>Opened {p.level === 'subcategory' ? 'sub-category' : 'category'} <Text strong>{e.category_name ?? String(p.name ?? '')}</Text></>;
        case 'add_to_cart':
            return <>Added <Text strong>{product(e)}</Text> to cart{p.qty ? ` ×${p.qty}` : ''}</>;
        case 'remove_from_cart':
            return <>Removed <Text strong>{product(e)}</Text> from cart</>;
        case 'cart_qty':
            return <>Changed <Text strong>{product(e)}</Text> from {String(p.from)} to {String(p.to)}</>;
        case 'wishlist_add':
            return <>Saved <Text strong>{product(e)}</Text></>;
        case 'wishlist_remove':
            return <>Unsaved <Text strong>{product(e)}</Text></>;
        case 'banner_tap':
            return `Tapped a banner${p.link_type ? ` (${p.link_type})` : ''}`;
        case 'offer_tap':
            return 'Tapped an offer';
        case 'coupon_collect':
            return <>Collected coupon <Text code>{String(p.code ?? '')}</Text></>;
        case 'checkout_step':
            return p.step === 'placed' ? <Text strong type="success">Placed an order</Text> : `Checkout: ${String(p.step ?? '')}`;
        case 'share':
            return <>Shared <Text strong>{product(e)}</Text></>;
        case 'notification_open':
            return `Opened a notification${p.type ? ` (${p.type})` : ''}`;
        case 'sign_in':
            return `Signed in${p.method ? ` with ${p.method}` : ''}`;
        case 'sign_up':
            return `Signed up${p.method ? ` with ${p.method}` : ''}`;
        case 'sign_out':
            return 'Signed out';
        case 'tap':
            return `Tapped ${String(p.target ?? 'a button')}`;
        default:
            return e.event;
    }
}

