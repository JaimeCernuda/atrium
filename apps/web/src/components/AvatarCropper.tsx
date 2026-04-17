import { useCallback, useEffect, useRef, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
} from "@mui/material";

interface Props {
  open: boolean;
  file: File | null;
  onClose: () => void;
  onSave: (blob: Blob) => Promise<void> | void;
}

const OUTPUT_SIZE = 512;

async function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function cropAndEncode(src: string, area: Area): Promise<Blob> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
  const canvas = document.createElement("canvas");
  canvas.width = OUTPUT_SIZE;
  canvas.height = OUTPUT_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.drawImage(image, area.x, area.y, area.width, area.height, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob returned null"))), "image/jpeg", 0.9);
  });
}

export function AvatarCropper({ open, file, onClose, onSave }: Props) {
  const [src, setSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const areaRef = useRef<Area | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!file) {
      setSrc(null);
      return;
    }
    readFileAsDataUrl(file).then(setSrc).catch(console.error);
  }, [file]);

  const onCropComplete = useCallback((_: Area, areaPx: Area) => {
    areaRef.current = areaPx;
  }, []);

  const handleSave = async () => {
    if (!src || !areaRef.current) return;
    try {
      setSaving(true);
      const blob = await cropAndEncode(src, areaRef.current);
      await onSave(blob);
      reset();
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setSrc(null);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    areaRef.current = null;
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Position your photo</DialogTitle>
      <DialogContent sx={{ minHeight: 420, pb: 1 }}>
        <Box
          sx={{
            position: "relative",
            width: "100%",
            height: { xs: 320, sm: 380 },
            bgcolor: "grey.900",
            borderRadius: 1,
            overflow: "hidden",
            touchAction: "none",
          }}
        >
          {src && (
            <Cropper
              image={src}
              crop={crop}
              zoom={zoom}
              aspect={1}
              cropShape="round"
              showGrid={false}
              zoomWithScroll
              restrictPosition
              minZoom={1}
              maxZoom={5}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
            />
          )}
        </Box>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ mt: 1.5, display: "block", textAlign: "center" }}
        >
          Drag to position · scroll or pinch to zoom
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={saving}>Cancel</Button>
        <Button variant="contained" onClick={handleSave} disabled={saving || !src}>
          {saving ? "Saving…" : "Save photo"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
