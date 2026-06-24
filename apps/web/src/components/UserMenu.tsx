import { useRef, useState } from "react";
import {
  Avatar,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  ListItemIcon,
  Menu,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import AccountCircleIcon from "@mui/icons-material/AccountCircle";
import ArticleIcon from "@mui/icons-material/Article";
import LogoutIcon from "@mui/icons-material/Logout";
import CameraAltIcon from "@mui/icons-material/CameraAlt";
import DeleteIcon from "@mui/icons-material/Delete";
import { useNavigate } from "react-router-dom";
import type { User } from "@atrium/shared";
import { useStore } from "../store";
import { AvatarCropper } from "./AvatarCropper";
import { ZulipLinkDialog } from "./ZulipLinkDialog";

export function UserMenu() {
  const user = useStore((s) => s.user);
  const setUser = useStore((s) => s.setUser);
  const navigate = useNavigate();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [name, setName] = useState("");
  const [imageUrl, setImageUrl] = useState<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cropperFile, setCropperFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const openProfile = () => {
    if (!user) return;
    setName(user.name);
    setImageUrl(user.imageUrl);
    setError(null);
    setProfileOpen(true);
    setAnchor(null);
  };

  const saveNameOnly = async () => {
    if (!user) return;
    if (name.trim() === user.name) {
      setProfileOpen(false);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/me", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? `${res.status}`);
      }
      setUser((await res.json()) as User);
      setProfileOpen(false);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setSaving(false);
    }
  };

  const uploadBlob = async (blob: Blob) => {
    setSaving(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", blob, "avatar.jpg");
      const res = await fetch("/api/me/avatar", {
        method: "POST",
        credentials: "include",
        body: form,
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `${res.status}`);
      }
      const { imageUrl: newUrl } = (await res.json()) as { imageUrl: string };
      if (user) setUser({ ...user, imageUrl: newUrl });
      setImageUrl(newUrl);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setSaving(false);
      setCropperFile(null);
    }
  };

  const removePhoto = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/me/avatar", { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}`);
      if (user) setUser({ ...user, imageUrl: undefined });
      setImageUrl(undefined);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setSaving(false);
    }
  };

  const logout = async () => {
    await fetch("/auth/logout", { method: "POST", credentials: "include" });
    window.location.href = "/";
  };

  if (!user) return null;

  return (
    <>
      <IconButton size="small" onClick={(e) => setAnchor(e.currentTarget)}>
        <Avatar src={user.imageUrl} alt={user.name} sx={{ width: 32, height: 32 }}>
          {user.name.charAt(0)}
        </Avatar>
      </IconButton>

      <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
        <Box sx={{ px: 2, py: 1, maxWidth: 260 }}>
          <Typography variant="body1" noWrap>{user.name}</Typography>
          <Typography variant="caption" color="text.secondary" noWrap>{user.email}</Typography>
        </Box>
        <Divider />
        <MenuItem onClick={openProfile}>
          <ListItemIcon>
            <AccountCircleIcon fontSize="small" />
          </ListItemIcon>
          Edit profile
        </MenuItem>
        <MenuItem
          onClick={() => {
            setAnchor(null);
            navigate("/members/me/submissions");
          }}
        >
          <ListItemIcon>
            <ArticleIcon fontSize="small" />
          </ListItemIcon>
          My submissions
        </MenuItem>
        <Divider />
        <ZulipLinkDialog />
        <Divider />
        <MenuItem onClick={logout}>
          <ListItemIcon>
            <LogoutIcon fontSize="small" />
          </ListItemIcon>
          Sign out
        </MenuItem>
      </Menu>

      <Dialog open={profileOpen} onClose={() => setProfileOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Edit profile</DialogTitle>
        <DialogContent>
          <Stack spacing={3} sx={{ mt: 1 }}>
            <Stack direction="row" spacing={2} alignItems="center">
              <Avatar src={imageUrl} alt={name} sx={{ width: 80, height: 80 }}>
                {(name || user.name).charAt(0)}
              </Avatar>
              <Stack spacing={1}>
                <Button
                  startIcon={<CameraAltIcon />}
                  onClick={() => fileInputRef.current?.click()}
                  disabled={saving}
                >
                  Upload photo
                </Button>
                {imageUrl && (
                  <Button
                    startIcon={<DeleteIcon />}
                    color="error"
                    onClick={removePhoto}
                    disabled={saving}
                  >
                    Remove
                  </Button>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) setCropperFile(f);
                    e.target.value = "";
                  }}
                />
              </Stack>
            </Stack>
            <TextField
              label="Display name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              fullWidth
            />
            {error && (
              <Typography color="error" variant="body2">{error}</Typography>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setProfileOpen(false)} disabled={saving}>
            Close
          </Button>
          <Button variant="contained" onClick={saveNameOnly} disabled={saving || !name.trim()}>
            Save name
          </Button>
        </DialogActions>
      </Dialog>

      <AvatarCropper
        open={!!cropperFile}
        file={cropperFile}
        onClose={() => setCropperFile(null)}
        onSave={uploadBlob}
      />
    </>
  );
}
