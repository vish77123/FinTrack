export default function DashboardLoading() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "20px",
        padding: "8px 0",
        animation: "pulse 1.5s ease-in-out infinite",
      }}
    >
      {/* Page title skeleton */}
      <div>
        <div
          style={{
            width: "200px",
            height: "28px",
            borderRadius: "8px",
            background: "var(--border)",
            marginBottom: "8px",
          }}
        />
        <div
          style={{
            width: "300px",
            height: "16px",
            borderRadius: "6px",
            background: "var(--border)",
            opacity: 0.6,
          }}
        />
      </div>

      {/* Summary cards skeleton */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
          gap: "12px",
        }}
      >
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            style={{
              height: "100px",
              borderRadius: "12px",
              background: "var(--surface)",
              border: "1px solid var(--border)",
            }}
          />
        ))}
      </div>

      {/* Content skeleton */}
      <div
        style={{
          height: "300px",
          borderRadius: "12px",
          background: "var(--surface)",
          border: "1px solid var(--border)",
        }}
      />

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}
