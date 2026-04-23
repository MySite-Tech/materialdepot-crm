interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  color?: "indigo" | "green" | "yellow" | "red" | "blue";
}

const colorMap = {
  indigo: "bg-indigo-50 text-indigo-700 border-indigo-100",
  green: "bg-green-50 text-green-700 border-green-100",
  yellow: "bg-yellow-50 text-yellow-700 border-yellow-100",
  red: "bg-red-50 text-red-700 border-red-100",
  blue: "bg-blue-50 text-blue-700 border-blue-100",
};

const dotColorMap = {
  indigo: "bg-indigo-400",
  green: "bg-green-400",
  yellow: "bg-yellow-400",
  red: "bg-red-400",
  blue: "bg-blue-400",
};

export default function StatCard({
  title,
  value,
  subtitle,
  color = "indigo",
}: StatCardProps) {
  return (
    <div className={`rounded-xl border p-5 ${colorMap[color]}`}>
      <div className="flex items-center gap-2 mb-1">
        <span className={`w-2 h-2 rounded-full ${dotColorMap[color]}`} />
        <p className="text-xs font-semibold uppercase tracking-wider opacity-70">{title}</p>
      </div>
      <p className="text-3xl font-bold mt-2">{value}</p>
      {subtitle && <p className="text-xs mt-1 opacity-60">{subtitle}</p>}
    </div>
  );
}
