"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { LeftPanel } from "@/components/LeftPanel";
import { RightPanel } from "@/components/RightPanel";
import { BottomBar } from "@/components/BottomBar";
import { TaskBanner } from "@/components/TaskBanner";
import { isNarrow, BOTTOM_BAR_HEIGHT } from "@/lib/ui";
import { debugState, readDebug } from "@/lib/debugState";

const OfficeScene = dynamic(() => import("@/components/OfficeScene").then((m) => m.OfficeScene), {
  ssr: false,
  loading: () => null
});

export default function Page() {
  const [width, setWidth] = useState(0);
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);

  useEffect(() => {
    const update = () => setWidth(window.innerWidth);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  useEffect(() => {
    debugState.visibleLabelCount = 3;
    (window as unknown as { __GUILDLESS_DEBUG__?: () => unknown }).__GUILDLESS_DEBUG__ = () => readDebug();
  }, []);

  const narrow = isNarrow(width || 1920);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", width: "100vw", overflow: "hidden", background: "#0b1020" }}>
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        {!narrow ? (
          <div style={{ width: "20%", minWidth: 240, maxWidth: 380, overflowY: "auto" }}>
            <LeftPanel hidden={false} />
          </div>
        ) : leftOpen ? (
          <div style={{ position: "absolute", zIndex: 30, left: 0, top: 0, bottom: BOTTOM_BAR_HEIGHT, boxShadow: "4px 0 12px rgba(0,0,0,0.5)" }}>
            <LeftPanel hidden={false} />
          </div>
        ) : null}

        <div style={{ flex: 1, position: "relative", minWidth: 0, minHeight: 0 }}>
          <OfficeScene />
          <TaskBanner />
          {narrow && (
            <button
              onClick={() => setLeftOpen(!leftOpen)}
              style={drawerButton("left")}
            >
              ◀
            </button>
          )}
        </div>

        {!narrow ? (
          <div style={{ width: "20%", minWidth: 240, maxWidth: 380, overflowY: "auto" }}>
            <RightPanel hidden={false} />
          </div>
        ) : rightOpen ? (
          <div style={{ position: "absolute", zIndex: 30, right: 0, top: 0, bottom: BOTTOM_BAR_HEIGHT, boxShadow: "-4px 0 12px rgba(0,0,0,0.5)" }}>
            <RightPanel hidden={false} />
          </div>
        ) : null}
        {narrow && (
          <button
            onClick={() => setRightOpen(!rightOpen)}
            style={drawerButton("right")}
          >
            ▶
          </button>
        )}
      </div>
      <BottomBar />
    </div>
  );
}

function drawerButton(side: "left" | "right"): React.CSSProperties {
  return {
    position: "absolute",
    top: "50%",
    transform: "translateY(-50%)",
    [side]: 4,
    zIndex: 25,
    width: 26,
    height: 44,
    background: "rgba(2,6,23,0.85)",
    color: "#e2e8f0",
    border: "1px solid #334155",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: 14
  } as React.CSSProperties;
}
