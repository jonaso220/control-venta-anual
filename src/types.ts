export interface ProductAmounts {
  sifones: number;
  litros6: number;
  litros12: number;
  litros20: number;
}

export interface SalesEntry extends ProductAmounts {
  id?: string;
  year: number;
  month: number; // 1-12
  /** Margen unitario aplicado al guardar. Los registros antiguos pueden no tenerlo. */
  marginSnapshot?: ProductAmounts;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface PriceConfig extends ProductAmounts {
  id?: string;
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

export interface VariableExpense {
  id?: string;
  date: string; // YYYY-MM-DD
  description: string;
  amount: number;
  category: ExpenseCategory;
  notes?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface SalesGoal {
  id?: string;
  year: number;
  month: number; // 1-12
  targetMargin?: number;
  /** @deprecated Campo legado; usar targetMargin para nuevas metas. */
  targetIncome?: number;
  targetSifones?: number;
  targetLitros6?: number;
  targetLitros12?: number;
  targetLitros20?: number;
  createdAt?: Date;
  updatedAt?: Date;
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

/** Estado vacío: cada cuenta debe configurar sus propios márgenes en Firestore. */
export const EMPTY_MARGINS: PriceConfig = {
  sifones: 0,
  litros6: 0,
  litros12: 0,
  litros20: 0,
};
