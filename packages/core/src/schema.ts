import { z } from "zod";

export const MAX_TEXT = 20_000;
export const TRUNCATED_MARKER = "[truncated]";
export const NOTES_REF = "refs/notes/provenance";
export const TRAILER_KEY = "Provenance-Session";

/** ULID: 26 chars of Crockford base32. Also guarantees ids are safe as file names. */
export const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/;

export const SessionIdSchema = z.string().regex(ULID_RE, "invalid session id");

export const ReviewStatusSchema = z.enum(["unreviewed", "approved", "rejected"]);
export type ReviewStatus = z.infer<typeof ReviewStatusSchema>;

export const ReviewSchema = z.object({
  status: ReviewStatusSchema,
  reviewer: z.string().nullable(),
  at: z.string().nullable(),
  comment: z.string().nullable(),
});
export type Review = z.infer<typeof ReviewSchema>;

export const UNREVIEWED: Review = { status: "unreviewed", reviewer: null, at: null, comment: null };

export const ToolCallSchema = z.object({
  name: z.string(),
  summary: z.string().default(""),
});

export const SessionSchema = z.object({
  version: z.literal(1),
  id: SessionIdSchema,
  createdAt: z.iso.datetime({ offset: true }),
  agent: z.object({ name: z.string().min(1), version: z.string().optional() }),
  model: z.string().min(1),
  prompt: z.string().max(MAX_TEXT),
  contextFiles: z.array(z.string()).default([]),
  filesChanged: z.array(z.string()).optional(),
  toolCalls: z.array(ToolCallSchema).default([]),
  summary: z.string().max(MAX_TEXT).default(""),
  review: ReviewSchema.default(UNREVIEWED),
});
export type Session = z.infer<typeof SessionSchema>;

export const PendingSchema = z.object({
  sessionIds: z.array(SessionIdSchema),
});
export type Pending = z.infer<typeof PendingSchema>;

export const HunkSchema = z
  .object({
    file: z.string().min(1),
    start: z.number().int().min(1),
    end: z.number().int().min(1),
  })
  .refine((h) => h.end >= h.start, "end must be >= start");
export type Hunk = z.infer<typeof HunkSchema>;

export const LinkSchema = z.object({
  sessionId: SessionIdSchema,
  hunks: z.array(HunkSchema),
});
export type Link = z.infer<typeof LinkSchema>;

export const CommitNoteSchema = z.object({
  version: z.literal(1),
  links: z.array(LinkSchema),
});
export type CommitNote = z.infer<typeof CommitNoteSchema>;

/** Where a commit's lines came from. */
export interface CommitInfo {
  sha: string;
  /** ISO-8601 UTC author date; null if git did not report one. */
  date: string | null;
  /** File name at the time of that commit (differs from the current name after renames). */
  file: string;
  /** Line number at the time of that commit. */
  line: number;
}

export type Attribution =
  | { kind: "uncommitted" }
  | { kind: "human"; commit: CommitInfo }
  | { kind: "ai"; sessionId: string; session: Session | null; commit: CommitInfo };

export type LineAttribution = Attribution & { line: number };
