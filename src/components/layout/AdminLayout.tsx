import React, { useState, useMemo, useEffect } from 'react';
import { Layout, Menu, Tag, Popconfirm } from 'antd';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
    DashboardOutlined,
    FileSearchOutlined,
    ShoppingOutlined,
    ShoppingCartOutlined,
    StopOutlined,
    UserOutlined,
    LogoutOutlined,
    MenuFoldOutlined,
    MenuUnfoldOutlined,
    BarChartOutlined,
    SettingOutlined,
    MobileOutlined,
    TagsOutlined,
    InboxOutlined,
    TeamOutlined,
    ApartmentOutlined,
    GiftOutlined,
    ThunderboltOutlined,
    PictureOutlined,
    CustomerServiceOutlined,
    EnvironmentOutlined,
    CrownOutlined,
    NotificationOutlined,
    RobotOutlined,
    MessageOutlined,
} from '@ant-design/icons';
import { useAuthStore } from '../../store/authStore';
import { usePermissions } from '../../hooks/usePermissions';
import { ROLE_NAMES, AdminRole } from '../../types/admin.types';
import { authApi } from '../../api/auth.api';
import type { MenuProps } from 'antd';

const { Header, Sider, Content } = Layout;

const adminLayoutStyles = `
.admin-layout-wrapper {
    min-height: 100vh;
    background-color: #f8fafc;
}

/* Sider Styling */
.admin-sider-custom {
    background: #ffffff !important;
    border-right: 1px solid #f0f2f5;
    box-shadow: 2px 0 8px rgba(0, 0, 0, 0.02);
    overflow-y: auto;
    overflow-x: hidden;
    height: 100vh;
    position: sticky;
    top: 0;
    left: 0;
    bottom: 0;
    z-index: 100;
    display: flex;
    flex-direction: column;
}

.admin-sider-custom::-webkit-scrollbar {
    width: 4px;
}

.admin-sider-custom::-webkit-scrollbar-track {
    background: transparent;
}

.admin-sider-custom::-webkit-scrollbar-thumb {
    background: #e2e8f0;
    border-radius: 4px;
}

.admin-sider-custom::-webkit-scrollbar-thumb:hover {
    background: #cbd5e1;
}

/* Brand Header */
.admin-brand-header {
    height: 72px;
    padding: 0 18px;
    display: flex;
    align-items: center;
    gap: 12px;
    background: #ffffff;
    border-bottom: 1px solid #f3f4f6;
    position: sticky;
    top: 0;
    z-index: 10;
    flex-shrink: 0;
}

.admin-brand-logo-squircle {
    position: relative;
    width: 42px;
    height: 42px;
    min-width: 42px;
    border-radius: 12px;
    background: linear-gradient(135deg, #e91e63 0%, #c2185b 100%);
    box-shadow: 0 4px 12px rgba(216, 27, 96, 0.3);
    display: flex;
    align-items: center;
    justify-content: center;
    color: #ffffff;
}

.admin-brand-online-dot {
    position: absolute;
    bottom: -2px;
    right: -2px;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background-color: #10b981;
    border: 2px solid #ffffff;
}

.admin-brand-text-col {
    display: flex;
    flex-direction: column;
    min-width: 0;
}

.admin-brand-title-row {
    display: flex;
    align-items: center;
    gap: 6px;
}

.admin-brand-name {
    font-size: 15px;
    font-weight: 800;
    color: #111827;
    letter-spacing: 0.6px;
    line-height: 1.2;
}

.admin-brand-badge {
    font-size: 9px;
    font-weight: 700;
    color: #d81b60;
    background: #fce4ec;
    padding: 2px 5px;
    border-radius: 4px;
    letter-spacing: 0.5px;
    line-height: 1;
}

.admin-brand-suite-title {
    font-size: 9.5px;
    font-weight: 700;
    color: #9ca3af;
    letter-spacing: 0.6px;
    margin-top: 2px;
    text-transform: uppercase;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

/* Menu Customization */
.admin-custom-menu.ant-menu-light {
    background: #ffffff !important;
    border-inline-end: none !important;
    padding: 10px 0 20px 0;
}

/* Group Headers */
.admin-custom-menu .ant-menu-item-group-title {
    padding: 14px 20px 6px 20px !important;
    font-size: 10.5px !important;
    font-weight: 800 !important;
    letter-spacing: 0.8px !important;
    color: #9ca3af !important;
    text-transform: uppercase !important;
}

/* Menu Items */
.admin-custom-menu .ant-menu-item,
.admin-custom-menu .ant-menu-submenu-title {
    margin: 3px 12px !important;
    width: calc(100% - 24px) !important;
    height: 40px !important;
    line-height: 40px !important;
    border-radius: 10px !important;
    color: #4b5563 !important;
    font-weight: 500 !important;
    font-size: 13.5px !important;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1) !important;
}

.admin-custom-menu .ant-menu-item:hover,
.admin-custom-menu .ant-menu-submenu-title:hover {
    color: #d81b60 !important;
    background: #fff1f6 !important;
}

/* Selected Menu Item */
.admin-custom-menu .ant-menu-item-selected {
    background: linear-gradient(135deg, #d81b60 0%, #c2185b 100%) !important;
    color: #ffffff !important;
    font-weight: 600 !important;
    box-shadow: 0 4px 14px rgba(216, 27, 96, 0.35) !important;
    position: relative !important;
}

.admin-custom-menu .ant-menu-item-selected .anticon {
    color: #ffffff !important;
}

/* Active White Dot Indicator on right edge */
.admin-custom-menu .ant-menu-item-selected::after {
    content: '';
    position: absolute;
    right: 14px;
    top: 50%;
    transform: translateY(-50%);
    width: 6px;
    height: 6px;
    background: #ffffff;
    border-radius: 50%;
    box-shadow: 0 0 6px rgba(255, 255, 255, 0.8);
    display: block !important;
    opacity: 1 !important;
    border: none !important;
}

/* Sider Bottom Telemetry */
.admin-sider-bottom {
    margin-top: auto;
    padding: 12px 14px 16px 14px;
    border-top: 1px solid #f3f4f6;
    background: #ffffff;
    flex-shrink: 0;
}

.admin-telemetry-pill {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: #f9fafb;
    border: 1px solid #f3f4f6;
    border-radius: 8px;
    padding: 6px 10px;
    margin-bottom: 12px;
}

.admin-telemetry-left {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    font-weight: 600;
    color: #374151;
}

.admin-telemetry-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background-color: #10b981;
    box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.2);
}

.admin-telemetry-ver {
    font-size: 10px;
    color: #9ca3af;
    font-family: monospace;
    font-weight: 600;
}

.admin-user-profile-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 4px;
}

.admin-user-avatar {
    width: 34px;
    height: 34px;
    border-radius: 50%;
    background: #d81b60;
    color: #ffffff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: 700;
    flex-shrink: 0;
}

.admin-user-meta {
    display: flex;
    flex-direction: column;
    min-width: 0;
}

.admin-user-name {
    font-size: 12.5px;
    font-weight: 700;
    color: #111827;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    line-height: 1.2;
}

.admin-user-status {
    font-size: 11px;
    font-weight: 600;
    color: #10b981;
    display: flex;
    align-items: center;
    gap: 4px;
    margin-top: 2px;
}

.admin-user-status-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background-color: #10b981;
}

/* Header Styling */
.admin-header-custom {
    padding: 0 24px;
    background: #ffffff !important;
    display: flex;
    align-items: center;
    justify-content: space-between;
    position: sticky;
    top: 0;
    z-index: 99;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
    border-bottom: 1px solid #f0f2f5;
    height: 64px;
    line-height: normal !important;
}

.admin-header-left {
    display: flex;
    align-items: center;
    gap: 16px;
}

.admin-trigger-btn {
    font-size: 18px;
    color: #4b5563;
    cursor: pointer;
    padding: 6px;
    border-radius: 6px;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
}

.admin-trigger-btn:hover {
    background: #f3f4f6;
    color: #d81b60;
}

.admin-breadcrumb-nav {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13.5px;
}

.admin-breadcrumb-part {
    color: #6b7280;
    font-weight: 500;
}

.admin-breadcrumb-sep {
    color: #d1d5db;
    font-size: 12px;
}

.admin-breadcrumb-active {
    color: #111827;
    font-weight: 700;
}

.admin-header-right {
    display: flex;
    align-items: center;
    gap: 14px;
    height: 100%;
    line-height: normal !important;
}

.admin-role-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: #ecfdf5;
    color: #059669;
    border: 1px solid #a7f3d0;
    border-radius: 20px;
    padding: 0 12px;
    height: 28px;
    line-height: 26px;
    font-size: 12px;
    font-weight: 600;
    white-space: nowrap;
    box-sizing: border-box;
    flex-shrink: 0;
}

.admin-role-pill-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background-color: #059669;
    flex-shrink: 0;
}

.admin-user-welcome-chip {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    font-weight: 600;
    color: #374151;
    line-height: normal;
}

.admin-user-welcome-avatar {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: #d81b60;
    color: #ffffff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: 700;
    flex-shrink: 0;
}

.admin-logout-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 32px;
    line-height: 30px;
    padding: 0 14px;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 600;
    color: #374151;
    background: #ffffff;
    cursor: pointer;
    transition: all 0.2s;
    box-sizing: border-box;
    flex-shrink: 0;
}

.admin-logout-btn:hover {
    border-color: #d81b60;
    color: #d81b60;
    background: #fff1f6;
}
`;

