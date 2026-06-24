import { useState, type MouseEvent } from "react";
import { IconButton, ListItemText, Menu, MenuItem } from "@mui/material";
import AdminPanelSettingsIcon from "@mui/icons-material/AdminPanelSettings";
import { useNavigate } from "react-router-dom";
import type { PermissionKey } from "@atrium/shared";
import { can, useStore } from "../store";

const ITEMS: Array<{ label: string; path: string; permission: PermissionKey }> = [
  { label: "Members", path: "/admin/members", permission: "manage_members" },
  { label: "Roles", path: "/admin/roles", permission: "manage_roles" },
  { label: "Rooms", path: "/admin/rooms", permission: "manage_rooms" },
  { label: "Zulip", path: "/admin/zulip", permission: "manage_rooms" },
  { label: "User groups", path: "/admin/user-groups", permission: "manage_rooms" },
  { label: "Metrics", path: "/admin/metrics", permission: "view_metrics" },
  { label: "Bots", path: "/admin/bot-tokens", permission: "manage_bots" },
  { label: "Submissions", path: "/admin/submissions", permission: "view_all_submissions" },
];

/** Permissions that make the admin menu worth showing at all. */
export const ADMIN_PERMISSIONS: PermissionKey[] = ITEMS.map((i) => i.permission);

export function AdminMenu() {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const navigate = useNavigate();
  const user = useStore((s) => s.user);

  const visible = ITEMS.filter((item) => can(user, item.permission));
  if (visible.length === 0) return null;

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
        {visible.map((item) => (
          <MenuItem key={item.path} onClick={() => go(item.path)}>
            <ListItemText primary={item.label} />
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
