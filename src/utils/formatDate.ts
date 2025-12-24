/**
 * Format a date as "Dec 24, 2025"
 */
export function formatShortDate(date: Date): string {
    return date.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    });
}

/**
 * Format a date as "December 24, 2025"
 */
export function formatLongDate(date: Date): string {
    return date.toLocaleDateString(undefined, {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
    });
}
