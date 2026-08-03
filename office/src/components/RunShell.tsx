import Link from "next/link";
import type { ReactNode } from "react";

const TABS = [
  { href: (id: string) => `/runs/${id}`, label: "Overview" },
  { href: (id: string) => `/runs/${id}/diff`, label: "Diff" },
  { href: (id: string) => `/runs/${id}/tests`, label: "Tests" },
  { href: (id: string) => `/runs/${id}/findings`, label: "Findings" },
  { href: (id: string) => `/runs/${id}/evidence`, label: "Evidence" },
  { href: (id: string) => `/runs/${id}/artifacts`, label: "Artifacts" },
  { href: (id: string) => `/runs/${id}/report`, label: "Report" }
];

export function RunNav({ runId, active }: { runId: string; active: string }) {
  return (
    <nav style={{ display: "flex", gap: "4px", flexWrap: "wrap", marginBottom: "16px" }}>
      {TABS.map((tab) => {
        const href = tab.href(runId);
        const isActive = active === tab.label;
        return (
          <Link
            key={tab.label}
            href={href}
            style={{
              padding: "4px 10px",
              borderRadius: "6px",
              textDecoration: "none",
              fontSize: "13px",
              border: "1px solid #333",
              background: isActive ? "#1a5cff" : "transparent",
              color: isActive ? "#fff" : "#ccc"
            }}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function RunShell({ runId, active, title, children }: { runId: string; active: string; title: string; children: ReactNode }) {
  return (
    <main style={{ maxWidth: "900px", margin: "0 auto", padding: "24px", fontFamily: "sans-serif", color: "#e6e6e6", background: "#0b0f14", minHeight: "100vh" }}>
      <h1 style={{ fontSize: "18px", margin: "0 0 4px" }}>{title}</h1>
      <p style={{ fontSize: "13px", color: "#888", margin: "0 0 16px" }}>run {runId}</p>
      <RunNav runId={runId} active={active} />
      {children}
    </main>
  );
}

export function NotProduced({ what }: { what: string }) {
  return <p style={{ fontSize: "14px", color: "#9a9a9a" }}>{what} — Not produced</p>;
}
