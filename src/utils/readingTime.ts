import getReadingTime from 'reading-time';

export function calculateReadingTime(content: string) {
    return getReadingTime(content).text;
}
