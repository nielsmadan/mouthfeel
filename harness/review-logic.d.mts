export type FeedbackRow = Record<string, unknown>;

export const RATING_LABEL: Record<string, string>;
export function ratingLabel(rating: string): string;
export function stripHistory(item: FeedbackRow): FeedbackRow;
export function feedbackParts(
  saved: FeedbackRow | undefined,
  ranAt: string | undefined,
): { past: FeedbackRow[]; current: FeedbackRow; stale: boolean };
export function noteIsStale(noteAt: string | undefined, ranAt: string | undefined): boolean;
