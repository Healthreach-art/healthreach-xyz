import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Camera, RefreshCw, Check, Loader2, X } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Called with a JPEG File once the user accepts the shot. */
  onCapture: (file: File) => void | Promise<void>;
  title?: string;
  hint?: string;
  /** "user" = selfie / front cam, "environment" = back cam. */
  facing?: "user" | "environment";
  filenamePrefix?: string;
}

/**
 * In-app live camera capture. Used for driver selfie-with-ID and profile photo.
 * Falls back to a file picker if camera access is denied.
 */
export function CameraCapture({
  open, onClose, onCapture, title = "Take photo",
  hint, facing = "user", filenamePrefix = "capture",
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cameraStarted, setCameraStarted] = useState(false);

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraStarted(false);
  }

  function cameraErrorMessage(e: unknown) {
    const name = e instanceof DOMException ? e.name : "";
    if (name === "NotAllowedError" || name === "SecurityError") return "Camera permission is blocked. Allow camera access in Safari/Chrome settings, or use Upload instead.";
    if (name === "NotFoundError" || name === "OverconstrainedError") return "Requested device not found. Try Start camera again, switch browser permissions, or use Upload instead.";
    if (name === "NotReadableError") return "Camera is being used by another app. Close it and try again, or use Upload instead.";
    return e instanceof Error ? e.message : "Camera unavailable. You can upload a photo instead.";
  }

  async function startCamera() {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("Camera capture is not available in this browser. Use Upload instead.");
      return;
    }
    setBusy(true);
    setError(null);
    stopCamera();
    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 960 } },
          audio: false,
        });
      } catch (firstError) {
        if (firstError instanceof DOMException && (firstError.name === "NotFoundError" || firstError.name === "OverconstrainedError")) {
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        } else {
          throw firstError;
        }
      }
      streamRef.current = stream;
      setCameraStarted(true);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
    } catch (e) {
      setError(cameraErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!open) {
      stopCamera();
      setSnapshot(null);
      setError(null);
      return;
    }
    return () => {
      stopCamera();
    };
  }, [open]);

  function takeShot() {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const c = document.createElement("canvas");
    c.width = v.videoWidth; c.height = v.videoHeight;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(v, 0, 0, c.width, c.height);
    setSnapshot(c.toDataURL("image/jpeg", 0.9));
  }

  async function accept() {
    if (!snapshot) return;
    setBusy(true);
    try {
      const blob = await (await fetch(snapshot)).blob();
      const file = new File([blob], `${filenamePrefix}-${Date.now()}.jpg`, { type: "image/jpeg" });
      await onCapture(file);
      onClose();
    } finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Camera className="h-4 w-4" /> {title}</DialogTitle>
        </DialogHeader>
        {hint && <p className="text-xs text-muted-foreground -mt-2">{hint}</p>}

        <div className="relative aspect-[4/3] bg-black rounded-lg overflow-hidden">
          {snapshot ? (
            <img src={snapshot} alt="preview" className="absolute inset-0 h-full w-full object-cover" />
          ) : !cameraStarted ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-5 text-center text-xs text-white bg-black/80">
              <Camera className="h-8 w-8" />
              <span>Start the live camera from this button for reliable iPhone permission handling.</span>
            </div>
          ) : (
            <video
              ref={videoRef}
              playsInline muted
              className={`absolute inset-0 h-full w-full object-cover ${facing === "user" ? "scale-x-[-1]" : ""}`}
            />
          )}
          {error && !snapshot && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center text-xs text-white bg-black/70">
              <X className="h-6 w-6" /> {error}
            </div>
          )}
        </div>

        <input
          ref={fileInputRef} type="file" accept="image/*" capture={facing}
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.currentTarget.value = "";
            if (!f) return;
            setBusy(true);
            try { await onCapture(f); onClose(); } finally { setBusy(false); }
          }}
        />

        <div className="flex gap-2 justify-end">
          {snapshot ? (
            <>
              <Button variant="outline" onClick={() => setSnapshot(null)} disabled={busy} className="gap-1">
                <RefreshCw className="h-4 w-4" /> Retake
              </Button>
              <Button onClick={accept} disabled={busy} className="gap-1">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Use photo
              </Button>
            </>
          ) : (
            <>
              {error && (
                <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={busy}>
                  Upload instead
                </Button>
              )}
              {!cameraStarted ? (
                <Button onClick={startCamera} disabled={busy} className="gap-1">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />} Start camera
                </Button>
              ) : (
              <Button onClick={takeShot} disabled={busy} className="gap-1">
                <Camera className="h-4 w-4" /> Capture selfie
              </Button>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
