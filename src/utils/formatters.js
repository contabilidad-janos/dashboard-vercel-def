export const formatCurrency = (value) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EUR' }).format(value);

export const formatNumber = (value) =>
    new Intl.NumberFormat('en-US').format(value);
