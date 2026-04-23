import { useState, type MouseEvent } from "react";
import { IconButton, ListItemText, Menu, MenuItem } from "@mui/material";
import AdminPanelSettingsIcon from "@mui/icons-material/AdminPanelSettings";
import { useNavigate } from "react-router-dom";

export function AdminMenu() {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const navigate = useNavigate();

  const open = (e: MouseEvent<HTMLElement>) => setAnchor(e.currentTarget);
  const close = () => setAnchor(null);
  const go = (path: string) => {
    close();
    navigate(path);
  };

  return (
    <>
      <IconButton size="small" onClick={open} aria-label="Admin menu">
        <AdminPanelSettingsIcon />
      </IconButton>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={close}>
        <MenuItem onClick={() => go("/admin/rooms")}>
          <ListItemText primary="Rooms" />
        </MenuItem>
        <MenuItem onClick={() => go("/admin/metrics")}>
          <ListItemText primary="Metrics" />
        </MenuItem>
        <MenuItem onClick={() => go("/admin/bot-tokens")}>
          <ListItemText primary="Bots" />
        </MenuItem>
      </Menu>
    </>
  );
}