const AdminLayout: React.FC = () => {
    const [collapsed, setCollapsed] = useState(false);
    const navigate = useNavigate();
    const location = useLocation();
    const { user, logout, updateUser } = useAuthStore();
    const { canAccessRoute, can, role, isStaff, isSuperAdmin } = usePermissions();

    // Catalog (Products & Categories) and Customers nav visibility follow the
    // same permission check as the route itself (router.tsx), not a fixed
    // role list — otherwise a staff account delegated e.g. products:read
    // could open /products by URL but never see it in the sidebar.
    const canManageCatalog = can('products', 'read');
    const canManageCustomers = can('customers', 'read');
    // Staff management: every base role can have staff — everyone except a
    // staff account itself (mirrors the server's require_base_role_admin gate).
    const canManageStaff = !isStaff;

    // Sync the displayed profile (full_name, role, branch) with the backend
    // on initial load. A 401 here is handled by the API client interceptor
    // (token refresh, or forced logout if the session is truly dead).
    useEffect(() => {
        let cancelled = false;
        authApi
            .getCurrentUser()
            .then((profile) => {
                if (!cancelled) updateUser(profile);
            })
            .catch(() => {
                // Interceptor already handled auth failures; keep cached user
                // for transient network errors.
            });
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Dynamic Role Suite Title under the Brand Logo
    const roleSuiteName = useMemo(() => {
        if (user?.role === AdminRole.SUPER_ADMIN) return 'SUPER ADMIN SUITE';
        if (user?.role === AdminRole.BRANCH_MANAGER) return 'BRANCH MANAGER SUITE';
        if (user?.role === AdminRole.MARKETING_MANAGER) return 'MARKETING SUITE';
        if (user?.role === AdminRole.INVENTORY_MANAGER) return 'INVENTORY SUITE';
        if (user?.role === AdminRole.CUSTOMER_SUPPORT) return 'SUPPORT SUITE';
        if (user?.role_name) {
            const cleaned = user.role_name.replace(/suite$/i, '').trim();
            return `${cleaned.toUpperCase()} SUITE`;
        }
        if (role && role in ROLE_NAMES) {
            return `${ROLE_NAMES[role].toUpperCase()} SUITE`;
        }
        return 'SUPER ADMIN SUITE';
    }, [user?.role, user?.role_name, role]);

    // Role display name for header pill and breadcrumbs
    const roleDisplayName = useMemo(() => {
        if (user?.role_name) return user.role_name;
        if (role && role in ROLE_NAMES) return ROLE_NAMES[role];
        return 'Super Admin';
    }, [user?.role_name, role]);

    // User initials for round avatar chips
    const userInitials = useMemo(() => {
        if (!user?.full_name) return 'SA';
        const parts = user.full_name.trim().split(/\s+/);
        if (parts.length >= 2) {
            return (parts[0][0] + parts[1][0]).toUpperCase();
        }
        return user.full_name.slice(0, 2).toUpperCase();
    }, [user?.full_name]);

    // Grouped Menu items adhering strictly to Figma ordering and permissions
    const menuItems = useMemo<MenuProps['items']>(() => {
        const isItemAllowed = (key: string): boolean => {
            if (key === '/products' || key === '/categories' || key === '/search-misses') {
                return canManageCatalog;
            }
            if (key === '/customers') {
                return canManageCustomers;
            }
            if (key === '/staff') {
                return canManageStaff;
            }
            if (key === '/support-tickets') {
                return can('support', 'read') || isSuperAdmin;
            }
            if (
                key === '/users' ||
                key === '/branches' ||
                key === '/partners' ||
                key === '/app-users' ||
                key === '/sms'
            ) {
                return isSuperAdmin;
            }
            return canAccessRoute(key);
        };

        // 1. CORE (Requested exact order: Dashboard, Products, Categories, Inventory, Orders, Cancellations, Quick Sale)
        const coreItems = [
            {
                key: '/',
                icon: <DashboardOutlined />,
                label: 'Dashboard',
            },
            {
                key: '/products',
                icon: <ShoppingOutlined />,
                label: 'Products',
            },
            {
                key: '/categories',
                icon: <TagsOutlined />,
                label: 'Categories',
            },
            {
                key: '/inventory',
                icon: <InboxOutlined />,
                label: 'Inventory',
            },
            {
                key: '/orders',
                icon: <ShoppingCartOutlined />,
                label: 'Orders',
            },
            {
                key: '/orders/cancellations',
                icon: <StopOutlined />,
                label: 'Cancellations',
            },
            {
                key: '/quick-sale',
                icon: <ThunderboltOutlined />,
                label: 'Quick Sale',
            },
        ].filter((item) => isItemAllowed(item.key));

        // 2. AUDIENCE & ENGAGEMENT
        const audienceItems = [
            {
                key: '/customers',
                icon: <UserOutlined />,
                label: 'Customers',
            },
            {
                key: '/app-users',
                icon: <MobileOutlined />,
                label: 'App Users',
            },
            {
                key: '/sms',
                icon: <MessageOutlined />,
                label: 'SMS',
            },
            {
                key: '/support-tickets',
                icon: <CustomerServiceOutlined />,
                label: 'Support Tickets',
            },
        ].filter((item) => isItemAllowed(item.key));

        // 3. INTELLIGENCE & MARKETING (Clean AI Briefings without "NEW" badge)
        const intelligenceItems = [
            {
                key: '/assistant-briefings',
                icon: <RobotOutlined />,
                label: 'AI Briefings',
            },
            {
                key: '/search-misses',
                icon: <FileSearchOutlined />,
                label: 'Missed Searches',
            },
            {
                key: '/analytics',
                icon: <BarChartOutlined />,
                label: 'Analytics',
            },
            {
                key: '/coupons',
                icon: <GiftOutlined />,
                label: 'Coupons',
            },
            {
                key: '/push-campaigns',
                icon: <NotificationOutlined />,
                label: 'Push Campaigns',
            },
            {
                key: '/banners',
                icon: <PictureOutlined />,
                label: 'Home Banners',
            },
        ].filter((item) => isItemAllowed(item.key));

        // 4. NETWORK & OPERATIONS
        const operationsItems = [
            {
                key: '/branches',
                icon: <ApartmentOutlined />,
                label: 'Branches',
            },
            {
                key: '/users',
                icon: <TeamOutlined />,
                label: 'Admin Users',
            },
            {
                key: '/staff',
                icon: <TeamOutlined />,
                label: 'My Staff',
            },
            {
                key: '/partners',
                icon: <TeamOutlined />,
                label: 'Partners',
            },
        ].filter((item) => isItemAllowed(item.key));

        // 5. SYSTEM CONFIGURATION
        const settingsChildren = [
            {
                key: '/settings',
                label: 'General',
            },
            ...(user?.role === AdminRole.SUPER_ADMIN
                ? [
                      {
                          key: '/settings/service-areas',
                          icon: <EnvironmentOutlined />,
                          label: 'Service Areas',
                      },
                      {
                          key: '/settings/platform',
                          icon: <SettingOutlined />,
                          label: 'Platform Settings',
                      },
                      {
                          key: '/settings/loyalty',
                          icon: <CrownOutlined />,
                          label: 'Loyalty Levels',
                      },
                      {
                          key: '/settings/app',
                          icon: <MobileOutlined />,
                          label: 'App Settings',
                      },
                  ]
                : []),
        ];

        const settingsItems = canAccessRoute('/settings')
            ? [
                  {
                      key: '/settings-group',
                      icon: <SettingOutlined />,
                      label: 'Settings',
                      children: settingsChildren,
                  },
              ]
            : [];

        const items: MenuProps['items'] = [];

        if (coreItems.length > 0) {
            items.push({
                type: 'group',
                label: 'CORE',
                children: coreItems,
            });
        }

        if (audienceItems.length > 0) {
            items.push({
                type: 'group',
                label: 'AUDIENCE & ENGAGEMENT',
                children: audienceItems,
            });
        }

        if (intelligenceItems.length > 0) {
            items.push({
                type: 'group',
                label: 'INTELLIGENCE & MARKETING',
                children: intelligenceItems,
            });
        }

        if (operationsItems.length > 0) {
            items.push({
                type: 'group',
                label: 'NETWORK & OPERATIONS',
                children: operationsItems,
            });
        }

        if (settingsItems.length > 0) {
            items.push({
                type: 'group',
                label: 'SYSTEM CONFIGURATION',
                children: settingsItems,
            });
        }

        return items;
    }, [can, canAccessRoute, canManageCatalog, canManageCustomers, canManageStaff, isSuperAdmin, user?.role]);

    // Active menu selection key
    const selectedKey = useMemo(() => {
        const path = location.pathname;
        if (path === '/') return '/';
        if (path.startsWith('/orders/cancellations')) return '/orders/cancellations';
        if (path.startsWith('/orders')) return '/orders';
        if (path.startsWith('/products')) return '/products';
        if (path.startsWith('/categories')) return '/categories';
        if (path.startsWith('/inventory')) return '/inventory';
        if (path.startsWith('/customers')) return '/customers';
        if (path.startsWith('/app-users')) return '/app-users';
        if (path.startsWith('/sms')) return '/sms';
        if (path.startsWith('/support-tickets')) return '/support-tickets';
        if (path.startsWith('/assistant-briefings')) return '/assistant-briefings';
        if (path.startsWith('/search-misses')) return '/search-misses';
        if (path.startsWith('/analytics')) return '/analytics';
        if (path.startsWith('/coupons')) return '/coupons';
        if (path.startsWith('/quick-sale')) return '/quick-sale';
        if (path.startsWith('/push-campaigns')) return '/push-campaigns';
        if (path.startsWith('/banners')) return '/banners';
        if (path.startsWith('/branches')) return '/branches';
        if (path.startsWith('/users')) return '/users';
        if (path.startsWith('/staff')) return '/staff';
        if (path.startsWith('/partners')) return '/partners';
        return path;
    }, [location.pathname]);

    const handleMenuClick: MenuProps['onClick'] = (e) => {
        navigate(e.key);
    };

    const handleLogout = async () => {
        await authApi.logout(); // best-effort server session invalidation
        logout();
        navigate('/login');
    };

    const headerTitle = useMemo(() => {
        if (location.pathname === '/') return 'Overview';
        if (location.pathname.startsWith('/products')) return 'Products';
        if (location.pathname.startsWith('/categories')) return 'Categories';
        if (location.pathname.startsWith('/search-misses')) return 'Missed Searches';
        if (location.pathname.startsWith('/inventory')) return 'Inventory';
        if (location.pathname.startsWith('/orders/cancellations')) return 'Cancellations';
        if (location.pathname.startsWith('/orders')) return 'Orders';
        if (location.pathname.startsWith('/customers')) return 'Customers';
        if (location.pathname.startsWith('/app-users')) return 'App Users';
        if (location.pathname.startsWith('/sms')) return 'SMS';
        if (location.pathname.startsWith('/analytics')) return 'Analytics';
        if (location.pathname.startsWith('/coupons')) return 'Coupons';
        if (location.pathname.startsWith('/quick-sale')) return 'Quick Sale';
        if (location.pathname.startsWith('/push-campaigns')) return 'Push Campaigns';
        if (location.pathname.startsWith('/assistant-briefings')) return 'AI Briefings';
        if (location.pathname.startsWith('/banners')) return 'Home Banners';
        if (location.pathname.startsWith('/branches')) return 'Branches';
        if (location.pathname.startsWith('/users')) return 'Admin Users';
        if (location.pathname.startsWith('/staff')) return 'My Staff';
        if (location.pathname.startsWith('/partners')) return 'Partners';
        if (location.pathname.startsWith('/support-tickets')) return 'Support Tickets';
        if (location.pathname.startsWith('/settings')) return 'Settings';

        if (user?.role_name) {
            const name = user.role_name.trim();
            return name.toLowerCase().endsWith('dashboard') ? name : `${name} Dashboard`;
        }
        return 'Overview';
    }, [location.pathname, user?.role_name]);

    return (
        <Layout className="admin-layout-wrapper">
            <style>{adminLayoutStyles}</style>

            {/* Custom Executive Sidebar */}
            <Sider
                trigger={null}
                collapsible
                collapsed={collapsed}
                collapsedWidth={76}
                width={240}
                className="admin-sider-custom"
            >
                {/* Brand Header */}
                <div className="admin-brand-header">
                    <div className="admin-brand-logo-squircle">
                        <svg
                            width="22"
                            height="22"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        >
                            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                            <circle cx="12" cy="12" r="2.2" fill="currentColor" />
                        </svg>
                        <span className="admin-brand-online-dot" />
                    </div>
                    {!collapsed && (
                        <div className="admin-brand-text-col">
                            <div className="admin-brand-title-row">
                                <span className="admin-brand-name">SRIBEES</span>
                                <span className="admin-brand-badge">ONLINE</span>
                            </div>
                            <div className="admin-brand-suite-title" title={roleSuiteName}>
                                {roleSuiteName}
                            </div>
                        </div>
                    )}
                </div>

                {/* Grouped Executive Menu */}
                <Menu
                    theme="light"
                    mode="inline"
                    selectedKeys={[selectedKey]}
                    defaultOpenKeys={location.pathname.startsWith('/settings') ? ['/settings-group'] : []}
                    items={menuItems}
                    onClick={handleMenuClick}
                    className="admin-custom-menu"
                />

                {/* Sider Bottom Telemetry */}
                <div className="admin-sider-bottom">
                    {!collapsed ? (
                        <>
                            <div className="admin-telemetry-pill">
                                <div className="admin-telemetry-left">
                                    <span className="admin-telemetry-dot" />
                                    <span>Live Cloud Sync</span>
                                </div>
                                <span className="admin-telemetry-ver">v2.4.1</span>
                            </div>
                            <div className="admin-user-profile-row">
                                <div className="admin-user-avatar">{userInitials}</div>
                                <div className="admin-user-meta">
                                    <div className="admin-user-name" title={user?.full_name || 'Super Admin'}>
                                        {user?.full_name || 'Super Admin'}
                                    </div>
                                    <div className="admin-user-status">
                                        <span className="admin-user-status-dot" />
                                        <span>System Online</span>
                                    </div>
                                </div>
                            </div>
                        </>
                    ) : (
                        <div style={{ display: 'flex', justifyContent: 'center', padding: '6px 0' }}>
                            <div className="admin-user-avatar" title={user?.full_name || 'Admin'}>
                                {userInitials}
                            </div>
                        </div>
                    )}
                </div>
            </Sider>

            {/* Main Application Body */}
            <Layout style={{ minWidth: 0, background: '#f8fafc' }}>
                {/* Executive Top Header */}
                <Header className="admin-header-custom">
                    <div className="admin-header-left">
                        <div
                            className="admin-trigger-btn trigger"
                            onClick={() => setCollapsed(!collapsed)}
                            title={collapsed ? 'Expand menu' : 'Collapse menu'}
                        >
                            {collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                        </div>
                        <div className="admin-breadcrumb-nav">
                            <span className="admin-breadcrumb-part">{roleDisplayName}</span>
                            <span className="admin-breadcrumb-sep">/</span>
                            <span className="admin-breadcrumb-active">{headerTitle}</span>
                        </div>
                    </div>

                    <div className="admin-header-right">
                        {user?.branch_name && (
                            <Tag color="cyan" style={{ borderRadius: 12, padding: '2px 10px', fontWeight: 600 }}>
                                {user.branch_name}
                            </Tag>
                        )}
                        <div className="admin-role-pill">
                            <span className="admin-role-pill-dot" />
                            <span>{roleDisplayName}</span>
                        </div>
                        <div className="admin-user-welcome-chip">
                            <div className="admin-user-welcome-avatar">{userInitials}</div>
                            <span>Welcome, {user?.full_name || 'Super Admin'}</span>
                        </div>
                        <Popconfirm
                            title="Log Out"
                            description="Are you sure you want to log out?"
                            onConfirm={handleLogout}
                            okText="Yes, Log Out"
                            cancelText="Cancel"
                            okButtonProps={{ danger: true }}
                            placement="bottomRight"
                        >
                            <button
                                type="button"
                                className="admin-logout-btn"
                                title="Log Out"
                            >
                                <LogoutOutlined style={{ fontSize: 13 }} />
                                <span>Log Out</span>
                            </button>
                        </Popconfirm>
                    </div>
                </Header>

                {/* Page Content Outlet */}
                <Content
                    style={{
                        margin: '20px 24px',
                        minHeight: 280,
                        background: 'transparent',
                    }}
                >
                    <Outlet />
                </Content>
            </Layout>
        </Layout>
    );
};

export default AdminLayout;
