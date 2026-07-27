export type Department = "DOBOKU" | "UNYU";

export type StatusDto = {
  id: string;
  label: string;
  color: string;
  icon: string;
  sortOrder: number;
};

export type EmployeeDto = {
  id: string;
  name: string;
  homeDepartment: Department;
  currentDepartment: Department;
  displayOrder: number;
  currentStatusId: string;
  currentStatus: StatusDto;
};

export type WorkCategory = "DOBOKU" | "UNYU" | "HOSO" | "SONOTA";
export type OrderCategory = "KOKYO" | "MINKAN" | "FUMEI";

export type ClientDto = {
  id: string;
  name: string;
  isActive: boolean;
};

export type SitePriceDto = {
  id: string;
  siteId: string;
  vehicleType: string | null;
  dayPrice: number | null;
  nightPrice: number | null;
  otherPrice: number | null;
  validFrom: string | null;
  validTo: string | null;
  notes: string | null;
  needsReview: boolean;
  reviewReason: string | null;
  reviewedAt: string | null;
};

export type SiteDto = {
  id: string;
  clientId: string;
  client: ClientDto;
  name: string;
  workCategory: WorkCategory;
  orderCategory: OrderCategory;
  notes: string | null;
  isActive: boolean;
  needsReview: boolean;
  reviewReason: string | null;
  reviewedAt: string | null;
  prices: SitePriceDto[];
};
