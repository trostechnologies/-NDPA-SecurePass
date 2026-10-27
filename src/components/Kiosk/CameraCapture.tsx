/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState, useEffect } from 'react';
import { Camera, RefreshCw, Upload, ShieldCheck, Check, Sparkles, AlertCircle } from 'lucide-react';

interface CameraCaptureProps {
  onCapture: (photoUrl: string | null, biometricConsentGranted: boolean) => void;
  onSkip: () => void;
  initialPhotoUrl?: string;
}

export const CameraCapture: React.FC<CameraCaptureProps> = ({
  onCapture,
  onSkip,
  initialPhotoUrl,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(initialPhotoUrl || null);
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [biometricConsent, setBiometricConsent] = useState<boolean>(true);

  // Start webcam
  const startCamera = async () => {
    setCameraError(null);
    try {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
      setCameraActive(true);
    } catch (err: unknown) {
      console.warn('Webcam access failed or denied:', err);
      setCameraError('Camera unavailable or permission denied. You may upload a photo or skip.');
      setCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    setCameraActive(false);
  };

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const takeSnapshot = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        setCapturedPhoto(dataUrl);
        stopCamera();
        onCapture(dataUrl, biometricConsent);
      }
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result as string;
        setCapturedPhoto(result);
        stopCamera();
        onCapture(result, biometricConsent);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleUsePresetAvatar = () => {
    const samplePath = '/src/assets/images/badge_sample_avatar_1792515162668.jpg';
    setCapturedPhoto(samplePath);
    stopCamera();
    onCapture(samplePath, biometricConsent);
  };

  const handleRetake = () => {
    setCapturedPhoto(null);
    startCamera();
  };

  const handleVoluntarySkip = () => {
    stopCamera();
    setCapturedPhoto(null);
    onCapture(null, false);
    onSkip();
  };

  return (
    <div className="space-y-4">
      {/* NDPA Section 30 Transparency Banner */}
      <div className="p-3.5 bg-slate-900 border border-slate-800 rounded-xl text-xs space-y-1.5">
        <div className="flex items-center gap-2 text-emerald-400 font-semibold">
          <ShieldCheck className="w-4 h-4 flex-shrink-0" />
          <span>NDPA 2023 Section 30 Notice: Biometric Photograph is Optional</span>
        </div>
        <p className="text-slate-400 leading-relaxed">
          Biometric facial images are classified as sensitive personal data. In strict accordance with
          Section 30 of the Nigerian Data Protection Act, providing a badge photo is <strong className="text-slate-200">completely voluntary</strong>.
          You may decline without any restriction to entry.
        </p>
      </div>

      {/* Main Viewfinder / Photo Preview */}
      <div className="relative w-full aspect-[4/3] max-w-sm mx-auto bg-slate-950 rounded-2xl border border-slate-800 overflow-hidden flex items-center justify-center">
        {capturedPhoto ? (
          <div className="relative w-full h-full">
            <img
              src={capturedPhoto}
              alt="Visitor preview"
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
            <div className="absolute top-3 right-3 bg-emerald-500/90 backdrop-blur-sm text-slate-950 text-xs font-semibold px-2 py-1 rounded flex items-center gap-1 shadow-sm">
              <Check className="w-3.5 h-3.5" /> Photo Ready
            </div>
          </div>
        ) : cameraActive ? (
          <div className="relative w-full h-full bg-black">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover mirror"
            />
            {/* Guide overlay */}
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className="w-48 h-56 border-2 border-dashed border-emerald-400/60 rounded-full" />
            </div>
            <button
              type="button"
              onClick={takeSnapshot}
              className="absolute bottom-4 left-1/2 -translate-x-1/2 px-5 py-2.5 bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-semibold text-xs rounded-full shadow-lg flex items-center gap-2 transition-transform active:scale-95"
            >
              <Camera className="w-4 h-4" /> Snap Photo
            </button>
          </div>
        ) : (
          <div className="text-center p-6 space-y-3">
            <div className="w-14 h-14 mx-auto rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-500">
              <Camera className="w-7 h-7" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-200">No Photo Selected</p>
              <p className="text-xs text-slate-500 mt-1 max-w-xs">
                Activate webcam, upload a headshot, use a sample, or skip under NDPA privacy rights.
              </p>
            </div>
            {cameraError && (
              <div className="text-xs text-amber-400 bg-amber-950/40 border border-amber-800/60 p-2 rounded-lg flex items-center gap-1.5 text-left">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{cameraError}</span>
              </div>
            )}
          </div>
        )}
      </div>

      <canvas ref={canvasRef} className="hidden" />
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        accept="image/*"
        className="hidden"
      />

      {/* Control Buttons */}
      <div className="flex flex-wrap gap-2 justify-center pt-2">
        {capturedPhoto ? (
          <button
            type="button"
            onClick={handleRetake}
            className="px-3.5 py-2 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-lg flex items-center gap-1.5 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Retake Photo
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={startCamera}
              className="px-3.5 py-2 text-xs font-semibold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-lg flex items-center gap-1.5 transition-colors shadow-sm"
            >
              <Camera className="w-3.5 h-3.5" /> Open Webcam
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-3.5 py-2 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-lg flex items-center gap-1.5 transition-colors"
            >
              <Upload className="w-3.5 h-3.5" /> Upload File
            </button>
            <button
              type="button"
              onClick={handleUsePresetAvatar}
              className="px-3.5 py-2 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-lg flex items-center gap-1.5 transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5 text-emerald-400" /> Use Verified Portrait
            </button>
          </>
        )}

        <button
          type="button"
          onClick={handleVoluntarySkip}
          className="px-3.5 py-2 text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-slate-700/60 rounded-lg transition-colors"
        >
          Skip Photo (NDPA Sec 30)
        </button>
      </div>

      {/* Explicit Biometric Consent Checkbox */}
      {capturedPhoto && (
        <label className="flex items-start gap-2.5 p-2.5 bg-slate-900/60 border border-slate-800 rounded-lg cursor-pointer text-xs text-slate-300">
          <input
            type="checkbox"
            checked={biometricConsent}
            onChange={(e) => {
              setBiometricConsent(e.target.checked);
              onCapture(capturedPhoto, e.target.checked);
            }}
            className="mt-0.5 rounded border-slate-700 text-emerald-500 focus:ring-emerald-400"
          />
          <span className="leading-relaxed">
            I confirm that I explicitly consent to the temporary storage of my badge photograph for premises access control and security identification during my visit today under NDPA Section 30.
          </span>
        </label>
      )}
    </div>
  );
};
