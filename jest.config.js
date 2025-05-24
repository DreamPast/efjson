/** @type {import('jest').Config} */
export default {
  collectCoverage: true,
  collectCoverageFrom: ["<rootDir>/src/**/*.ts"],
  coverageDirectory: "<rootDir>/tmp/coverage",

  testMatch: ["<rootDir>/test/**/[^_]*.ts"],
  testEnvironment: "node",
  transform: {
    "^.+\\.ts$": ["ts-jest", { useESM: true }],
  },
};
