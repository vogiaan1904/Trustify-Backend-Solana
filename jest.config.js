module.exports = {
  testEnvironment: 'node',
  testEnvironmentOptions: {
    NODE_ENV: 'test',
  },
  restoreMocks: true,
  coveragePathIgnorePatterns: ['node_modules', 'src/config', 'src/app.js', 'tests'],
  testPathIgnorePatterns: ['/tests/integration'],
  coverageReporters: ['text', 'lcov', 'clover', 'html'],
};
