# Changelog

All notable changes to the AWS Bedrock Bridge extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-07-06

### Added
- **Rebrand & Re-vendor**: Rebranded extension to `bedrock-bridge-copilot` / `AWS Bedrock Bridge for Copilot Chat` under the publisher `abhimanyus1997`.
- **Diagnostics Dashboard (Webview Panel)**: Created a dedicated interactive diagnostics webview panel accessed via action menu, detailing AWS credentials, region config, live model checks, and token history graphs.
- **Model Access Diagnostics Check**: Added quick command and menu action to probe model capabilities and permissions with a low-cost, 1-token query to verify accessible (`🟢`), legacy/disabled (`🔴`), or regional connection errors (`🟡`).
- **Token Usage Tracker**: Extracts input, output, and total token usage metadata from Converse/ConverseStream responses. Optionally appends token counter directly in Copilot Chat answers.
- **GitHub Actions CI/CD Workflow**: Automates builds, TypeScript compilations, ESLint, and E2E verification tests, exporting compiled VSIX packages on every push/PR on main/dev branches.
- **Premium Brand Art**: Generated a sleek, neon-blue bridge neural network logo for Marketplace extension branding.

### Fixed
- **Dynamic Config Loading**: Retrieve VS Code workspace configurations dynamically to immediately apply region or AWS profile switches without needing extension re-activation.
