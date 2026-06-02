import { useEffect, useState } from "react";
import {
  Alert,
  Avatar,
  Chip,
  Container,
  Skeleton,
  Stack,
  Typography,
} from "@mui/material";
import { useParams } from "react-router-dom";
import type { Submission } from "@atrium/shared";
import { SubmissionsTable } from "../components/SubmissionsTable";

interface MemberHeader {
  id: string;
  name: string;
  email: string;
  imageUrl: string | null;
  role: string;
  roleName: string;
}

interface MemberSubmissionsResponse {
  member: MemberHeader;
  items: Submission[];
}

export function MemberSubmissions() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<MemberSubmissionsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setData(null);
    setError(null);
    fetch(`/api/members/${encodeURIComponent(id)}/submissions`, { credentials: "include" })
      .then(async (r) => {
        const body = (await r.json().catch(() => ({}))) as MemberSubmissionsResponse & {
          error?: string;
        };
        if (!r.ok) throw new Error(body.error ?? `HTTP ${r.status}`);
        return body;
      })
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, [id]);

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {!data && !error && (
        <Stack spacing={2}>
          <Stack direction="row" spacing={2} alignItems="center">
            <Skeleton variant="circular" width={56} height={56} />
            <Skeleton variant="text" width={240} height={36} />
          </Stack>
          <Skeleton variant="rounded" height={200} />
        </Stack>
      )}

      {data && (
        <>
          <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 3 }}>
            <Avatar
              src={data.member.imageUrl ?? undefined}
              alt={data.member.name}
              sx={{ width: 56, height: 56 }}
            >
              {data.member.name.charAt(0)}
            </Avatar>
            <Stack>
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="h5" sx={{ fontWeight: 600 }}>
                  {data.member.name}
                </Typography>
                <Chip size="small" variant="outlined" label={data.member.roleName} />
              </Stack>
              <Typography variant="body2" color="text.secondary">
                {data.member.email}
              </Typography>
            </Stack>
          </Stack>

          <Typography variant="h6" sx={{ fontWeight: 600, mb: 1.5 }}>
            Submissions ({data.items.length})
          </Typography>
          <SubmissionsTable items={data.items} />
        </>
      )}
    </Container>
  );
}
