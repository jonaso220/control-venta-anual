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
        className="p-1 hover:bg-slate-100 rounded transition-colors dark:hover:bg-slate-600"
        aria-label="Año anterior"
      >
        <ChevronLeft className="w-4 h-4 text-slate-500 dark:text-slate-300" />
      </button>
      <span className="font-semibold text-slate-900 min-w-[4ch] text-center dark:text-slate-100">{year}</span>
      <button
        onClick={() => onChange(year + 1)}
        className="p-1 hover:bg-slate-100 rounded transition-colors dark:hover:bg-slate-600"
        aria-label="Año siguiente"
      >
        <ChevronRight className="w-4 h-4 text-slate-500 dark:text-slate-300" />
      </button>
    </div>
  );
}
