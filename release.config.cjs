module.exports = {
  branches: ['main'],
  repositoryUrl: 'https://github.com/andywilliams/dwlf-charting-oss.git',
  plugins: [
    '@semantic-release/commit-analyzer',
    '@semantic-release/release-notes-generator',
    [
      '@semantic-release/npm',
      {
        npmPublish: true,
        pkgRoot: '.',
      },
    ],
    '@semantic-release/github',
  ],
};
