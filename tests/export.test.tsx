import { beforeEach, describe, expect, it, vi } from 'vitest';
import { exportYearExcel } from '../src/services/export';

const writer = vi.hoisted(() => {
  const toFile = vi.fn(async () => undefined);
  const writeXlsxFile = vi.fn(() => ({ toFile }));
  return { toFile, writeXlsxFile };
});

vi.mock('write-excel-file/browser', () => ({
  default: writer.writeXlsxFile,
}));

describe('exportYearExcel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('genera las cinco hojas esperadas y descarga el año seleccionado', async () => {
    await exportYearExcel([], [], [], {
      sifones: 21.75,
      litros6: 39,
      litros12: 91,
      litros20: 136,
    }, 2026);

    expect(writer.writeXlsxFile).toHaveBeenCalledTimes(1);
    const sheets = writer.writeXlsxFile.mock.calls[0][0];
    expect(sheets.map((sheet: { sheet: string }) => sheet.sheet)).toEqual([
      'Resumen',
      'Ventas',
      'Gastos Fijos',
      'Gastos Variables',
      'Márgenes actuales',
    ]);
    expect(sheets.every((sheet: { data: unknown[] }) => sheet.data.length > 0)).toBe(true);
    expect(writer.toFile).toHaveBeenCalledWith('informe_anual_2026.xlsx');
  });

  it('exporta el snapshot de gasto fijo aplicable a cada mes del año', async () => {
    await exportYearExcel([], [{
      id: 'fixed-1',
      name: 'Alquiler actual',
      amount: 999,
      dueDate: 'Mensual',
      category: 'otros',
      isActive: true,
      historyVersion: 1,
      latestEffectiveFrom: '2026-07',
      versions: [
        {
          id: 'fixed-1__2000-01',
          expenseId: 'fixed-1',
          effectiveFrom: '2000-01',
          name: 'Alquiler anterior',
          amount: 100,
          dueDate: 'Mensual',
          category: 'otros',
          isActive: true,
        },
        {
          id: 'fixed-1__2026-07',
          expenseId: 'fixed-1',
          effectiveFrom: '2026-07',
          name: 'Alquiler nuevo',
          amount: 200,
          dueDate: 'Mensual',
          category: 'otros',
          isActive: true,
        },
      ],
    }], [], { sifones: 1, litros6: 1, litros12: 1, litros20: 1 }, 2026);

    const sheets = writer.writeXlsxFile.mock.calls[0][0];
    const fixedSheet = sheets.find((sheet: { sheet: string }) => sheet.sheet === 'Gastos Fijos');
    expect(fixedSheet.data[0].map((cell: { value: string }) => cell.value)).toEqual([
      'Mes', 'Nombre', 'Categoría', 'Vencimiento', 'Monto', 'Estado', 'Notas',
    ]);
    expect(fixedSheet.data[1]).toEqual(['Enero', 'Alquiler anterior', 'Otros', 'Mensual', 100, 'Activo', '']);
    expect(fixedSheet.data[7]).toEqual(['Julio', 'Alquiler nuevo', 'Otros', 'Mensual', 200, 'Activo', '']);
  });
});
