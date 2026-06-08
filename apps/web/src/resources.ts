/**
 * NSF cyberinfrastructure testbeds the lab tags on submissions, with the
 * acknowledgement text each program requires in any resulting publication.
 * Delta and DeltaAI are separate NSF awards and are tracked as separate tags.
 * The lab's Delta/DeltaAI access is granted through the ACCESS allocation below.
 */
import { SUBMISSION_RESOURCES, type SubmissionResource } from "@atrium/shared";

export { SUBMISSION_RESOURCES };
export type { SubmissionResource };

/** The lab's ACCESS allocation (IOWarp project), covering Delta and DeltaAI. */
export const ACCESS_ALLOCATION = "CIS250329";

export interface ResourceInfo {
  /** Required acknowledgement sentence(s) for the paper. */
  ack: string;
  /** Optional extra note (e.g. a citation the program asks you to include). */
  cite?: string;
}

export const RESOURCE_INFO: Record<SubmissionResource, ResourceInfo> = {
  Chameleon: {
    ack: "Results presented in this paper were obtained using the Chameleon testbed supported by the National Science Foundation (NSF).",
    cite: "Consider citing: Keahey et al., \"Lessons Learned from the Chameleon Testbed,\" USENIX ATC '20.",
  },
  Delta: {
    ack: `This work used the Delta system at the National Center for Supercomputing Applications through allocation ${ACCESS_ALLOCATION} from the Advanced Cyberinfrastructure Coordination Ecosystem: Services & Support (ACCESS) program, which is supported by U.S. National Science Foundation grants #2138259, #2138286, #2138307, #2137603, and #2138296.`,
    cite: "Consider citing the ACCESS paper: Boerner et al., PEARC '23, https://doi.org/10.1145/3569951.3597559.",
  },
  DeltaAI: {
    ack: `This work used the DeltaAI system at the National Center for Supercomputing Applications through allocation ${ACCESS_ALLOCATION} from the Advanced Cyberinfrastructure Coordination Ecosystem: Services & Support (ACCESS) program, which is supported by U.S. National Science Foundation grants #2138259, #2138286, #2138307, #2137603, and #2138296.`,
  },
};
