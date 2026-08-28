/**
 * Admin Branch Category Visibility API (/api/v1/admin/branch-categories)
 *
 * Per-branch counterpart to the Inventory API, but for categories instead of
 * products: a category is global, but whether it (and browsing into it)
 * shows to a branch's customers is a per-branch on/off switch a Branch
 * Manager controls here. Open to Branch Managers for their own branch, and
 * to Super Admins for any branch via ?branch_id=.
 */
import apiClient from './client';

export interface BranchCategoryItem {
    category_id: string;
    name: string;
    slug: string;
    parent_category_id: string | null;
    /** The category's platform-wide switch — off means it's hidden everywhere, not just here. */
    globally_active: boolean;
    /** This branch's own switch. */
    is_active: boolean;
}

interface BranchCategoryListWire {
    success: boolean;
    data: { branch_id: string; categories: BranchCategoryItem[] };
}

interface BranchCategoryUpdateWire {
    success: boolean;
    data: { category_id: string; branch_id: string; is_active: boolean };
    message: string;
}

export const branchCategoriesApi = {
    /** List every category with its visibility status for one branch. */
    list: async (branchId?: string): Promise<BranchCategoryItem[]> => {
        const res = await apiClient.get<BranchCategoryListWire>('/admin/branch-categories', {
            params: branchId ? { branch_id: branchId } : undefined,
        });
        return res.data.data.categories;
    },

    /** Activate/deactivate one category for a branch. */
    setStatus: async (
        categoryId: string,
        isActive: boolean,
        branchId?: string
    ): Promise<boolean> => {
        const res = await apiClient.patch<BranchCategoryUpdateWire>(
            `/admin/branch-categories/${categoryId}`,
            { is_active: isActive },
            { params: branchId ? { branch_id: branchId } : undefined }
        );
        return res.data.data.is_active;
    },
};
