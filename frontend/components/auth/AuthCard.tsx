import Link from "next/link";

export default function AuthCard({
  heading,
  children,
}: {
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-h-screen flex items-center justify-center px-6 bg-[#0a0a0f] overflow-hidden">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute top-[-10%] left-[-5%] w-[700px] h-[600px] bg-blue-700/22 rounded-full blur-[130px]" />
        <div className="absolute top-[-15%] right-[-5%] w-[600px] h-[500px] bg-emerald-600/22 rounded-full blur-[120px]" />
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "radial-gradient(circle, #ffffff 1px, transparent 1px)",
            backgroundSize: "28px 28px",
          }}
        />
      </div>

      <div className="relative z-10 w-full max-w-[420px] rounded-2xl border border-white/8 bg-white/3 backdrop-blur-sm shadow-2xl shadow-black/50 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
          <span className="font-semibold text-sm tracking-tight text-white">
            OpenParsed
          </span>
          <Link
            href="/"
            className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-500 hover:text-gray-300 hover:bg-white/5 transition-colors"
          >
            ✕
          </Link>
        </div>

        <div className="px-6 pt-8 pb-6">
          <h1 className="text-2xl font-bold text-white mb-6 text-center">
            {heading}
          </h1>
          {children}
        </div>
      </div>
    </div>
  );
}
