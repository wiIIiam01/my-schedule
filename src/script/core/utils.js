export const APP_CONFIG = { 
    DAYS_MAP: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] 
};

export function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, 
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag])
    );
}

export function getLocalDateString(d) {
    const year = d.getFullYear();
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const day = d.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export function timeToMinutes(t) {
    if (!t) return 0;
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
}

export function parseResolution(resString) {
    if (!resString) return null;
    const dimensions = resString.toLowerCase().split('x').map(s => parseInt(s.trim()));
    if (dimensions.length === 2 && !isNaN(dimensions[0]) && !isNaN(dimensions[1])) {
        return { w: dimensions[0], h: dimensions[1] };
    }
    return null;
}