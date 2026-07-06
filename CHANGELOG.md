# Changelog

All notable changes to the AWS Bedrock Bridge extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.4] - 2026-07-06

### Added
- **Interactive Configuration Editor**: Directly edit AWS Region, AWS Profile, and Mantle API Key inside the dashboard UI.
- **LiteLLM Pricing Catalog Integration**: Fetches and caches the LiteLLM pricing index in the background to calculate highly accurate estimated costs for queries based on actual model rates.
- **Dynamic Diagnostics Progress**: The authorization diagnostics table now updates in real-time as each model check completes.

### Fixed
- **Modality Filtering**: Always filter out non-chat/non-text models (such as image generators or text embeddings) to prevent errors and clutter.
- **Access Denied Logs**: Correctly classify "not available for this account" errors as accessDenied status.

## [1.0.3] - 2026-07-06

### Added
- **Artificial Analysis Themed UI**: Completely redesigned the dashboard to be inspired by Artificial Analysis layout, featuring crisp white/slate cards, Outfit/Inter typography, and deep purple badge accents.
- **Immediate Region Switch Updates**: The Webview Dashboard now automatically updates when the active region is changed in the VS Code configurations, without needing a restart or manual configuration reload.

### Fixed
- **Clean Interface Aesthetics**: Removed all emojis and replaced them with styled CSS pill badges and live linear progress trackers during scan phases.

## [1.0.2] - 2026-07-06

### Added
- **API Cost Warning Disclaimer**: Added explicit warnings under the diagnostics dashboard card alerting users that running access probes may incur standard AWS API usage costs.

### Fixed
- **Mantle Token Usage Tracking**: Implemented token usage parsing and recording for Mantle proxy API streams/responses, ensuring token usage histories populate dynamically in real-time in the dashboard.

## [1.0.1] - 2026-07-06

### Added
- **Interactive Status Bar Counter**: Shows total Bedrock token usage in the session at the bottom-right status bar. Clicking it opens the webview dashboard.

### Fixed
- **Diagnostics Speed Optimization**: Parallelized model access testing checks, cutting verification latency from ~30+ seconds to under 2 seconds.
- **Log Spam Reduction**: Grouped and formatted Bedrock model listings in extension startup logs to prevent print clutter.

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
