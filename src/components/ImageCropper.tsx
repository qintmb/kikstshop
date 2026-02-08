"use client";

import { useRef, useState, useCallback } from "react";
import Cropper, { ReactCropperElement } from "react-cropper";
import "cropperjs/dist/cropper.css";
import { motion } from "framer-motion";
import { ZoomIn, ZoomOut, Check, X, RotateCw, Move } from "lucide-react";

interface ImageCropperProps {
  imageSrc: string;
  onCropComplete: (croppedBlob: Blob) => void;
  onCancel: () => void;
}

export function ImageCropper({ imageSrc, onCropComplete, onCancel }: ImageCropperProps) {
  const cropperRef = useRef<ReactCropperElement>(null);
  const [processing, setProcessing] = useState(false);

  const handleZoom = useCallback((delta: number) => {
    const cropper = cropperRef.current?.cropper;
    if (cropper) {
      cropper.zoom(delta);
    }
  }, []);

  const handleRotate = useCallback(() => {
    const cropper = cropperRef.current?.cropper;
    if (cropper) {
      cropper.rotate(90);
    }
  }, []);

  const handleReset = useCallback(() => {
    const cropper = cropperRef.current?.cropper;
    if (cropper) {
      cropper.reset();
    }
  }, []);

  const handleCrop = useCallback(async () => {
    const cropper = cropperRef.current?.cropper;
    if (!cropper) return;

    setProcessing(true);

    try {
      const canvas = cropper.getCroppedCanvas({
        width: 800,
        height: 800,
        imageSmoothingEnabled: true,
        imageSmoothingQuality: "high",
      });

      canvas.toBlob(
        (blob) => {
          if (blob) {
            onCropComplete(blob);
          }
          setProcessing(false);
        },
        "image/webp",
        0.9
      );
    } catch (error) {
      console.error("Crop failed:", error);
      setProcessing(false);
    }
  }, [onCropComplete]);

  return (
    <div className="relative flex min-h-[450px] flex-col overflow-hidden rounded-xl bg-muted/30">
      {/* Cropper Area */}
      <div className="relative h-[350px] bg-black/5">
        <Cropper
          ref={cropperRef}
          src={imageSrc}
          style={{ height: "100%", width: "100%" }}
          aspectRatio={1}
          viewMode={1}
          dragMode="move"
          guides={true}
          center={true}
          highlight={false}
          background={false}
          autoCropArea={0.8}
          responsive={true}
          checkOrientation={true}
          zoomOnWheel={true}
          zoomOnTouch={true}
          wheelZoomRatio={0.1}
          cropBoxMovable={true}
          cropBoxResizable={true}
          toggleDragModeOnDblclick={true}
        />
      </div>

      {/* Controls */}
      <div className="flex flex-col gap-4 p-4">
        {/* Hint */}
        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <Move className="h-3.5 w-3.5" />
          <span>Drag untuk menggeser • Pinch/scroll untuk zoom</span>
        </div>

        {/* Zoom & Rotate Controls */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleZoom(-0.1)}
              className="rounded-full bg-secondary p-2.5 text-secondary-foreground transition hover:bg-secondary/80 active:scale-95"
              aria-label="Zoom out"
            >
              <ZoomOut className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => handleZoom(0.1)}
              className="rounded-full bg-secondary p-2.5 text-secondary-foreground transition hover:bg-secondary/80 active:scale-95"
              aria-label="Zoom in"
            >
              <ZoomIn className="h-4 w-4" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleRotate}
              className="rounded-lg bg-secondary px-3 py-2 text-xs font-medium text-secondary-foreground transition hover:bg-secondary/80 active:scale-95"
            >
              <RotateCw className="mr-1.5 inline-block h-3.5 w-3.5" />
              Putar
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="rounded-lg bg-secondary px-3 py-2 text-xs font-medium text-secondary-foreground transition hover:bg-secondary/80 active:scale-95"
            >
              Reset
            </button>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="btn-secondary flex-1"
          >
            <X className="h-4 w-4" />
            Batal
          </button>
          <button
            type="button"
            onClick={handleCrop}
            disabled={processing}
            className="btn-primary flex-1"
          >
            {processing ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <>
                <Check className="h-4 w-4" />
                Selesai
              </>
            )}
          </button>
        </div>
      </div>

      {/* Processing Overlay */}
      {processing && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/50 backdrop-blur-[1px]">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      )}
    </div>
  );
}
