import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import "./EscanearQR.css";

// Rutas de la app que puede traer un QR: el de la mesa (/mesa/:token) y el
// que muestra la PC para controlar una partida (/partida/:id/control).
const APP_PATHS = [/^\/mesa\/[^/]+$/, /^\/partida\/[^/]+\/control$/];

// Devuelve la ruta interna si el texto del QR es un link de la app, si no null.
// No miramos el dominio: así anda igual en producción y en la compu local.
function appPathFromQr(text) {
  try {
    const url = new URL(text.trim(), window.location.origin);
    return APP_PATHS.some((re) => re.test(url.pathname)) ? url.pathname : null;
  } catch {
    return null;
  }
}

// Escanear QR dentro de la app: usa la cámara sin salir de la app instalada,
// así no se abre una pestaña del navegador ni pide loguearse de nuevo.
export default function EscanearQR() {
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const [error, setError] = useState(null);
  const [wrongQr, setWrongQr] = useState(false);

  useEffect(() => {
    let stream = null;
    let stopped = false;
    let timer = null;

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("Este navegador no deja usar la cámara.");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
      } catch {
        setError("No pudimos abrir la cámara. Fijate de darle permiso a la app.");
        return;
      }
      if (stopped) return;
      const video = videoRef.current;
      video.srcObject = stream;
      await video.play().catch(() => {});

      // Android/Chrome trae un lector nativo; en iPhone usamos jsQR.
      const read = await makeReader();
      const tick = async () => {
        if (stopped) return;
        const text = video.readyState >= 2 ? await read(video) : null;
        if (text) {
          const path = appPathFromQr(text);
          if (path) {
            navigate(path, { replace: true });
            return;
          }
          setWrongQr(true);
        }
        timer = setTimeout(tick, 250);
      };
      tick();
    }

    start();
    return () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [navigate]);

  return (
    <div className="scan-page">
      <video ref={videoRef} className="scan-video" playsInline muted />
      <div className="scan-frame" aria-hidden="true" />

      <div className="scan-top">
        <Link to="/partida" className="btn btn-small scan-close">Cerrar</Link>
      </div>

      <div className="scan-bottom">
        {error ? (
          <p className="scan-msg scan-error">{error}</p>
        ) : wrongQr ? (
          <p className="scan-msg">Ese QR no es de una mesa ni de una partida.</p>
        ) : (
          <p className="scan-msg">Apuntá al QR de la mesa o al de la pantalla.</p>
        )}
      </div>
    </div>
  );
}

async function makeReader() {
  if ("BarcodeDetector" in window) {
    try {
      const formats = await window.BarcodeDetector.getSupportedFormats();
      if (formats.includes("qr_code")) {
        const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
        return async (video) => {
          const codes = await detector.detect(video).catch(() => []);
          return codes[0]?.rawValue ?? null;
        };
      }
    } catch {
      // seguimos con jsQR
    }
  }

  const { default: jsQR } = await import("jsqr");
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  return async (video) => {
    // Achicamos la imagen: alcanza para leer el QR y no traba el celu.
    const scale = Math.min(1, 640 / video.videoWidth);
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" })?.data ?? null;
  };
}
