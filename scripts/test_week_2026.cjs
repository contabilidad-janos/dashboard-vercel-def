const getWeekNumber = (d) => {
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
    return weekNo - 1; // 0-indexed
};

console.log('Jan 1 2026:', getWeekNumber(new Date('2026-01-01')));
console.log('Jan 4 2026:', getWeekNumber(new Date('2026-01-04')));
console.log('Jan 5 2026:', getWeekNumber(new Date('2026-01-05'))); // Monday
console.log('Jan 11 2026:', getWeekNumber(new Date('2026-01-11'))); // Sunday
