const FOREIGN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export const isValidForeignId = (value: string): boolean => FOREIGN_ID_PATTERN.test(value);
