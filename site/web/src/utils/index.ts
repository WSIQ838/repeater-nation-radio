export function createPageUrl(pageName: string) {
    return '/' + pageName.replace(/ /g, '-');
}

/** Format a frequency (MHz) for display with 3 decimal places, e.g. 462.55 -> "462.550". */
export function formatFreq(freq: number | string | null | undefined): string {
    if (freq === null || freq === undefined || freq === '') return '';
    const n = typeof freq === 'number' ? freq : parseFloat(freq);
    if (isNaN(n)) return String(freq);
    return n.toFixed(3);
}