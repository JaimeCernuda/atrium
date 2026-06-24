import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Container,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import type { ZulipUserGroup } from "@atrium/shared";
import { useStore } from "../store";

type Bucket = "featured" | "secondary" | "hidden";

interface PolicyResponse {
  policy: { featured: number[]; secondary: number[] };
  allGroups: ZulipUserGroup[];
}

export function AdminUserGroupPolicy() {
  const setStorePolicy = useStore((s) => s.setZulipUserGroupPolicy);
  const [groups, setGroups] = useState<ZulipUserGroup[]>([]);
  const [featured, setFeatured] = useState<number[]>([]);
  const [secondary, setSecondary] = useState<number[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/user-group-policy", { credentials: "include" })
      .then((r) => r.json() as Promise<PolicyResponse>)
      .then((data) => {
        setGroups(data.allGroups ?? []);
        setFeatured(data.policy?.featured ?? []);
        setSecondary(data.policy?.secondary ?? []);
        if (data.policy) setStorePolicy(data.policy);
        setLoaded(true);
      })
      .catch((err) => {
        setError(String(err));
        setLoaded(true);
      });
  }, [setStorePolicy]);

  const bucketOf = (id: number): Bucket =>
    featured.includes(id) ? "featured" : secondary.includes(id) ? "secondary" : "hidden";

  const assign = (id: number, bucket: Bucket) => {
    setSaved(false);
    setFeatured((f) => (bucket === "featured" ? [...new Set([...f, id])] : f.filter((x) => x !== id)));
    setSecondary((s) =>
      bucket === "secondary" ? [...new Set([...s, id])] : s.filter((x) => x !== id),
    );
  };

  const save = async () => {
    setError(null);
    setSaved(false);
    const res = await fetch("/api/admin/user-group-policy", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ featured, secondary }),
    });
    if (!res.ok) {
      setError(`Save failed: ${res.status}`);
      return;
    }
    const data = (await res.json()) as { policy: { featured: number[]; secondary: number[] } };
    setFeatured(data.policy.featured);
    setSecondary(data.policy.secondary);
    setStorePolicy(data.policy);
    setSaved(true);
  };

  return (
    <Container maxWidth="md" sx={{ py: 3 }}>
      <Typography variant="h4" sx={{ mb: 1 }}>
        User groups
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Choose how Zulip user groups appear in the DM list. Featured groups show
        expanded, secondary groups show collapsed, and hidden groups stay out of the
        way until someone searches.
      </Typography>

      <Paper sx={{ p: 2 }}>
        <Stack spacing={2}>
          {error && <Alert severity="error">{error}</Alert>}
          {saved && <Alert severity="success">User-group policy saved.</Alert>}
          {loaded && groups.length === 0 && (
            <Alert severity="info">
              No Zulip groups are loaded yet. Link a Zulip key, then reopen this page to
              assign groups.
            </Alert>
          )}
          {groups.map((g) => {
            const current = bucketOf(g.id);
            return (
              <Box
                key={g.id}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 2,
                  flexWrap: "wrap",
                }}
              >
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="subtitle2">{g.name}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {g.memberIds.length} member{g.memberIds.length === 1 ? "" : "s"}
                    {g.description ? ` — ${g.description}` : ""}
                  </Typography>
                </Box>
                <Stack direction="row" spacing={1}>
                  {(["featured", "secondary", "hidden"] as Bucket[]).map((b) => (
                    <Chip
                      key={b}
                      label={b.charAt(0).toUpperCase() + b.slice(1)}
                      color={current === b ? "primary" : "default"}
                      variant={current === b ? "filled" : "outlined"}
                      onClick={() => assign(g.id, b)}
                      size="small"
                    />
                  ))}
                </Stack>
              </Box>
            );
          })}
          <Button variant="contained" onClick={save} sx={{ alignSelf: "flex-start" }}>
            Save
          </Button>
        </Stack>
      </Paper>
    </Container>
  );
}
