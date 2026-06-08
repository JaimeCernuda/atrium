import { useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  FormGroup,
  Stack,
  Typography,
} from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import CheckIcon from "@mui/icons-material/Check";
import type { FundingGrant, FundingList, SubmissionResource } from "@atrium/shared";
import { SUBMISSION_RESOURCES } from "../resources";
import { buildAcknowledgments, DOE_FACILITIES } from "../acknowledgments";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Comma-separated grant strings currently in the form's funding field. */
  funding: string;
  /** Resource tags currently selected on the form. */
  resources: SubmissionResource[];
}

export function AcknowledgmentsDialog({ open, onClose, funding, resources }: Props) {
  const [grants, setGrants] = useState<FundingGrant[]>([]);
  const [pickedGrants, setPickedGrants] = useState<Set<string>>(new Set());
  const [pickedResources, setPickedResources] = useState<Set<SubmissionResource>>(new Set());
  const [pickedFacilities, setPickedFacilities] = useState<Set<string>>(new Set());
  const [partial, setPartial] = useState(true); // Dr. Sun: always "in part"
  const [copied, setCopied] = useState(false);

  // Load the grant catalog and pre-check from the form's current state when opened.
  useEffect(() => {
    if (!open) return;
    fetch("/api/funding", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { active: [], completed: [] }))
      .then((d: FundingList) => {
        const all = [...d.active, ...d.completed];
        setGrants(all);
        setPickedGrants(new Set(all.filter((g) => funding.includes(g.grant)).map((g) => g.grant)));
      })
      .catch(() => {});
    setPickedResources(new Set(resources));
    setPickedFacilities(new Set());
    setCopied(false);
  }, [open, funding, resources]);

  const latex = useMemo(
    () =>
      buildAcknowledgments({
        grants: grants.filter((g) => pickedGrants.has(g.grant)),
        resources: [...pickedResources],
        doeFacilities: [...pickedFacilities],
        partial,
      }),
    [grants, pickedGrants, pickedResources, pickedFacilities, partial],
  );

  const toggle = <T,>(set: React.Dispatch<React.SetStateAction<Set<T>>>, key: T) =>
    set((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const copy = () => {
    navigator.clipboard.writeText(latex).then(
      () => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      },
      () => {},
    );
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Generate acknowledgments</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Select the grants and resources that supported this work. Always double-check the result
          with your advisor before submitting — verify office names and award numbers.
        </Typography>

        <FormControlLabel
          control={<Checkbox checked={partial} onChange={(e) => setPartial(e.target.checked)} />}
          label={'Partial support ("in part") — recommended for center work'}
        />

        <Divider textAlign="left" sx={{ my: 1 }}>
          <Typography variant="caption" color="text.secondary">
            Funding
          </Typography>
        </Divider>
        <FormGroup>
          {grants.map((g) => (
            <FormControlLabel
              key={g.grant}
              control={
                <Checkbox
                  size="small"
                  checked={pickedGrants.has(g.grant)}
                  onChange={() => toggle(setPickedGrants, g.grant)}
                />
              }
              label={
                <Typography variant="body2">
                  <Box component="span" sx={{ fontWeight: 600 }}>
                    {g.project}
                  </Box>{" "}
                  <Box component="span" sx={{ fontFamily: "monospace", color: "text.secondary" }}>
                    {g.grant}
                  </Box>
                </Typography>
              }
            />
          ))}
          {grants.length === 0 && (
            <Typography variant="caption" color="text.secondary">
              No grants in the catalog.
            </Typography>
          )}
        </FormGroup>

        <Divider textAlign="left" sx={{ my: 1 }}>
          <Typography variant="caption" color="text.secondary">
            Computing resources
          </Typography>
        </Divider>
        <FormGroup row>
          {SUBMISSION_RESOURCES.map((r) => (
            <FormControlLabel
              key={r}
              control={
                <Checkbox
                  size="small"
                  checked={pickedResources.has(r)}
                  onChange={() => toggle(setPickedResources, r)}
                />
              }
              label={r}
            />
          ))}
        </FormGroup>

        <Divider textAlign="left" sx={{ my: 1 }}>
          <Typography variant="caption" color="text.secondary">
            DOE Office of Science User Facilities
          </Typography>
        </Divider>
        <FormGroup>
          {DOE_FACILITIES.map((f) => (
            <FormControlLabel
              key={f.key}
              control={
                <Checkbox
                  size="small"
                  checked={pickedFacilities.has(f.key)}
                  onChange={() => toggle(setPickedFacilities, f.key)}
                />
              }
              label={<Typography variant="body2">{f.name}</Typography>}
            />
          ))}
        </FormGroup>

        <Divider textAlign="left" sx={{ my: 1 }}>
          <Typography variant="caption" color="text.secondary">
            LaTeX — paste before your bibliography
          </Typography>
        </Divider>
        <Box
          component="pre"
          sx={{
            m: 0,
            p: 1.5,
            borderRadius: 1,
            bgcolor: "action.hover",
            fontSize: "0.8rem",
            fontFamily: "monospace",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {latex}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
        <Stack direction="row" spacing={1}>
          <Button
            variant="contained"
            startIcon={copied ? <CheckIcon /> : <ContentCopyIcon />}
            onClick={copy}
          >
            {copied ? "Copied" : "Copy LaTeX"}
          </Button>
        </Stack>
      </DialogActions>
    </Dialog>
  );
}
