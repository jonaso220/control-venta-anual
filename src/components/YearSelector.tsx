import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';

interface YearSelectorProps {
  year: number;
  onChange: (year: number) => void;
}

export default function YearSelector({ year, onChange }: YearSelectorProps) {
  return (
    <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-2 py-1 shadow-sm dark:bg-slate-700 dark:border-slate-600">
      <Calendar className="w-4 h-4 text-slate-400" />
      <button
        onClick={() => onChange(year - 1)}
        disabled={year <= 2000}
        className="p-2 hover:bg-slate-100 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed dark:hover:bg-slate-600"
        aria-label="Año anterior"
      >
        <ChevronLeft className="w-4 h-4 text-slate-500 dark:text-slate-300" />
      </button>
      <label className="sr-only" htmlFor="selected-year">Año de consulta</label>
      <select id="selected-year" value={year} onChange={event => onChange(Number(event.target.value))} className="bg-transparent py-2 font-semibold text-slate-900 dark:text-slate-100" aria-label="Año de consulta">
        {Array.from({ length: 100 }, (_, index) => 2000 + index).map(value => <option key={value} value={value}>{value}</option>)}
      </select>
      <button
        onClick={() => onChange(year + 1)}
        disabled={year >= 2099}
        className="p-2 hover:bg-slate-100 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed dark:hover:bg-slate-600"
        aria-label="Año siguiente"
      >
        <ChevronRight className="w-4 h-4 text-slate-500 dark:text-slate-300" />
      </button>
    </div>
  );
}
