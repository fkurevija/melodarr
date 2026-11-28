const SAFE_UPSTREAM_ERROR = "Upstream service request failed. Check the server logs for details.";

export const isExplicitClientError = (error: unknown): boolean =>
  typeof error === "object"
  && error !== null
  && "status" in error
  && typeof (error as { status?: unknown }).status === "number"
  && (error as { status: number }).status >= 400
  && (error as { status: number }).status < 500;

export const toSafeApiError = (
  error: unknown,
  fallback: string,
  safeMessage = SAFE_UPSTREAM_ERROR
): { message: string; status: number } => {
  if (isExplicitClientError(error)) {
    const status = (error as { status: number }).status;
    const message = error instanceof Error && error.message ? error.message : fallback;
    return { message, status };
  }

  return { message: safeMessage, status: 502 };
};
