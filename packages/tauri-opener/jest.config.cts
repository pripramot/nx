export default {
  preset: '../../jest.preset.js',
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
  },
  testEnvironment: 'node',
  moduleFileExtensions: ['ts', 'js'],
  coverageDirectory: '../../coverage/packages/tauri-opener',
};
