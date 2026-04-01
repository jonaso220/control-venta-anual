export interface SalesEntry {
  id?: string;
  year: number;
  month: number; // 1-12
  sifones: number;
  litros6: number;
  litros12: number;
  litros20: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface PriceConfig {
  id?: string;
  sifones: number;
  litros6: number;
  litros12: number;
  litros20: number;
  updatedAt?: Date;
}

export interface Expense {
  id?: string;
  name: string;
  amount: number;
  dueDate: string; // e.g., "19 DE C/MES", "MENSUAL", "8 SEMANAL"
  category: ExpenseCategory;
  isActive: boolean;
  notes?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export type ExpenseCategory =
  | 'impuestos'
  | 'prestamos'
  | 'seguros'
  | 'sueldos'
  | 'vehiculo'
  | 'otros';

export interface MonthlyData {
  month: number;
  year: number;
  sales: SalesEntry;
  totalIncome: number;
  totalExpenses: number;
  netProfit: number;
}

export interface User {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

export const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

export const EXPENSE_CATEGORIES: Record<ExpenseCategory, string> = {
  impuestos: 'Impuestos',
  prestamos: 'Prestamos',
  seguros: 'Seguros',
  sueldos: 'Sueldos',
  vehiculo: 'Vehiculo',
  otros: 'Otros',
};

export const DEFAULT_PRICES: PriceConfig = {
  sifones: 21.75,
  litros6: 39.00,
  litros12: 91.00,
  litros20: 136.00,
};

export const DEFAULT_EXPENSES: Omit<Expense, 'id' | 'createdAt' | 'updatedAt'>[] = [
  { name: 'BPS', amount: 2497, dueDate: '19 de c/mes', category: 'impuestos', isActive: true },
  { name: 'DGI: RUC', amount: 5660, dueDate: '18 de c/mes', category: 'impuestos', isActive: true },
  { name: 'Prestamo Moto OCA', amount: 10066, dueDate: '29 de c/mes', category: 'prestamos', isActive: true },
  { name: 'Porto Seguros Camion', amount: 3663.82, dueDate: '15 de c/mes', category: 'seguros', isActive: true },
  { name: 'Sueldo Yesy', amount: 32000, dueDate: '8 semanal', category: 'sueldos', isActive: true },
  { name: 'Combustible', amount: 20000, dueDate: 'Mensual', category: 'vehiculo', isActive: true },
  { name: 'Patente Camion', amount: 710.05, dueDate: 'Mensual', category: 'vehiculo', isActive: true },
  { name: 'Service Camion', amount: 4200, dueDate: 'Mensual', category: 'vehiculo', isActive: true },
  { name: 'Cubiertas Camion', amount: 2000, dueDate: 'Mensual', category: 'vehiculo', isActive: true },
  { name: 'Peaje', amount: 3888, dueDate: 'Mensual', category: 'vehiculo', isActive: true },
];
