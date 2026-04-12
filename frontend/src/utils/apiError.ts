import i18n from '../i18n/config';

/**
 * API error structure returned by backend SSE streams.
 * Format: { code: string, params?: Record<string, string> }
 */
interface ApiError {
  code: string;
  params?: Record<string, string>;
}

/**
 * Resolve an SSE error to a localized human-readable message.
 *
 * Accepts both the structured format ({code, params}) and
 * legacy string format for backward compatibility.
 */
export function resolveApiError(error: unknown): string {
  if (typeof error === 'string') {
    // Legacy: raw string error from older backend versions
    return error;
  }

  if (isApiError(error)) {
    const key = `apiError.${error.code}`;
    const fallback = error.code;
    return i18n.t(key, { ...error.params, defaultValue: fallback });
  }

  // Unknown format - return a generic message
  return String(error);
}

function isApiError(value: unknown): value is ApiError {
  return (
    typeof value === 'object' &&
    value !== null &&
    'code' in value &&
    typeof (value as ApiError).code === 'string'
  );
}

/**
 * Resolve error_code from a JSON API response.
 * Conversation endpoints return:
 *   { code: number, error_code?: string, params?: Record<string, string>, message?: string, data: T }
 */
export function resolveResponseError(response: {
  error_code?: string;
  params?: Record<string, string>;
  message?: string;
}): string {
  if (response.error_code) {
    const key = `apiError.${response.error_code}`;
    // Use params from backend response for i18n interpolation (e.g. {{maxLength}})
    return i18n.t(key, {
      ...response.params,
      defaultValue: response.error_code,
    });
  }
  // Fallback to message if no error_code
  return response.message || 'Unknown error';
}
