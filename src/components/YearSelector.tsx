import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';

interface YearSelectorProps {
  year: number;
  onChange: (year: number) => void;
}

export default function YearSelector({ year, onChange }: YearSelectorProps) {
  return (
    <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-2 py-1 shadow-sm">
      <Calendar className="w-4 h-4 text-slate-400" />
      <button
        onClick={() => onChange(year - 1)}
        className="p-1 hover:bg-slate-100 rounded transition-colors"
      >
        <ChevronLeft className="w-4 h-4 text-slate-500" />
      </button>
      <span className="font-semibold text-slate-900 min-w-[4ch] text-center">{year}</span>
      <button
        onClick={() => onChange(year + 1)}
        className="p-1 hover:bg-slate-100 rounded transition-colors"
      >
        <ChevronRight className="w-4 h-4 text-slate-500" />
      </button>
    </div>
  );
}
