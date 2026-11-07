/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  testMatch: ['<rootDir>/__tests__/**/*.test.ts?(x)'],
  // Los fixtures de líneas se leen directamente de ../MeshAzimuthTests/Fixtures/lines (FR-007): ver __tests__/helpers/fixtures.ts
};
