"use client";

import { useEffect, useRef, useState } from "react";
import { Tx, TInput, useT } from "@/components/locale";
import { locationAction } from "@/app/actions";
import { coordinateError } from "@/lib/domain";

type Place = { id?: string; name?: string; address?: string; lat?: number | null; lng?: number | null; radiusMeters?: number };

type LeafletMap = {
  setView: (center: [number, number], zoom?: number) => LeafletMap;
  getCenter: () => { lat: number; lng: number };
  getZoom: () => number;
  dragging: { enable: () => void; disable: () => void };
  on: (event: string, handler: () => void) => void;
  off: (event: string, handler: () => void) => void;
  remove: () => void;
  invalidateSize: () => void;
};

type LeafletCircle = { remove: () => void; setRadius: (radius: number) => void };

type LeafletApi = {
  map: (el: HTMLElement) => LeafletMap;
  tileLayer: (url: string, options: { attribution: string }) => { addTo: (map: LeafletMap) => void };
  circle: (center: [number, number], options: { radius: number; color: string; weight: number; fillColor: string; fillOpacity: number }) => LeafletCircle & { addTo: (map: LeafletMap) => LeafletCircle };
};

declare global {
  interface Window { L?: LeafletApi }
}

let leafletPromise: Promise<LeafletApi> | null = null;

function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (!leafletPromise) {
    leafletPromise = new Promise((resolve, reject) => {
      const css = document.createElement("link");
      css.rel = "stylesheet";
      css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(css);
      const script = document.createElement("script");
      script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
      script.onload = () => (window.L ? resolve(window.L) : reject(new Error("map")));
      script.onerror = () => reject(new Error("map"));
      document.body.appendChild(script);
    });
  }
  return leafletPromise;
}

function point(lat: string, lng: string) {
  if (coordinateError(lat, lng)) return null;
  if (!lat.trim() || !lng.trim()) return null;
  return { lat: Number(lat), lng: Number(lng) };
}

