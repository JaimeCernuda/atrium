/** File-slot definitions + example snippets shared by the submission forms. */

export interface FileSlot {
  role: string;
  label: string;
  accept: string;
  required: boolean;
  help?: { title: string; img?: string; code?: string };
}

export const EX_BIB = `@inproceedings{cernuda2024hstream,
  author    = {Jaime Cernuda and Jie Ye and Anthony Kougkas and Xian-He Sun},
  title     = {{HStream: A hierarchical data streaming engine for
               high-throughput scientific applications}},
  booktitle = {Proc. 53rd Int. Conf. on Parallel Processing (ICPP '24)},
  year      = {2024},
  pages     = {231--240}
}`;

export const EX_BIB_DOI = `@inproceedings{cernuda2024hstream,
  author    = {Jaime Cernuda and Jie Ye and Anthony Kougkas and Xian-He Sun},
  title     = {{HStream: A hierarchical data streaming engine for
               high-throughput scientific applications}},
  booktitle = {Proc. 53rd Int. Conf. on Parallel Processing (ICPP '24)},
  year      = {2024},
  pages     = {231--240},
  doi       = {10.1145/3673038.3673150}
}`;

export const EX_TXT = `J. Cernuda, J. Ye, A. Kougkas, and X.-H. Sun, "HStream: A
hierarchical data streaming engine for high-throughput scientific
applications," in Proc. 53rd Int. Conf. on Parallel Processing
(ICPP '24), 2024, pp. 231-240.`;

export const EX_TXT_DOI = `J. Cernuda, J. Ye, A. Kougkas, and X.-H. Sun, "HStream: A
hierarchical data streaming engine for high-throughput scientific
applications," in Proc. 53rd Int. Conf. on Parallel Processing
(ICPP '24), 2024, pp. 231-240, doi: 10.1145/3673038.3673150.`;

export const PAPER_NEW_FILES: FileSlot[] = [
  { role: "pdf", label: "Paper PDF", accept: ".pdf", required: true },
  {
    role: "source",
    label: "LaTeX source (.zip)",
    accept: ".zip",
    required: true,
    help: { img: "/overleaf-zip.png", title: "Overleaf → File → Download as source (.zip)" },
  },
  {
    role: "bib",
    label: "Citation .bib (no DOI)",
    accept: ".bib",
    required: true,
    help: { title: "Example .bib (no DOI yet)", code: EX_BIB },
  },
  {
    role: "cite",
    label: "Citation, plain text (.txt)",
    accept: ".txt",
    required: true,
    help: { title: "Example plain-text citation", code: EX_TXT },
  },
];

/** Post-conference edit: updated citations (with DOI) + slides. */
export const PAPER_EDIT_FILES: FileSlot[] = [
  {
    role: "bib",
    label: "Updated citation .bib (with DOI)",
    accept: ".bib",
    required: true,
    help: { title: "Example .bib (with DOI)", code: EX_BIB_DOI },
  },
  {
    role: "cite",
    label: "Updated citation, plain text (.txt, with DOI)",
    accept: ".txt",
    required: true,
    help: { title: "Example plain-text citation (with DOI)", code: EX_TXT_DOI },
  },
  { role: "slides-pptx", label: "Slides (.pptx)", accept: ".pptx", required: true },
  { role: "slides-pdf", label: "Slides (.pdf)", accept: ".pdf", required: true },
];

/** Camera-ready replacements, revealed by the toggle on the edit form. */
export const CAMERA_READY_FILES: FileSlot[] = [
  { role: "pdf", label: "Camera-ready paper PDF", accept: ".pdf", required: true },
  {
    role: "source",
    label: "Camera-ready LaTeX source (.zip)",
    accept: ".zip",
    required: false,
    help: { img: "/overleaf-zip.png", title: "Overleaf → File → Download as source (.zip)" },
  },
];

export const POSTER_FILES: FileSlot[] = [
  { role: "poster", label: "Poster (.pdf)", accept: ".pdf", required: true },
  { role: "abstract", label: "Extended abstract (.pdf)", accept: ".pdf", required: false },
  {
    role: "bib",
    label: "Citation .bib",
    accept: ".bib",
    required: true,
    help: { title: "Example .bib", code: EX_BIB },
  },
  {
    role: "cite",
    label: "Citation, plain text (.txt)",
    accept: ".txt",
    required: true,
    help: { title: "Example plain-text citation", code: EX_TXT },
  },
];
