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
  ListItemText,
  Menu,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import AccountCircleIcon from "@mui/icons-material/AccountCircle";
import ArticleIcon from "@mui/icons-material/Article";
import LogoutIcon from "@mui/icons-material/Logout";
import CameraAltIcon from "@mui/icons-material/CameraAlt";
import DeleteIcon from "@mui/icons-material/Delete";
import LightModeIcon from "@mui/icons-material/LightMode";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import SettingsBrightnessIcon from "@mui/icons-material/SettingsBrightness";
import NotificationsIcon from "@mui/icons-material/Notifications";
import VolumeUpIcon from "@mui/icons-material/VolumeUp";
import ForumIcon from "@mui/icons-material/Forum";
import ExploreIcon from "@mui/icons-material/Explore";
import { useNavigate } from "react-router-dom";
import type { User } from "@atrium/shared";
import { useStore } from "../store";
import { requestPermission, supportsNotifications } from "../notify";
import type { ThemeMode } from "../prefs";
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline";
import { AvatarCropper } from "./AvatarCropper";

export function UserMenu() {
  const user = useStore((s) => s.user);
  const setUser = useStore((s) => s.setUser);
  const zulipLinked = useStore((s) => s.zulipLinked);
  const setZulipLinkDialogOpen = useStore((s) => s.setZulipLinkDialogOpen);
  const setWelcomeTourOpen = useStore((s) => s.setWelcomeTourOpen);
  const themeMode = useStore((s) => s.prefs.themeMode);
  const setThemeMode = useStore((s) => s.setThemeMode);
  const notificationsEnabled = useStore((s) => s.prefs.notificationsEnabled);
  const setNotificationsEnabled = useStore((s) => s.setNotificationsEnabled);
  const soundsEnabled = useStore((s) => s.prefs.soundsEnabled);
  const setSoundsEnabled = useStore((s) => s.setSoundsEnabled);
  const globalChatSoundEnabled = useStore((s) => s.prefs.globalChatSoundEnabled);
  const setGlobalChatSoundEnabled = useStore((s) => s.setGlobalChatSoundEnabled);
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

  const pickTheme = (mode: ThemeMode) => {
    setThemeMode(mode);
  };

  const toggleNotifications = async () => {
    if (!notificationsEnabled) {
      const perm = await requestPermission();
      if (perm !== "granted") return;
    }
    setNotificationsEnabled(!notificationsEnabled);
  };

  const themeLabel: Record<ThemeMode, string> = {
    light: "Light",
    dark: "Dark",
    system: "System",
  };

  if (!user) return null;

  return (
    <>
      <IconButton
        size="small"
        data-tour="user-menu"
        onClick={(e) => setAnchor(e.currentTarget)}
      >
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
        <MenuItem
          onClick={() => {
            setAnchor(null);
            navigate("/");
            // Let the office route render so the tour's anchors exist before it
            // tries to position over them.
            setTimeout(() => setWelcomeTourOpen(true), 150);
          }}
        >
          <ListItemIcon>
            <ExploreIcon fontSize="small" />
          </ListItemIcon>
          Take the tour
        </MenuItem>
        <Divider />
        <MenuItem
          onClick={() => {
            setAnchor(null);
            setZulipLinkDialogOpen(true);
          }}
        >
          <ListItemIcon>
            <ChatBubbleOutlineIcon fontSize="small" />
          </ListItemIcon>
          {zulipLinked ? "Zulip connected" : "Connect Zulip"}
        </MenuItem>
        <Divider />
        <Typography variant="caption" sx={{ px: 2, color: "text.secondary" }}>
          Settings
        </Typography>
        <MenuItem selected={themeMode === "light"} onClick={() => pickTheme("light")}>
          <ListItemIcon>
            <LightModeIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>{themeLabel.light}</ListItemText>
        </MenuItem>
        <MenuItem selected={themeMode === "dark"} onClick={() => pickTheme("dark")}>
          <ListItemIcon>
            <DarkModeIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>{themeLabel.dark}</ListItemText>
        </MenuItem>
        <MenuItem selected={themeMode === "system"} onClick={() => pickTheme("system")}>
          <ListItemIcon>
            <SettingsBrightnessIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>{themeLabel.system}</ListItemText>
        </MenuItem>

        <Divider />

        <MenuItem onClick={toggleNotifications} disabled={!supportsNotifications()}>
          <ListItemIcon>
            <NotificationsIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>
            {supportsNotifications() ? "Browser notifications" : "Notifications unsupported"}
          </ListItemText>
          <Switch checked={notificationsEnabled} />
        </MenuItem>

        <MenuItem onClick={() => setSoundsEnabled(!soundsEnabled)}>
          <ListItemIcon>
            <VolumeUpIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText
            primary="Sounds"
            secondary="Pings, knocks, DMs"
            secondaryTypographyProps={{ variant: "caption" }}
          />
          <Switch checked={soundsEnabled} />
        </MenuItem>

        <MenuItem onClick={() => setGlobalChatSoundEnabled(!globalChatSoundEnabled)}>
          <ListItemIcon>
            <ForumIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText
            primary="Global chat sound"
            secondary="Soft tap on every message"
            secondaryTypographyProps={{ variant: "caption" }}
          />
          <Switch checked={globalChatSoundEnabled} />
        </MenuItem>
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
