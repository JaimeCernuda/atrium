import {
  Alert,
  AlertTitle,
  Box,
  Checkbox,
  FormControlLabel,
  FormGroup,
  Stack,
  Typography,
} from "@mui/material";
import {
  RESOURCE_INFO,
  SUBMISSION_RESOURCES,
  type SubmissionResource,
} from "../resources";

interface Props {
  selected: SubmissionResource[];
  onChange: (next: SubmissionResource[]) => void;
}

/**
 * Multi-select for the NSF cyberinfrastructure used by a submission. When a
 * resource is tagged, its required publication acknowledgement is shown so the
 * submitter can confirm the paper includes it. Delta and DeltaAI are separate.
 */
export function ResourcePicker({ selected, onChange }: Props) {
  const toggle = (r: SubmissionResource) =>
    onChange(selected.includes(r) ? selected.filter((x) => x !== r) : [...selected, r]);

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
        Computing resources used (for lab records — leave empty if none)
      </Typography>
      <FormGroup row>
        {SUBMISSION_RESOURCES.map((r) => (
          <FormControlLabel
            key={r}
            control={<Checkbox size="small" checked={selected.includes(r)} onChange={() => toggle(r)} />}
            label={r}
          />
        ))}
      </FormGroup>
      {selected.length > 0 && (
        <Alert severity="info" sx={{ mt: 1 }}>
          <AlertTitle>Required acknowledgement — confirm your paper includes this</AlertTitle>
          <Stack spacing={1}>
            {selected.map((r) => (
              <Box key={r}>
                <Typography variant="caption" sx={{ fontWeight: 700 }}>
                  {r}
                </Typography>
                <Typography variant="body2">{RESOURCE_INFO[r].ack}</Typography>
                {RESOURCE_INFO[r].cite && (
                  <Typography variant="caption" color="text.secondary">
                    {RESOURCE_INFO[r].cite}
                  </Typography>
                )}
              </Box>
            ))}
          </Stack>
        </Alert>
      )}
    </Box>
  );
}
