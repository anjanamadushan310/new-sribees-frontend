/**
 * Product Types for SRIBEESonline Admin Dashboard
 */

// Product Image Types
export interface ProductImage {
    image_id?: string;
    url: string;
    alt_text?: string;
    is_primary: boolean;
    sort_order: number;
}

export interface ProductImageGallery {
    thumbnail: ProductImage | null;
    gallery: ProductImage[];
}

// Variant Types
export interface VariantOption {
    variant_option_id: string;
    variant_type_id: string;
    value: string;
    color_hex?: string;
    display_order: number;
}

export interface VariantType {
    variant_type_id: string;
    name: string;
    display_name: string;
    options: VariantOption[];
}

export interface ProductVariant {
    variant_id: string;
    product_id: string;
    sku: string;
    name: string;
    price: number;
    compare_at_price?: number;
    stock_quantity: number;
    weight?: number;
    weight_unit?: string;
    image_url?: string;
    is_default: boolean;
    is_active: boolean;
    display_order: number;
    options: VariantOption[];
    branch_stock?: BranchVariantStock[];
}

export interface BranchVariantStock {
    branch_id: string;
    branch_name: string;
    stock_quantity: number;
    reserved_quantity: number;
    low_stock_threshold: number;
    is_low_stock: boolean;
}

// Product Types
export interface Product {
    product_id: string;
    sku: string;
    name: string;
    description: string;
    short_description?: string;
    category_id: string;
    category_name?: string;
    brand?: string;
    price: number;
    compare_at_price?: number;
    cost_price?: number;
    stock_quantity: number;
    low_stock_threshold: number;
    is_active: boolean;
    is_featured: boolean;
    /**
     * Global cashback % across all branches. null = use the platform rate.
     * A branch can override this per product from Quick Sale.
     */
    cashback_percentage?: number | null;
    has_variants: boolean;
    weight?: number;
    weight_unit?: string;
    images: ProductImage[];
    variants?: ProductVariant[];
    tags?: string[];
    rating_average?: number;
    review_count?: number;
    created_at: string;
    updated_at: string;
}

// Product Form Data
export interface ProductFormData {
    name: string;
    sku: string;
    description: string;
    short_description?: string;
    category_id: string;
    brand?: string;
    price: number;
    compare_at_price?: number;
    cost_price?: number;
    stock_quantity: number;
    low_stock_threshold: number;
    is_active: boolean;
    is_featured: boolean;
    /** Global cashback % across all branches; null clears it back to the platform rate. */
    cashback_percentage?: number | null;
    has_variants: boolean;
    weight?: number;
    weight_unit?: string;
    tags?: string[];
}

// Category Types
export interface Category {
    category_id: string;
    name: string;
    slug: string;
    description?: string;
    parent_id?: string;
    image_url?: string;
    display_order: number;
    is_active: boolean;
    product_count?: number;
    children?: Category[];
}

// Product List Filters
export interface ProductFilters {
    search?: string;
    category_id?: string;
    is_active?: boolean;
    is_featured?: boolean;
    has_variants?: boolean;
    low_stock?: boolean;
    min_price?: number;
    max_price?: number;
    sort_by?: 'name' | 'price' | 'stock' | 'created_at' | 'updated_at';
    sort_order?: 'asc' | 'desc';
    page?: number;
    limit?: number;
    branch_id?: string;
}

// Product API Response
export interface ProductListResponse {
    success: boolean;
    data: {
        products: Product[];
        pagination: {
            total: number;
            page: number;
            limit: number;
            total_pages: number;
        };
    };
}

export interface ProductDetailResponse {
    success: boolean;
    data: Product;
}

// Image Upload
export interface ImageUploadResponse {
    success: boolean;
    data: {
        url: string;
        filename: string;
    };
}
