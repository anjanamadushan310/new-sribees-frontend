import React, { useState, useMemo, useEffect } from 'react';
import { Layout, Menu, theme, Tag } from 'antd';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
    DashboardOutlined,
    ShoppingOutlined,
    ShoppingCartOutlined,
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
} from '@ant-design/icons';
import { useAuthStore } from '../../store/authStore';
import { usePermissions } from '../../hooks/usePermissions';
import { ROLE_NAMES, AdminRole } from '../../types/admin.types';
import { authApi } from '../../api/auth.api';
import type { MenuProps } from 'antd';

const { Header, Sider, Content } = Layout;

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
    const {
        token: { colorBgContainer, borderRadiusLG },
    } = theme.useToken();

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

    // Define all menu items with their required permissions
    const allMenuItems: MenuProps['items'] = useMemo(() => [
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
            key: '/customers',
            icon: <UserOutlined />,
            label: 'Customers',
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
            key: '/quick-sale',
            icon: <ThunderboltOutlined />,
            label: 'Quick Sale',
        },
        {
            key: '/banners',
            icon: <PictureOutlined />,
            label: 'Home Banners',
        },
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
        {
            key: '/settings-group',
            icon: <SettingOutlined />,
            label: 'Settings',
            children: [
                {
                    key: '/settings',
                    label: 'General',
                },
                // Platform & App Settings - Only visible to Super Admin
                ...(user?.role === AdminRole.SUPER_ADMIN ? [
                    {
                        key: '/settings/platform',
                        icon: <SettingOutlined />,
                        label: 'Platform Settings',
                    },
                    {
                        key: '/settings/app',
                        icon: <MobileOutlined />,
                        label: 'App Settings',
                    },
                ] : []),
            ],
        },
    ], [user?.role]);

    // Filter menu items based on user permissions
    const menuItems = useMemo(() => {
        return allMenuItems.filter((item) => {
            if (!item || typeof item.key !== 'string') return false;
            // Catalog entries are gated on catalog access; others by route permission.
            if (item.key === '/products' || item.key === '/categories') {
                return canManageCatalog;
            }
            if (item.key === '/customers') {
                return canManageCustomers;
            }
            if (item.key === '/staff') {
                return canManageStaff;
            }
            // Base-role-exclusive pages: 'users'/'branches'/'partners' are
            // deliberately excluded from the delegatable permission catalog
            // (see permission_catalog.py EXCLUDED_RESOURCES) so they can
            // never be granted to anyone, including Super Admin, via a
            // permission. Route-gated to Super Admin only in router.tsx —
            // this must match that, not the generic permission check below,
            // or Super Admin's own nav items for them silently disappear
            // (their effective permission set has no 'users'/'branches'/
            // 'partners' entries either, by the same design).
            if (item.key === '/users' || item.key === '/branches' || item.key === '/partners') {
                return isSuperAdmin;
            }
            return canAccessRoute(item.key);
        });
    }, [allMenuItems, canAccessRoute, canManageCatalog, canManageCustomers, canManageStaff, isSuperAdmin]);

    const handleMenuClick: MenuProps['onClick'] = (e) => {
        navigate(e.key);
    };

    const handleLogout = async () => {
        await authApi.logout(); // best-effort server session invalidation
        logout();
        navigate('/login');
    };

    return (
        <Layout style={{ minHeight: '100vh' }}>
            <Sider trigger={null} collapsible collapsed={collapsed}>
                <div
                    style={{
                        height: 64,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'white',
                        fontSize: collapsed ? 16 : 20,
                        fontWeight: 'bold',
                    }}
                >
                    {collapsed ? 'SB' : 'SRIBEESonline'}
                </div>
                <Menu
                    theme="dark"
                    mode="inline"
                    selectedKeys={[location.pathname]}
                    items={menuItems}
                    onClick={handleMenuClick}
                />
            </Sider>
            <Layout>
                <Header
                    style={{
                        padding: '0 24px',
                        background: colorBgContainer,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                        {React.createElement(collapsed ? MenuUnfoldOutlined : MenuFoldOutlined, {
                            className: 'trigger',
                            onClick: () => setCollapsed(!collapsed),
                            style: { fontSize: 18, cursor: 'pointer' },
                        })}
                        <h2 style={{ margin: 0 }}>Admin Dashboard</h2>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                        {user?.branch_name && (
                            <Tag color="blue">{user.branch_name}</Tag>
                        )}
                        {role && (
                            <Tag color="green">{user?.role_name || ROLE_NAMES[role] || role}</Tag>
                        )}
                        <span>Welcome, {user?.full_name || 'Admin'}</span>
                        <LogoutOutlined
                            onClick={handleLogout}
                            style={{ fontSize: 18, cursor: 'pointer' }}
                        />
                    </div>
                </Header>
                <Content
                    style={{
                        margin: '24px 16px',
                        padding: 24,
                        minHeight: 280,
                        background: colorBgContainer,
                        borderRadius: borderRadiusLG,
                    }}
                >
                    <Outlet />
                </Content>
            </Layout>
        </Layout>
    );
};

export default AdminLayout;
