/** `XCTAssertEqual(a, b, accuracy:)`: |a − b| ≤ accuracy (nunca el número de dígitos de Jest — parity-matrix §4). */
export function near(actual: number | undefined, expected: number, accuracy: number): void {
  expect(actual).toBeDefined();
  expect(Math.abs((actual as number) - expected)).toBeLessThanOrEqual(accuracy);
}
