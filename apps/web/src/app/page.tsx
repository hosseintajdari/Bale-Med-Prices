import { PricingWorkbench } from "../features/pricing/pricing-workbench";

export default function Page() {
  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "40px 24px 56px",
        background:
          "radial-gradient(circle at top left, rgba(233,245,239,1) 0%, rgba(251,247,238,1) 45%, rgba(255,255,255,1) 100%)",
        color: "#1f2a24"
      }}
    >
      <div style={{ maxWidth: 1200, margin: "0 auto", display: "grid", gap: 28 }}>
        <div style={{ maxWidth: 720 }}>
          <p
            style={{
              margin: "0 0 10px",
              color: "#35614f",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              fontSize: 12
            }}
          >
            Pharmacy Pricing
          </p>
          <h1 style={{ margin: "0 0 12px", fontSize: "clamp(2.5rem, 6vw, 4.5rem)", lineHeight: 1 }}>
            Price calculation in one calm workspace
          </h1>
          <p style={{ margin: 0, fontSize: 18, color: "#4d5f55", lineHeight: 1.7 }}>
            Search goods, review pricing inputs, and calculate final sale price without opening
            the full pharmacy system.
          </p>
        </div>

        <PricingWorkbench />
      </div>
    </main>
  );
}
