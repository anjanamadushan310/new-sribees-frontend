/**
 * SRIBEESonline Admin Dashboard Router
 * Role-based routing with protected routes and branch isolation
 */

import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import { AdminRole, BASE_ADMIN_ROLES, isValidAdminRole } from './types/admin.types';
import { Spin } from 'antd';

// Layout
import AdminLayout from './components/layout/AdminLayout';
import { RoleGuard } from './components/guards/RoleGuard';

// Auth Pages (eager load)
import Login from './pages/Auth/Login';

// Lazy load pages for better performance
const Dashboard = lazy(() => import('./pages/Dashboard/index.page'));
const DashboardHome = lazy(() => import('./pages/Dashboard/DashboardHome'));
const MarketingDashboard = lazy(() => import('./pages/Dashboard/MarketingDashboard'));
const InventoryDashboard = lazy(() => import('./pages/Dashboard/InventoryDashboard'));
const StaffDashboard = lazy(() => import('./pages/Dashboard/StaffDashboard'));

// Products
const ProductList = lazy(() => import('./pages/Products/ProductList'));
const ProductForm = lazy(() => import('./pages/Products/ProductForm'));

// Categories
const CategoryList = lazy(() => import('./pages/Categories/CategoryList'));

// Marketing
const CouponList = lazy(() => import('./pages/Marketing/CouponList'));
const QuickSale = lazy(() => import('./pages/Marketing/QuickSale'));
const BannerList = lazy(() => import('./pages/Marketing/BannerList'));

// Orders
const OrderList = lazy(() => import('./pages/Orders/OrderList'));

// Inventory
const BranchInventory = lazy(() => import('./pages/Inventory/BranchInventory'));
const StockTransfers = lazy(() => import('./pages/Inventory/StockTransfers'));
const LowStockReport = lazy(() => import('./pages/Inventory/LowStockReport'));

// Analytics
const Analytics = lazy(() => import('./pages/Analytics/Analytics'));
const WatchlistAnalytics = lazy(() => import('./pages/Analytics/WatchlistAnalytics'));
const BranchAnalytics = lazy(() => import('./pages/Analytics/BranchAnalytics'));

// Users & Branches (Super Admin only)
const AdminUserList = lazy(() => import('./pages/Users/AdminUserList'));
const BranchList = lazy(() => import('./pages/Branches/BranchList'));
const PartnerList = lazy(() => import('./pages/Partners/PartnerList'));

// Staff — any base-role admin manages their own delegated staff
const StaffList = lazy(() => import('./pages/Staff/StaffList'));

// Customers
const CustomerList = lazy(() => import('./pages/Customers/CustomerList'));

// Settings
const Settings = lazy(() => import('./pages/Settings'));
const AppSettings = lazy(() => import('./pages/Settings/AppSettings'));
const PlatformSettings = lazy(() => import('./pages/Settings/PlatformSettings'));

// Loading Spinner Component
const PageLoader: React.FC = () => (
    <Spin size="large" tip="Loading..." fullscreen />
);

// Protected Route Component - handles hydration from localStorage
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
    const user = useAuthStore((state) => state.user);
    const [isHydrated, setIsHydrated] = React.useState(() => {
        // Check immediately if already hydrated
        return useAuthStore.persist?.hasHydrated?.() ?? true;
    });

    React.useEffect(() => {
        // If not hydrated yet, wait for it
        if (!isHydrated && useAuthStore.persist?.onFinishHydration) {
            const unsubscribe = useAuthStore.persist.onFinishHydration(() => {
                setIsHydrated(true);
            });
            return unsubscribe;
        }
    }, [isHydrated]);

    // Show loading while hydrating
    if (!isHydrated) {
        return <PageLoader />;
    }

    // Strict gate: must be authenticated AND carry a role the backend
    // RBAC actually defines. Anything else goes back to the login screen.
    if (!isAuthenticated || !user || !isValidAdminRole(user.role)) {
        return <Navigate to="/login" replace />;
    }

    return <>{children}</>;
};

