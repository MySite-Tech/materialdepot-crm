export function HeroBanner() {
  return (
    <div className="relative w-full h-48 md:h-64 bg-black overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute inset-0" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }} />
      </div>
      
      {/* Content */}
      <div className="relative z-10 flex flex-col items-center justify-center h-full px-4 text-center">
        {/* Logo */}
        <div className="w-16 h-16 md:w-20 md:h-20 bg-brand-primary rounded-full flex items-center justify-center mb-4 shadow-lg border-4 border-white">
          <span className="text-white text-3xl md:text-4xl font-bold">M</span>
        </div>
        
        {/* Text */}
        <h1 className="text-white text-xl md:text-2xl font-bold tracking-tight">
          India's Biggest Interior Megastore
        </h1>
        <p className="text-white/80 text-sm md:text-base mt-1">
          Material Depot
        </p>
      </div>
    </div>
  );
}
