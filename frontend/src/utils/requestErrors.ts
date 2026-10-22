export const REQUEST_CANCELLATION_ERROR_MESSAGES = [
  'context changed',
  'request cancelled',
  'was cancelled',
] as const;

export function isRequestCancellationError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const message = err.message.toLowerCase();
  return REQUEST_CANCELLATION_ERROR_MESSAGES.some((cancellationMessage) =>
    message.includes(cancellationMessage)
  );
}
