export const ValidateAddress = (addresses: string[] | string): string[] => {
  if (Array.isArray(addresses)) {
    return addresses.filter((addr): addr is string => typeof addr === 'string');
  } else if (typeof addresses === 'string') {
    return addresses
      .split(/[, ]+/)
      .map((addr) => addr.trim())
      .filter((addr): addr is string => !!addr);
  }
  return [];
};