// Dashboard Router - Routes to appropriate dashboard based on role
const DashboardRouter: React.FC = () => {
    const user = useAuthStore((state) => state.user);

    if (!user) return <Navigate to="/login" replace />;

    switch (user.role) {
        // Analytics-permitted roles get the data-driven, branch-scoped dashboard.
        case AdminRole.SUPER_ADMIN:
            return <DashboardHome />;
        case AdminRole.BRANCH_MANAGER:
            return <DashboardHome />;
        case AdminRole.MARKETING_MANAGER:
            return <MarketingDashboard />;
        case AdminRole.INVENTORY_MANAGER:
            return <InventoryDashboard />;
        case AdminRole.CUSTOMER_SUPPORT:
            return <StaffDashboard />;
        default:
            return <Dashboard />;
    }
};

const AppRouter: React.FC = () => {
    return (
        <BrowserRouter>
            <Suspense fallback={<PageLoader />}>
                <Routes>
                    {/* Public Routes */}
                    <Route path="/login" element={<Login />} />

                    {/* Protected Routes */}
                    <Route
                        path="/"
                        element={
                            <ProtectedRoute>
                                <AdminLayout />
                            </ProtectedRoute>
                        }
                    >
                        {/* Dashboard - Role-based */}
                        <Route index element={<DashboardRouter />} />

                        {/* Catalog: Products & Categories. Permission-gated (not
                            role-gated) so a staff account delegated
                            products/categories permissions can reach these too —
                            matches the server, which now checks the same way via
                            require_permission on any route migrated to it. */}
                        <Route
                            path="products"
                            element={
                                <RoleGuard requiredPermission={{ resource: 'products', action: 'read' }}>
                                    <ProductList />
                                </RoleGuard>
                            }
                        />
                        <Route
                            path="products/new"
                            element={
                                <RoleGuard requiredPermission={{ resource: 'products', action: 'create' }}>
                                    <ProductForm />
                                </RoleGuard>
                            }
                        />
                        <Route
                            path="products/:id/edit"
                            element={
                                <RoleGuard requiredPermission={{ resource: 'products', action: 'update' }}>
                                    <ProductForm />
                                </RoleGuard>
                            }
                        />

                        {/* Categories */}
                        <Route
                            path="categories"
                            element={
                                <RoleGuard requiredPermission={{ resource: 'categories', action: 'read' }}>
                                    <CategoryList />
                                </RoleGuard>
                            }
                        />

                        {/* Orders */}
                        {/* Order details open in a drawer from the list. Open to
                            any authenticated admin — unchanged. */}
                        <Route path="orders" element={<OrderList />} />

                        {/* Inventory */}
                        <Route
                            path="inventory"
                            element={
                                <RoleGuard requiredPermission={{ resource: 'inventory', action: 'read' }}>
                                    <BranchInventory />
                                </RoleGuard>
                            }
                        />
                        <Route
                            path="inventory/transfers"
                            element={
                                <RoleGuard requiredPermission={{ resource: 'transfers', action: 'read' }}>
                                    <StockTransfers />
                                </RoleGuard>
                            }
                        />
                        <Route
                            path="inventory/low-stock"
                            element={
                                <RoleGuard requiredPermission={{ resource: 'inventory', action: 'read' }}>
                                    <LowStockReport />
                                </RoleGuard>
                            }
                        />

                        {/* Analytics — mirrors the server guard on
                            /admin/analytics/*: super_admin + branch_manager only
                            (analytics isn't in the delegatable catalog for the
                            other 3 base roles either, see permission_catalog.py,
                            so permission-gating and role-gating agree here). */}
                        <Route
                            path="analytics"
                            element={
                                <RoleGuard requiredPermission={{ resource: 'analytics', action: 'read' }}>
                                    <Analytics />
                                </RoleGuard>
                            }
                        />
                        <Route
                            path="analytics/watchlist"
                            element={
                                <RoleGuard requiredPermission={{ resource: 'watchlist', action: 'read' }}>
                                    <WatchlistAnalytics />
                                </RoleGuard>
                            }
                        />
                        <Route
                            path="analytics/branch/:branchId?"
                            element={
                                <RoleGuard requiredPermission={{ resource: 'analytics', action: 'read' }}>
                                    <BranchAnalytics />
                                </RoleGuard>
                            }
                        />

                        {/* Marketing — Coupons */}
                        <Route
                            path="coupons"
                            element={
                                <RoleGuard requiredPermission={{ resource: 'marketing', action: 'read' }}>
                                    <CouponList />
                                </RoleGuard>
                            }
                        />

                        {/* Marketing — Quick Sale */}
                        <Route
                            path="quick-sale"
                            element={
                                <RoleGuard requiredPermission={{ resource: 'marketing', action: 'read' }}>
                                    <QuickSale />
                                </RoleGuard>
                            }
                        />

                        {/* Home Banners */}
                        <Route
                            path="banners"
                            element={
                                <RoleGuard requiredPermission={{ resource: 'banners', action: 'read' }}>
                                    <BannerList />
                                </RoleGuard>
                            }
                        />

                        {/* Customers */}
                        <Route
                            path="customers"
                            element={
                                <RoleGuard requiredPermission={{ resource: 'customers', action: 'read' }}>
                                    <CustomerList />
                                </RoleGuard>
                            }
                        />

                        {/* Staff — any base-role admin manages their own
                            delegated staff. Role-gated, not permission-gated:
                            "can I have staff at all" is a require_base_role_admin
                            policy on the server, not a catalog permission — there
                            is no 'staff:*' permission a role could hold. */}
                        <Route
                            path="staff"
                            element={
                                <RoleGuard allowedRoles={[...BASE_ADMIN_ROLES]}>
                                    <StaffList />
                                </RoleGuard>
                            }
                        />

                        {/* Users - Super Admin only (modal-based CRUD over the 5
                            base roles). Role-gated: 'users' is excluded from the
                            delegatable catalog entirely, so no permission could
                            ever grant this to a staff account. */}
                        <Route
                            path="users"
                            element={
                                <RoleGuard allowedRoles={[AdminRole.SUPER_ADMIN]}>
                                    <AdminUserList />
                                </RoleGuard>
                            }
                        />

                        {/* Branches - Super Admin only (same reasoning as Users) */}
                        <Route
                            path="branches"
                            element={
                                <RoleGuard allowedRoles={[AdminRole.SUPER_ADMIN]}>
                                    <BranchList />
                                </RoleGuard>
                            }
                        />

                        {/* Partners - Super Admin only (professional referral team) */}
                        <Route
                            path="partners"
                            element={
                                <RoleGuard allowedRoles={[AdminRole.SUPER_ADMIN]}>
                                    <PartnerList />
                                </RoleGuard>
                            }
                        />

                        {/* Settings */}
                        <Route path="settings" element={<Settings />} />

                        {/* App Settings - Super Admin only (Splash Video, etc.) */}
                        <Route
                            path="settings/app"
                            element={
                                <RoleGuard allowedRoles={[AdminRole.SUPER_ADMIN]}>
                                    <AppSettings />
                                </RoleGuard>
                            }
                        />

                        {/* Platform Settings - Super Admin only (pricing, tax, splash) */}
                        <Route
                            path="settings/platform"
                            element={
                                <RoleGuard allowedRoles={[AdminRole.SUPER_ADMIN]}>
                                    <PlatformSettings />
                                </RoleGuard>
                            }
                        />
                    </Route>

                    {/* Fallback - Redirect to dashboard */}
                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
            </Suspense>
        </BrowserRouter>
    );
};

export default AppRouter;
