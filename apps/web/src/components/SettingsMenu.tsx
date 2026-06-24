import { useState } from "react";
import {
  Divider,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Switch,
  Typography,
} from "@mui/material";
import SettingsIcon from "@mui/icons-material/Settings";
import LightModeIcon from "@mui/icons-material/LightMode";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import SettingsBrightnessIcon from "@mui/icons-material/SettingsBrightness";
import NotificationsIcon from "@mui/icons-material/Notifications";
import VolumeUpIcon from "@mui/icons-material/VolumeUp";
import ForumIcon from "@mui/icons-material/Forum";
import { useStore } from "../store";
import { requestPermission, supportsNotifications } from "../notify";
import type { ThemeMode } from "../prefs";

export function SettingsMenu() {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const themeMode = useStore((s) => s.prefs.themeMode);
  const setThemeMode = useStore((s) => s.setThemeMode);
  const notificationsEnabled = useStore((s) => s.prefs.notificationsEnabled);
  const setNotificationsEnabled = useStore((s) => s.setNotificationsEnabled);
  const soundsEnabled = useStore((s) => s.prefs.soundsEnabled);
  const setSoundsEnabled = useStore((s) => s.setSoundsEnabled);
  const globalChatSoundEnabled = useStore((s) => s.prefs.globalChatSoundEnabled);
  const setGlobalChatSoundEnabled = useStore((s) => s.setGlobalChatSoundEnabled);

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

  return (
    <>
      <IconButton size="small" onClick={(e) => setAnchor(e.currentTarget)} aria-label="Settings">
        <SettingsIcon />
      </IconButton>
      <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
        <Typography variant="caption" sx={{ px: 2, color: "text.secondary" }}>
          Theme
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
      </Menu>
    </>
  );
}
