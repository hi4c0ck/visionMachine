export default {
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      reporter: ['text', 'lcov']
    }
  }
};