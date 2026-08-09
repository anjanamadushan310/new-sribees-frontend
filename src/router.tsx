/**
 * SRIBEESonline Admin Dashboard Router
 * Role-based routing with protected routes and branch isolation
 */

import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import { AdminRole, isValidAdminRole } from './types/admin.types';
import { Spin } from 'antd';

// Layout
import AdminLayout from './components/layout/AdminLayout';

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

// Role-based Route Component
interface RoleRouteProps {
    children: React.ReactNode;
    allowedRoles: AdminRole[];
    fallbackPath?: string;
}

const RoleRoute: React.FC<RoleRouteProps> = ({ 
    children, 
    allowedRoles, 
    fallbackPath = '/' 
}) => {
    const user = useAuthStore((state) => state.user);

    if (!user || !allowedRoles.includes(user.role)) {
        return <Navigate to={fallbackPath} replace />;
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

                        {/* Catalog: Products & Categories — full CRUD limited to
                            Super Admin + Inventory Manager (branch/marketing
                            managers get restricted access in a later module). */}
                        <Route
                            path="products"
                            element={
                                <RoleRoute allowedRoles={[AdminRole.SUPER_ADMIN, AdminRole.INVENTORY_MANAGER]}>
                                    <ProductList />
                                </RoleRoute>
                            }
                        />
                        <Route
                            path="products/new"
                            element={
                                <RoleRoute allowedRoles={[AdminRole.SUPER_ADMIN, AdminRole.INVENTORY_MANAGER]}>
                                    <ProductForm />
                                </RoleRoute>
                            }
                        />
                        <Route
                            path="products/:id/edit"
                            element={
                                <RoleRoute allowedRoles={[AdminRole.SUPER_ADMIN, AdminRole.INVENTORY_MANAGER]}>
                                    <ProductForm />
                                </RoleRoute>
                            }
                        />

                        {/* Categories */}
                        <Route
                            path="categories"
                            element={
                                <RoleRoute allowedRoles={[AdminRole.SUPER_ADMIN, AdminRole.INVENTORY_MANAGER]}>
                                    <CategoryList />
                                </RoleRoute>
                            }
                        />

                        {/* Orders */}
                        {/* Order details open in a drawer from the list. */}
                        <Route path="orders" element={<OrderList />} />

                        {/* Inventory - Manager and above */}
                        <Route 
                            path="inventory" 
                            element={
                                <RoleRoute allowedRoles={[AdminRole.SUPER_ADMIN, AdminRole.BRANCH_MANAGER, AdminRole.INVENTORY_MANAGER]}>
                                    <BranchInventory />
                                </RoleRoute>
                            } 
                        />
                        <Route 
                            path="inventory/transfers" 
                            element={
                                <RoleRoute allowedRoles={[AdminRole.SUPER_ADMIN, AdminRole.BRANCH_MANAGER, AdminRole.INVENTORY_MANAGER]}>
                                    <StockTransfers />
                                </RoleRoute>
                            } 
                        />
                        <Route 
                            path="inventory/low-stock" 
                            element={
                                <RoleRoute allowedRoles={[AdminRole.SUPER_ADMIN, AdminRole.BRANCH_MANAGER, AdminRole.INVENTORY_MANAGER]}>
                                    <LowStockReport />
                                </RoleRoute>
                            } 
                        />

                        {/* Analytics — mirrors the server guard on
                            /admin/analytics/*: super_admin + branch_manager only.
                            Any wider list here just lets a role reach a page
                            whose every request comes back 403. */}
                        <Route
                            path="analytics"
                            element={
                                <RoleRoute allowedRoles={[AdminRole.SUPER_ADMIN, AdminRole.BRANCH_MANAGER]}>
                                    <Analytics />
                                </RoleRoute>
                            }
                        />
                        <Route 
                            path="analytics/watchlist" 
                            element={
                                <RoleRoute allowedRoles={[AdminRole.SUPER_ADMIN, AdminRole.BRANCH_MANAGER]}>
                                    <WatchlistAnalytics />
                                </RoleRoute>
                            } 
                        />
                        <Route 
                            path="analytics/branch/:branchId?" 
                            element={
                                <RoleRoute allowedRoles={[AdminRole.SUPER_ADMIN, AdminRole.BRANCH_MANAGER]}>
                                    <BranchAnalytics />
                                </RoleRoute>
                            } 
                        />

                        {/* Marketing — Coupons (Super Admin + Marketing Manager) */}
                        <Route
                            path="coupons"
                            element={
                                <RoleRoute allowedRoles={[AdminRole.SUPER_ADMIN, AdminRole.MARKETING_MANAGER]}>
                                    <CouponList />
                                </RoleRoute>
                            }
                        />

                        {/* Marketing — Quick Sale (Super Admin + Marketing Manager) */}
                        <Route
                            path="quick-sale"
                            element={
                                <RoleRoute allowedRoles={[AdminRole.SUPER_ADMIN, AdminRole.MARKETING_MANAGER]}>
                                    <QuickSale />
                                </RoleRoute>
                            }
                        />

                        {/* Home Banners — Marketing Managers curate their branch's carousel */}
                        <Route
                            path="banners"
                            element={
                                <RoleRoute
                                    allowedRoles={[
                                        AdminRole.SUPER_ADMIN,
                                        AdminRole.MARKETING_MANAGER,
                                    ]}
                                >
                                    <BannerList />
                                </RoleRoute>
                            }
                        />

                        {/* Customers — Super Admin + Customer Support */}
                        <Route
                            path="customers"
                            element={
                                <RoleRoute allowedRoles={[AdminRole.SUPER_ADMIN, AdminRole.CUSTOMER_SUPPORT]}>
                                    <CustomerList />
                                </RoleRoute>
                            }
                        />

                        {/* Users - Super Admin only (modal-based CRUD) */}
                        <Route
                            path="users"
                            element={
                                <RoleRoute allowedRoles={[AdminRole.SUPER_ADMIN]}>
                                    <AdminUserList />
                                </RoleRoute>
                            }
                        />

                        {/* Branches - Super Admin only */}
                        <Route
                            path="branches"
                            element={
                                <RoleRoute allowedRoles={[AdminRole.SUPER_ADMIN]}>
                                    <BranchList />
                                </RoleRoute>
                            }
                        />

                        {/* Partners - Super Admin only (professional referral team) */}
                        <Route
                            path="partners"
                            element={
                                <RoleRoute allowedRoles={[AdminRole.SUPER_ADMIN]}>
                                    <PartnerList />
                                </RoleRoute>
                            }
                        />

                        {/* Settings */}
                        <Route path="settings" element={<Settings />} />
                        
                        {/* App Settings - Super Admin only (Splash Video, etc.) */}
                        <Route
                            path="settings/app"
                            element={
                                <RoleRoute allowedRoles={[AdminRole.SUPER_ADMIN]}>
                                    <AppSettings />
                                </RoleRoute>
                            }
                        />

                        {/* Platform Settings - Super Admin only (pricing, tax, splash) */}
                        <Route
                            path="settings/platform"
                            element={
                                <RoleRoute allowedRoles={[AdminRole.SUPER_ADMIN]}>
                                    <PlatformSettings />
                                </RoleRoute>
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
