interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  color?: "indigo" | "green" | "yellow" | "red" | "blue";
}

export default function StatCard({ title, value, subtitle }: StatCardProps) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{title}</p>
      <p className="mt-1 font-mono text-[22px] font-bold text-black">{value}</p>
      {subtitle && <p className="mt-0.5 text-[10px] text-gray-400">{subtitle}</p>}
    </div>
  );
}
