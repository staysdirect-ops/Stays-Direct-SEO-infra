"use client";

import "leaflet/dist/leaflet.css";
import { Circle, CircleMarker, MapContainer, TileLayer, Tooltip } from "react-leaflet";

export interface MapPoint {
  id: string;
  lat: number;
  lng: number;
  label: string;
  kind: "project" | "property";
  radiusMiles?: number;
  highlight?: boolean;
}

const UK_CENTRE: [number, number] = [54.2, -2.8];

export default function LeafletMap({
  points,
  onSelect,
  height = 420,
}: {
  points: MapPoint[];
  onSelect?: (id: string) => void;
  height?: number;
}) {
  return (
    <MapContainer
      center={UK_CENTRE}
      zoom={5}
      scrollWheelZoom={false}
      style={{ height, width: "100%" }}
      className="rounded-lg"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {points
        .filter((p) => p.kind === "project" && p.radiusMiles && p.highlight)
        .map((p) => (
          <Circle
            key={`r-${p.id}`}
            center={[p.lat, p.lng]}
            radius={p.radiusMiles! * 1609.344}
            pathOptions={{ color: "#f26b1d", weight: 1, fillOpacity: 0.06 }}
          />
        ))}
      {points.map((p) => (
        <CircleMarker
          key={p.id}
          center={[p.lat, p.lng]}
          radius={p.kind === "project" ? (p.highlight ? 9 : 6) : 5}
          pathOptions={
            p.kind === "project"
              ? { color: "#d95a10", fillColor: "#f26b1d", fillOpacity: 0.9, weight: 1 }
              : { color: "#0b1f3a", fillColor: "#16325c", fillOpacity: 0.8, weight: 1 }
          }
          eventHandlers={
            onSelect && p.kind === "project" ? { click: () => onSelect(p.id) } : undefined
          }
        >
          <Tooltip>{p.label}</Tooltip>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
