"use client";

import { useGLTF, Text } from "@react-three/drei";
import { useOffice } from "../lib/store";
import { MAP_URL, ZONE_LABELS, ZONE_NAV, ZONE_ORDER } from "../lib/zones";

export function Room() {
  const gltf = useGLTF(MAP_URL);
  const debug = useOffice((state) => state.debug);

  return (
    <group>
      <primitive object={gltf.scene} />
      {ZONE_ORDER.map((zone) => {
        const chair = ZONE_NAV[zone].chairPosition;
        return (
          <group key={zone}>
            {debug && (
              <group>
                <mesh position={[chair[0], chair[1] + 0.05, chair[2]]} rotation={[-Math.PI / 2, 0, 0]}>
                  <ringGeometry args={[0.6, 0.8, 32]} />
                  <meshBasicMaterial color="#22c55e" />
                </mesh>
                <Text position={[chair[0], chair[1] + 0.3, chair[2]]} fontSize={0.14} color="#4ade80" anchorX="center" anchorY="middle">
                  {`${zone} x=${chair[0].toFixed(1)} z=${chair[2].toFixed(1)}`}
                </Text>
              </group>
            )}
          </group>
        );
      })}
    </group>
  );
}
