// Option ID mappings (internal, not displayed to users)
export const USER_TYPE_OPTIONS = {
  architect: { id: 2686527, label: "Architect" },
  homeOwner: { id: 2686528, label: "Home owner" },
} as const;

export const CATEGORY_OPTIONS = {
  tiles: { id: 2689623, label: "Tiles" },
  panels: { id: 2689624, label: "Panels" },
  laminates: { id: 2689625, label: "Laminates" },
  wallpapers: { id: 2689626, label: "Wallpapers" },
  woodenFlooring: { id: 2689627, label: "Wooden Flooring" },
  others: { id: 2689628, label: "Others" },
} as const;

export const PROJECT_TYPE_OPTIONS = {
  new: { id: 2647634, label: "New" },
  renovation: { id: 2647635, label: "Renovation" },
} as const;

export const PROPERTY_TYPE_OPTIONS = {
  apartment: { id: 2647636, label: "Residential - Apartment" },
  independentHouse: { id: 2647637, label: "Residential - Independent House" },
  commercial: { id: 2647638, label: "Commercial" },
} as const;

export interface LeadData {
  id: number;
  customFieldValues: {
    cfUserType?: number;
    cfCategoriesOfInterest?: number[];
    cfProjectType?: number;
    cfPropertyType?: number;
    cfPropertyName?: string;
  };
  conversionDetails?: {
    contactId?: number;
  };
}

export interface FormData {
  phoneNumber: string;
  name: string;
  userType: keyof typeof USER_TYPE_OPTIONS | null;
  categories: (keyof typeof CATEGORY_OPTIONS)[];
  projectType: keyof typeof PROJECT_TYPE_OPTIONS | null;
  propertyType: keyof typeof PROPERTY_TYPE_OPTIONS | null;
  propertyName: string;
}

export type FormStep = 0 | 1 | 2 | 3;
