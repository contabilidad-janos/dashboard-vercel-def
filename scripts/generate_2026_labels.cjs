const fs = require('fs');

const startDate = new Date('2026-01-05T00:00:00Z'); // First Monday of 2026
const labels = [];

let current = new Date(startDate);

for (let i = 0; i < 52; i++) {
    const end = new Date(current);
    end.setDate(end.getDate() + 6);

    const pad = (n) => n.toString().padStart(2, '0');
    const label = `${pad(current.getUTCDate())}/${pad(current.getUTCMonth() + 1)}-${pad(end.getUTCDate())}/${pad(end.getUTCMonth() + 1)}`;
    labels.push(label);

    current.setDate(current.getDate() + 7);
}

console.log(JSON.stringify(labels, null, 4));
