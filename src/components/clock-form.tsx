"use client";
import { Tx, TInput } from "@/components/locale";

import { useEffect, useRef, useState } from "react";
import { clockAction } from "@/app/actions";

type Direction = "in" | "out";

const GPS_ERROR = "Location could not be detected. Turn on GPS and allow location access to continue attendance.";
const CAMERA_ERROR = "Camera permission is required. Allow camera access to continue attendance. Nothing was saved.";

async function readLocation(): Promise<{ lat: number; lng: number }> {
  if (!navigator.geolocation) throw new Error("gps");
  const position = await new Promise<GeolocationPosition>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
  });
  return { lat: position.coords.latitude, lng: position.coords.longitude };
}

async function openCamera(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error("camera");
  try {
    return await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
  } catch {
    return navigator.mediaDevices.getUserMedia({ video: true, audio: false });
  }
}

export function ClockForm({ alreadyIn = false }: { alreadyIn?: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [step, setStep] = useState<"idle" | "live" | "preview">("idle");
  const [direction, setDirection] = useState<Direction | "">("");
  const [message, setMessage] = useState("");
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null);
  const [photoUrl, setPhotoUrl] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  useEffect(() => () => stopCamera(), []);

  useEffect(() => {
    const video = videoRef.current;
    if (step === "live" && video && streamRef.current) {
      video.srcObject = streamRef.current;
      void video.play().catch(() => undefined);
    }
  }, [step]);

  function clearPhoto() {
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    setPhotoUrl("");
    setPhotoFile(null);
  }

  function cancel() {
    stopCamera();
    clearPhoto();
    setGps(null);
    setDirection("");
    setStep("idle");
    setBusy(false);
  }

  async function begin(next: Direction) {
    setMessage("");
    cancel();
    setDirection(next);
    setBusy(true);
    const [location, camera] = await Promise.allSettled([readLocation(), openCamera()]);
    if (camera.status === "fulfilled" && location.status === "rejected") {
      camera.value.getTracks().forEach((track) => track.stop());
    }
    if (location.status === "rejected") {
      setDirection("");
      setBusy(false);
      setMessage(GPS_ERROR);
      return;
    }
    if (camera.status === "rejected") {
      setDirection("");
      setBusy(false);
      setMessage(CAMERA_ERROR);
      return;
    }
    streamRef.current = camera.value;
    setGps(location.value);
    setStep("live");
    setBusy(false);
  }

  function capture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const scale = Math.min(1, 1280 / video.videoWidth);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const context = canvas.getContext("2d");
    if (!context) return;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) return;
      clearPhoto();
      const file = new File([blob], direction === "out" ? "clock-out.jpg" : "clock-in.jpg", { type: "image/jpeg" });
      setPhotoFile(file);
      setPhotoUrl(URL.createObjectURL(blob));
      stopCamera();
      setStep("preview");
    }, "image/jpeg", 0.85);
  }

  async function retake() {
    clearPhoto();
    setMessage("");
    setBusy(true);
    try {
      streamRef.current = await openCamera();
      setStep("live");
    } catch {
      setStep("idle");
      setMessage(CAMERA_ERROR);
    } finally {
      setBusy(false);
    }
  }

  function submit(form: HTMLFormElement) {
    if (!photoFile || !gps || !direction) return;
    const photo = form.elements.namedItem("photo") as HTMLInputElement;
    const transfer = new DataTransfer();
    transfer.items.add(photoFile);
    photo.files = transfer.files;
    (form.elements.namedItem("lat") as HTMLInputElement).value = String(gps.lat);
    (form.elements.namedItem("lng") as HTMLInputElement).value = String(gps.lng);
    (form.elements.namedItem("direction") as HTMLInputElement).value = direction;
    setBusy(true);
    form.requestSubmit();
  }

  return (
    <form action={clockAction} className="card" style={{ display: "grid", gap: 10 }} onSubmit={(event) => {
      if (!photoFile || !gps) event.preventDefault();
    }}>
      <TInput type="hidden" name="lat" />
      <TInput type="hidden" name="lng" />
      <TInput type="hidden" name="direction" />
      <TInput name="photo" type="file" accept="image/jpeg" hidden />
      <ol className="steps">
        <li className={gps ? "done" : ""}><Tx text={"1. Location"} /></li>
        <li className={photoFile ? "done" : ""}><Tx text={"2. Photo"} /></li>
        <li><Tx text={"3. Submit"} /></li>
      </ol>
      {message ? <div className="banner error">{message}</div> : null}
      {gps ? <p className="hint" style={{ color: "#047857" }}>Location received ({gps.lat.toFixed(5)}, {gps.lng.toFixed(5)})</p> : <p className="hint"><Tx text={"Nothing is saved until location and a photo are both present."} /></p>}
      {step === "live" ? (
        <div style={{ display: "grid", gap: 8 }}>
          <video ref={videoRef} playsInline muted autoPlay style={{ width: "min(100%, 420px)", borderRadius: 12, background: "#10233f" }} />
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn" type="button" onClick={capture}><Tx text={"Take photo"} /></button>
            <button className="btn secondary" type="button" onClick={cancel}><Tx text={"Cancel"} /></button>
          </div>
        </div>
      ) : null}
      {step === "preview" && photoUrl ? (
        <div style={{ display: "grid", gap: 8 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photoUrl} alt="Attendance preview" style={{ width: "min(100%, 420px)", borderRadius: 12 }} />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn secondary" type="button" onClick={() => void retake()}><Tx text={"Retake Photo"} /></button>
            <button className="btn" type="button" disabled={!photoFile || !gps || busy} onClick={(event) => submit(event.currentTarget.form!)}><Tx text={"Submit"} /></button>
            <button className="btn secondary" type="button" onClick={cancel}><Tx text={"Cancel"} /></button>
          </div>
        </div>
      ) : null}
      {step === "idle" ? (
        <div className="clock-actions">
          {alreadyIn ? <p className="hint"><Tx text={"You already clocked in today, so clock-in stays closed until tomorrow."} /></p> : null}
          <button className="btn lg" type="button" disabled={busy || alreadyIn} onClick={() => void begin("in")}><Tx text={"Clock in"} /></button>
          <button className="btn secondary lg" type="button" disabled={busy} onClick={() => void begin("out")}><Tx text={"Clock out"} /></button>
          <label className="btn secondary lg">
            <Tx text={"Phone camera"} />
            <TInput type="file" accept="image/*" capture="environment" hidden disabled={busy} onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              void (async () => {
                setMessage("");
                setBusy(true);
                setDirection(alreadyIn ? "out" : "in");
                try {
                  setGps(await readLocation());
                  clearPhoto();
                  setPhotoFile(file);
                  setPhotoUrl(URL.createObjectURL(file));
                  setStep("preview");
                } catch {
                  setDirection("");
                  setMessage(GPS_ERROR);
                } finally {
                  setBusy(false);
                }
              })();
            }} />
          </label>
        </div>
      ) : null}
    </form>
  );
}
