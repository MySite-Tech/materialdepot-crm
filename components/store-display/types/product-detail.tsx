'use client';

interface VariantLocationRow {
  id: number;
  location_id: number | null;
  branch_id?: string;
  is_active?: boolean;
  variant_handle: string;
  product_name: string;
  sku: string | null;
  category: string;
  display_type: string;
  location_string: string;
  is_deleted: boolean;
  image_url: string | null;
  quantity: number;
  private_label_product_name: string | null;
  private_label_brand: string | null;
  branch_name?: string;
}

export interface Props {
  item: VariantLocationRow;
  storeName: string;
  onBack: () => void;
}

export type RemovalReason = 'discontinued_permanently' | 'removed_temporarily';

export type RemovalStatus = 'removal_initiated' | 'removal_completed';

export type ChangeStatus = 'change_initiated' | 'request_completed' | 'request_cancelled';

export interface ChangeLocationRequest {
  status: ChangeStatus;
  vsmId?: number;
  newLocationString: string;
  oldLocationString: string;
  displayType: string;
  quantity: number;
}
