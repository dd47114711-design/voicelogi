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
  department: Department;
  displayOrder: number;
  currentStatusId: string;
  currentStatus: StatusDto;
};
