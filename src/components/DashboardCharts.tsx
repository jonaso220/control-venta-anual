import { BarChart3, PieChart as PieIcon, ShoppingCart, TrendingUp } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatCurrency } from '../utils/format';

interface ChartDatum {
  month: string;
  monthFull: string;
  margenBruto: number;
  gastos: number;
  resultado: number;
  sifones: number;
  litros6: number;
  litros12: number;
  litros20: number;
  totalUnidades: number;
}

interface CategoryDatum {
  name: string;
  value: number;
  color: string;
}

interface DashboardChartsProps {
  chartData: ChartDatum[];
  expensesByCategory: CategoryDatum[];
}

export default function DashboardCharts({ chartData, expensesByCategory }: DashboardChartsProps) {
  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard
          icon={<BarChart3 className="w-5 h-5 text-slate-400" />}
          title="Margen bruto vs gastos"
          accessibleContent={(
            <AccessibleDataTable
              caption="Valores mensuales de margen bruto y gastos"
              headers={['Mes', 'Margen bruto', 'Gastos']}
              rows={chartData.map(month => ({
                key: month.monthFull,
                cells: [month.monthFull, formatCurrency(month.margenBruto), formatCurrency(month.gastos)],
              }))}
              emptyMessage="No hay datos financieros para este periodo."
            />
          )}
        >
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
            <BarChart data={chartData} accessibilityLayer={false}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="#94a3b8" />
              <YAxis tick={{ fontSize: 12 }} stroke="#94a3b8" />
              <Tooltip
                formatter={(value) => formatCurrency(Number(value))}
                contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0' }}
              />
              <Legend />
              <Bar dataKey="margenBruto" name="Margen bruto" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              <Bar dataKey="gastos" name="Gastos" fill="#ef4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          icon={<TrendingUp className="w-5 h-5 text-slate-400" />}
          title="Resultado mensual"
          accessibleContent={(
            <AccessibleDataTable
              caption="Valores mensuales de resultado neto"
              headers={['Mes', 'Resultado neto']}
              rows={chartData.map(month => ({
                key: month.monthFull,
                cells: [month.monthFull, formatCurrency(month.resultado)],
              }))}
              emptyMessage="No hay resultados mensuales para este periodo."
            />
          )}
        >
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
            <LineChart data={chartData} accessibilityLayer={false}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="#94a3b8" />
              <YAxis tick={{ fontSize: 12 }} stroke="#94a3b8" />
              <Tooltip
                formatter={(value) => formatCurrency(Number(value))}
                contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0' }}
              />
              <Line type="monotone" dataKey="resultado" name="Resultado neto" stroke="#10b981" strokeWidth={2} dot={{ fill: '#10b981' }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard
          icon={<ShoppingCart className="w-5 h-5 text-slate-400" />}
          title="Ventas por Producto"
          accessibleContent={(
            <AccessibleDataTable
              caption="Unidades vendidas por producto y mes"
              headers={['Mes', 'Sifones', '6 litros', '12 litros', '20 litros', 'Total unidades']}
              rows={chartData.map(month => ({
                key: month.monthFull,
                cells: [
                  month.monthFull,
                  month.sifones.toLocaleString('es-UY'),
                  month.litros6.toLocaleString('es-UY'),
                  month.litros12.toLocaleString('es-UY'),
                  month.litros20.toLocaleString('es-UY'),
                  month.totalUnidades.toLocaleString('es-UY'),
                ],
              }))}
              emptyMessage="No hay ventas para este periodo."
            />
          )}
        >
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
            <BarChart data={chartData} accessibilityLayer={false}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="#94a3b8" />
              <YAxis tick={{ fontSize: 12 }} stroke="#94a3b8" />
              <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0' }} />
              <Legend />
              <Bar dataKey="sifones" name="Sifones" fill="#6366f1" radius={[2, 2, 0, 0]} />
              <Bar dataKey="litros6" name="6 Litros" fill="#0ea5e9" radius={[2, 2, 0, 0]} />
              <Bar dataKey="litros12" name="12 Litros" fill="#f59e0b" radius={[2, 2, 0, 0]} />
              <Bar dataKey="litros20" name="20 Litros" fill="#10b981" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          icon={<PieIcon className="w-5 h-5 text-slate-400" />}
          title="Gastos acumulados por categoría"
          accessibleContent={(
            <AccessibleDataTable
              caption="Gastos acumulados por categoría"
              headers={['Categoría', 'Gasto acumulado']}
              rows={expensesByCategory.map(category => ({
                key: category.name,
                cells: [category.name, formatCurrency(category.value)],
              }))}
              emptyMessage="No hay gastos activos para este periodo."
            />
          )}
        >
          {expensesByCategory.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              <PieChart accessibilityLayer={false}>
                <Pie
                  data={expensesByCategory}
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                >
                  {expensesByCategory.map((entry, index) => (
                    <Cell key={index} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => formatCurrency(Number(value))} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-full text-slate-400">
              No hay gastos activos
            </div>
          )}
        </ChartCard>
      </div>
    </>
  );
}

function ChartCard({ icon, title, children, accessibleContent }: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
  accessibleContent: ReactNode;
}) {
  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-4">
        {icon}
        <h3 className="font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
      </div>
      <div className="h-72" aria-hidden="true">{children}</div>
      {accessibleContent}
    </div>
  );
}

interface AccessibleDataTableProps {
  caption: string;
  headers: string[];
  rows: Array<{ key: string; cells: ReactNode[] }>;
  emptyMessage: string;
}

function AccessibleDataTable({ caption, headers, rows, emptyMessage }: AccessibleDataTableProps) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead>
        <tr>
          {headers.map(header => <th key={header} scope="col">{header}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.length > 0 ? rows.map(row => (
          <tr key={row.key}>
            {row.cells.map((cell, index) => index === 0
              ? <th key={headers[index]} scope="row">{cell}</th>
              : <td key={headers[index]}>{cell}</td>)}
          </tr>
        )) : (
          <tr>
            <td colSpan={headers.length}>{emptyMessage}</td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
