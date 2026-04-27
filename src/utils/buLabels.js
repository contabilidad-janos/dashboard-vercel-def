// Public-facing rename map. Internally we keep the BU name "Picadeli"
// (in DB rows, BU_MAP keys, SEED_DATA, file paths, function names) so
// the data layer is untouched. UI components render names through
// `displayBuName` to surface the customer-facing label.
const BU_DISPLAY = {
    'Picadeli': 'Juntos deli',
};

export const displayBuName = (name) => BU_DISPLAY[name] || name;
