"use client";

import { Canvas } from "@react-three/fiber";
import { Suspense } from "react";
import { Room } from "./Room";
import { AgentCharacter } from "./AgentCharacter";
import { CameraRig } from "./CameraRig";
import { IssueParcel } from "./IssueParcel";
import { Postman } from "./Postman";
import { Monitor } from "./Monitor";
import { ResultMarker } from "./ResultMarker";
import { CAMERA, CHARACTER_ORDER } from "../lib/zones";

export function OfficeScene() {
  return (
    <Canvas camera={{ position: CAMERA.godViewPosition, fov: 40 }} shadows>
      <color attach="background" args={["#0b1020"]} />
      <ambientLight intensity={0.5} />
      <directionalLight position={[6, 12, 4]} intensity={1.2} castShadow />
      <Suspense fallback={null}>
        <Room />
        <Monitor />
        <IssueParcel />
        <Postman />
        <ResultMarker />
        {CHARACTER_ORDER.map((id) => (
          <AgentCharacter key={id} id={id} />
        ))}
        <CameraRig />
      </Suspense>
    </Canvas>
  );
}