export function LocationForm({ branchId, location }: { branchId: string; location?: Place }) {
  const t = useT();
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const circleRef = useRef<LeafletCircle | null>(null);
  const followRef = useRef(false);
  const hasPoint = location?.lat != null && location.lng != null;
  const [method, setMethod] = useState<"map" | "manual">(hasPoint ? "manual" : "map");
  const [lat, setLat] = useState(hasPoint ? String(location?.lat) : "");
  const [lng, setLng] = useState(hasPoint ? String(location?.lng) : "");
  const [radius, setRadius] = useState(location?.radiusMeters ?? 0);
  const [locked, setLocked] = useState(hasPoint);
  const [query, setQuery] = useState("");
  const [note, setNote] = useState("");
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [locating, setLocating] = useState(false);
  const [ready, setReady] = useState(false);
  const chosen = method === "manual" || locked ? point(lat, lng) : null;
  const error = method === "manual" ? coordinateError(lat, lng) : "";

  useEffect(() => {
    let gone = false;
    const node = box.current;
    loadLeaflet().then((L) => {
      if (gone || !node || mapRef.current) return;
      const start = hasPoint ? [location?.lat || -6.2, location?.lng || 106.8] as [number, number] : [-6.2, 106.8] as [number, number];
      const map = L.map(node).setView(start, hasPoint ? 16 : 12);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "&copy; OpenStreetMap" }).addTo(map);
      mapRef.current = map;
      setReady(true);
    }).catch(() => setNote("The map could not be loaded."));
    const observer = node ? new ResizeObserver(() => mapRef.current?.invalidateSize()) : null;
    if (node && observer) observer.observe(node);
    return () => {
      gone = true;
      observer?.disconnect();
      circleRef.current?.remove();
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [hasPoint, location?.lat, location?.lng]);

  useEffect(() => {
    const map = mapRef.current;
    const L = window.L;
    if (!map || !L || !ready) return;
    if (method === "map" && !locked) map.dragging.enable();
    else map.dragging.disable();
    circleRef.current?.remove();
    circleRef.current = null;
    const next = method === "manual" || locked ? point(lat, lng) : null;
    if (!next) return;
    map.setView([next.lat, next.lng], map.getZoom());
    if (radius > 0) circleRef.current = L.circle([next.lat, next.lng], { radius, color: "#0f766e", weight: 2, fillColor: "#7ddec8", fillOpacity: 0.28 }).addTo(map);
  }, [method, locked, lat, lng, radius, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const follow = () => {
      if (!followRef.current) return;
      const center = map.getCenter();
      setLat(center.lat.toFixed(6));
      setLng(center.lng.toFixed(6));
    };
    map.on("moveend", follow);
    return () => { map.off("moveend", follow); };
  }, [ready]);

  async function searchPlace() {
    const q = query.trim();
    if (!q || !mapRef.current) return;
    setNote("");
    const response = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(q)}`);
    const rows = await response.json() as { lat: string; lon: string }[];
    if (!rows[0]) {
      setNote("No matching place.");
      return;
    }
    setLocked(false);
    mapRef.current.setView([Number(rows[0].lat), Number(rows[0].lon)], 16);
  }

  function confirmPoint() {
    const center = mapRef.current?.getCenter();
    if (!center) return;
    followRef.current = false;
    setLat(center.lat.toFixed(6));
    setLng(center.lng.toFixed(6));
    setLocked(true);
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      setAccuracy(null);
      setNote("Current location could not be found. Try again or choose the office manually.");
      return;
    }
    setLocating(true);
    setNote("");
    setAccuracy(null);
    navigator.geolocation.getCurrentPosition((position) => {
      const latitude = position.coords.latitude.toFixed(6);
      const longitude = position.coords.longitude.toFixed(6);
      followRef.current = true;
      setLocked(false);
      setLat(latitude);
      setLng(longitude);
      mapRef.current?.setView([Number(latitude), Number(longitude)], 16);
      setAccuracy(Math.round(position.coords.accuracy));
      setLocating(false);
    }, (error) => {
      setLocating(false);
      setAccuracy(null);
      setNote(error.code === 1
        ? "Location access was denied. Allow location in the browser or choose the office manually."
        : "Current location could not be found. Try again or choose the office manually.");
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  }

  return (
    <form action={locationAction} className="inset">
      {location?.id ? <TInput type="hidden" name="id" value={location.id} /> : null}
      <TInput type="hidden" name="branchId" value={branchId} />
      <label className="field"><Tx text="Name" /><TInput name="name" placeholder="Location name" defaultValue={location?.name} required /></label>
      <label className="field"><Tx text="Address" /><TInput name="address" placeholder="Address" defaultValue={location?.address} /></label>
      <div className="tabs">
        <button className={method === "map" ? "active" : ""} type="button" onClick={() => setMethod("map")}><Tx text="Pick on the map" /></button>
        <button className={method === "manual" ? "active" : ""} type="button" onClick={() => setMethod("manual")}><Tx text="Enter coordinates" /></button>
      </div>
      {method === "map" ? (
        <div className="loc-search">
          <TInput value={query} placeholder="Search for the office address" aria-label={t("Search location")} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void searchPlace(); } }} />
          <button className="btn secondary" type="button" onClick={() => void searchPlace()}><Tx text="Search" /></button>
        </div>
      ) : null}
      {method === "map" ? (
        <button className="btn secondary loc-gps" type="button" disabled={locating} onClick={useCurrentLocation}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11M12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5" /></svg>
          <Tx text={locating ? "Finding current location..." : "Use current location"} />
        </button>
      ) : null}
      <div className="loc-map">
        <div ref={box} />
        <span className="loc-pin" aria-hidden="true" />
      </div>
      <div className="form-actions">
        {method === "map" && !locked ? <button className="btn secondary" type="button" onClick={confirmPoint}><Tx text="Set location" /></button> : null}
        {method === "map" && locked ? <button className="btn secondary" type="button" onClick={() => setLocked(false)}><Tx text="Change location point" /></button> : null}
      </div>
      <label className="field"><Tx text="Latitude" /><TInput name="lat" value={lat} placeholder="-6.2" readOnly={method === "map"} onChange={(event) => setLat(event.target.value)} /></label>
      <label className="field"><Tx text="Longitude" /><TInput name="lng" value={lng} placeholder="106.8" readOnly={method === "map"} onChange={(event) => setLng(event.target.value)} /></label>
      <label className="field"><Tx text="Radius (m)" /><TInput name="radiusMeters" type="number" min={0} value={radius} onChange={(event) => setRadius(Number(event.target.value))} /></label>
      {error ? <p className="hint">{t(error)}</p> : null}
      {note ? <p className="hint">{t(note)}</p> : null}
      {accuracy != null ? <p className="hint">{t("GPS accuracy about")} {accuracy} m. {t("Adjust the map if needed, then set the location.")}</p> : null}
      {chosen ? <p className="hint">{chosen.lat}, {chosen.lng} · {radius} m</p> : null}
      <p className="hint"><Tx text="Leave the radius at 0 until the coordinates are set. Clock-in and clock-out outside that radius are refused." /></p>
      <button className="btn" type="submit"><Tx text="Save" /></button>
    </form>
  );
}
