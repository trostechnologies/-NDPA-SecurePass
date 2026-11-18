import React from 'react';
interface CameraCaptureProps {
  onCapture: (photo: string, consent: boolean) => void;
  onSkip: () => void;
  initialPhotoUrl?: string;
}
/** Unavailable until reviewed photo storage, consent and erasure exist. */
export const CameraCapture: React.FC<CameraCaptureProps> = ({ onSkip }) => (
  <div className="p-4 rounded-xl border border-slate-700 space-y-3">
    <p>Photo collection is disabled. You can continue without a photo.</p>
    <button className="p-2 bg-slate-700 rounded" onClick={onSkip}>
      Continue without a photo
    </button>
  </div>
);
