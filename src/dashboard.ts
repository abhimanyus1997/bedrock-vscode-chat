import * as vscode from "vscode";
import { BedrockMantleProvider } from "./provider";

export class BedrockDashboardPanel {
	public static currentPanel: BedrockDashboardPanel | undefined;
	private static readonly viewType = "bedrockBridgeDashboard";

	private readonly _panel: vscode.WebviewPanel;
	private readonly _extensionUri: vscode.Uri;
	private readonly _provider: BedrockMantleProvider;
	private _disposables: vscode.Disposable[] = [];

	public static createOrShow(extensionUri: vscode.Uri, provider: BedrockMantleProvider) {
		const column = vscode.window.activeTextEditor ? vscode.window.activeTextEditor.viewColumn : undefined;

		if (BedrockDashboardPanel.currentPanel) {
			BedrockDashboardPanel.currentPanel._panel.reveal(column);
			return;
		}

		const panel = vscode.window.createWebviewPanel(
			BedrockDashboardPanel.viewType,
			"AWS Bedrock Bridge Dashboard",
			column || vscode.ViewColumn.One,
			{
				enableScripts: true,
				retainContextWhenHidden: true,
				localResourceRoots: [extensionUri]
			}
		);

		BedrockDashboardPanel.currentPanel = new BedrockDashboardPanel(panel, extensionUri, provider);
	}

	private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, provider: BedrockMantleProvider) {
		this._panel = panel;
		this._extensionUri = extensionUri;
		this._provider = provider;

		// Set the webview's initial html content
		this._update();

		// Listen for when the panel is disposed
		// This happens when the user closes the panel or when the panel is closed programmatically
		this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

		// Handle messages from the webview
		this._panel.webview.onDidReceiveMessage(
			async (message) => {
				switch (message.command) {
					case "run-diagnostics":
						await this._runDiagnostics();
						break;
					case "refresh":
						this._provider.refresh();
						await this.updateState();
						break;
					case "save-config":
						const config = vscode.workspace.getConfiguration("aws-bedrock");
						await config.update("region", message.config.region, vscode.ConfigurationTarget.Global);
						await config.update("awsProfile", message.config.awsProfile, vscode.ConfigurationTarget.Global);
						await config.update("showTokenUsage", message.config.showTokenUsage, vscode.ConfigurationTarget.Global);
						
						if (message.config.apiKey !== undefined && message.config.apiKey !== "••••••••") {
							if (message.config.apiKey.trim() === "") {
								await this._provider.clearApiKey();
							} else {
								await this._provider.setApiKey(message.config.apiKey);
							}
						}
						
						vscode.window.showInformationMessage("AWS Bedrock Bridge configurations updated.");
						await this.updateState();
						break;
				}
			},
			null,
			this._disposables
		);

		// Subscribe to provider events
		this._provider.onDidUpdateTokenUsage(async () => {
			await this.updateState();
		}, null, this._disposables);

		this._provider.onDidChangeLanguageModelChatInformation(async () => {
			await this.updateState();
		}, null, this._disposables);
	}

	public async updateState() {
		const config = vscode.workspace.getConfiguration("aws-bedrock");
		let hasApiKey = false;
		try {
			const key = await this._provider.secrets.get("bedrock.apiKey");
			hasApiKey = !!key;
		} catch (e) {}

		this._panel.webview.postMessage({
			command: "state",
			state: {
				region: config.get<string>("region", "us-east-1"),
				profile: config.get<string>("awsProfile", "default"),
				showTokenUsage: config.get<boolean>("showTokenUsage", false),
				hasApiKey,
				models: this._provider.getModelsList().map(m => {
					const cache = this._provider.getModelAccessCache().find(c => c.id === m.id);
					return {
						id: m.id,
						displayName: m.displayName,
						backend: m.backend,
						status: cache?.status || "untested",
						detail: cache?.detail || ""
					};
				}),
				tokenUsage: this._provider.getTokenUsageHistory()
			}
		});
	}

	private async _runDiagnostics() {
		this._panel.webview.postMessage({ command: "testing-start" });
		
		const cancellationSource = new vscode.CancellationTokenSource();
		try {
			await vscode.window.withProgress({
				location: vscode.ProgressLocation.Notification,
				title: "Running Diagnostics in Dashboard",
				cancellable: true
			}, async (progress, token) => {
				token.onCancellationRequested(() => cancellationSource.cancel());
				await this._provider.testModelAccess(progress, cancellationSource.token);
			});
		} catch (e) {
			// Ignore or log
		} finally {
			cancellationSource.dispose();
		}
		
		await this.updateState();
	}

	public dispose() {
		BedrockDashboardPanel.currentPanel = undefined;

		// Clean up our resources
		this._panel.dispose();

		while (this._disposables.length) {
			const x = this._disposables.pop();
			if (x) {
				x.dispose();
			}
		}
	}

	private _update() {
		this._panel.title = "AWS Bedrock Bridge Dashboard";
		this._panel.webview.html = this._getHtmlForWebview();
		
		// Send initial state shortly after DOM load
		setTimeout(async () => {
			await this.updateState();
		}, 100);
	}

	private _getHtmlForWebview() {
		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>AWS Bedrock Bridge Dashboard</title>
	<style>
		@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
		
		body {
			font-family: 'Inter', var(--vscode-editor-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif);
			font-size: 13px;
			color: var(--vscode-foreground, #1e293b);
			background-color: var(--vscode-editor-background, #f8fafc);
			margin: 0;
			padding: 0;
			display: flex;
			min-height: 100vh;
		}

		/* Sidebar Layout */
		.sidebar {
			width: 240px;
			background-color: var(--vscode-sideBar-background, #ffffff);
			border-right: 1px solid var(--vscode-widget-border, #e2e8f0);
			padding: 24px;
			display: flex;
			flex-direction: column;
			justify-content: space-between;
			flex-shrink: 0;
		}

		.sidebar-brand {
			display: flex;
			align-items: center;
			gap: 10px;
			margin-bottom: 30px;
		}

		.brand-icon {
			width: 32px;
			height: 32px;
			background-color: #007acc;
			border-radius: 8px;
			display: flex;
			align-items: center;
			justify-content: center;
			color: white;
			font-weight: 700;
			font-size: 16px;
		}

		.brand-name {
			font-weight: 700;
			font-size: 16px;
			color: var(--vscode-editor-foreground, #0f172a);
		}

		.sidebar-menu {
			list-style: none;
			padding: 0;
			margin: 0;
			display: flex;
			flex-direction: column;
			gap: 6px;
		}

		.menu-item {
			padding: 10px 14px;
			border-radius: 8px;
			color: var(--vscode-descriptionForeground, #64748b);
			font-weight: 500;
			cursor: pointer;
			transition: background-color 0.2s, color 0.2s;
			display: flex;
			align-items: center;
			gap: 10px;
		}

		.menu-item:hover, .menu-item.active {
			background-color: rgba(0, 122, 204, 0.08);
			color: #007acc;
		}

		.pro-card {
			background: linear-gradient(135deg, rgba(236, 72, 153, 0.08) 0%, rgba(126, 34, 206, 0.08) 100%);
			border: 1px solid rgba(126, 34, 206, 0.15);
			border-radius: 12px;
			padding: 16px;
			margin-top: auto;
			display: flex;
			flex-direction: column;
			gap: 10px;
		}

		.pro-title {
			font-weight: 600;
			font-size: 13px;
			color: #7e22ce;
		}

		.pro-desc {
			font-size: 11px;
			color: var(--vscode-descriptionForeground, #64748b);
		}

		/* Main Content Area */
		.main-content {
			flex-grow: 1;
			padding: 40px;
			overflow-y: auto;
		}

		.header {
			display: flex;
			justify-content: space-between;
			align-items: center;
			margin-bottom: 30px;
		}

		.header-title {
			font-size: 22px;
			font-weight: 700;
			margin: 0;
			color: var(--vscode-editor-foreground, #0f172a);
		}

		.header-subtitle {
			font-size: 13px;
			color: var(--vscode-descriptionForeground, #64748b);
			margin: 4px 0 0 0;
		}

		/* Metrics Cards Grid */
		.metrics-grid {
			display: grid;
			grid-template-columns: repeat(3, 1fr);
			gap: 20px;
			margin-bottom: 24px;
		}

		@media (max-width: 768px) {
			.metrics-grid {
				grid-template-columns: 1fr;
			}
		}

		.metric-card {
			background-color: var(--vscode-editor-background, #ffffff);
			border: 1px solid var(--vscode-widget-border, #e2e8f0);
			border-radius: 12px;
			padding: 20px;
			box-shadow: 0 1px 3px rgba(0,0,0,0.02);
			display: flex;
			flex-direction: column;
			gap: 8px;
		}

		.metric-header {
			display: flex;
			justify-content: space-between;
			align-items: center;
			color: var(--vscode-descriptionForeground, #64748b);
			font-size: 12px;
			font-weight: 500;
		}

		.metric-value {
			font-size: 24px;
			font-weight: 700;
			color: var(--vscode-editor-foreground, #0f172a);
		}

		.metric-footer-badge {
			display: inline-block;
			align-self: flex-start;
			font-size: 11px;
			font-weight: 600;
			padding: 2px 6px;
			border-radius: 4px;
		}

		.badge-positive {
			background-color: rgba(34, 197, 94, 0.1);
			color: #16a34a;
		}

		/* Main Content Grid split (settings & logs / models) */
		.content-split-grid {
			display: grid;
			grid-template-columns: 1fr 1.2fr;
			gap: 24px;
			margin-bottom: 24px;
		}

		@media (max-width: 1024px) {
			.content-split-grid {
				grid-template-columns: 1fr;
			}
		}

		.card {
			background: var(--vscode-editor-background, #ffffff);
			border: 1px solid var(--vscode-widget-border, #e2e8f0);
			border-radius: 12px;
			padding: 24px;
			box-shadow: 0 1px 3px rgba(0,0,0,0.02);
		}

		.card-header {
			display: flex;
			justify-content: space-between;
			align-items: center;
			margin-bottom: 20px;
			padding-bottom: 12px;
			border-bottom: 1px solid var(--vscode-widget-border, #f1f5f9);
		}

		.card-title-text {
			font-size: 15px;
			font-weight: 600;
			color: var(--vscode-editor-foreground, #0f172a);
		}

		/* Form elements */
		.form-group {
			margin-bottom: 14px;
			display: flex;
			flex-direction: column;
			gap: 6px;
		}

		label {
			font-size: 11px;
			font-weight: 600;
			text-transform: uppercase;
			letter-spacing: 0.5px;
			color: var(--vscode-descriptionForeground, #64748b);
		}

		input[type="text"], input[type="password"], select {
			background-color: var(--vscode-input-background, #f8fafc);
			color: var(--vscode-input-foreground, #0f172a);
			border: 1px solid var(--vscode-input-border, #cbd5e1);
			padding: 8px 12px;
			border-radius: 6px;
			font-family: 'Inter', sans-serif;
			font-size: 13px;
			outline: none;
		}

		input[type="text"]:focus, input[type="password"]:focus, select:focus {
			border-color: #007acc;
		}

		.checkbox-group {
			display: flex;
			align-items: center;
			gap: 8px;
			margin-bottom: 16px;
			cursor: pointer;
		}

		.checkbox-group label {
			cursor: pointer;
			text-transform: none;
			letter-spacing: normal;
			font-size: 13px;
			font-weight: 500;
			color: var(--vscode-foreground, #1e293b);
		}

		/* Buttons */
		.btn {
			background-color: #007acc;
			color: #ffffff;
			border: 1px solid #007acc;
			padding: 8px 16px;
			border-radius: 6px;
			cursor: pointer;
			font-weight: 500;
			font-size: 12px;
			transition: background-color 0.2s, border-color 0.2s;
			font-family: 'Inter', sans-serif;
		}

		.btn:hover {
			background-color: #0062a3;
		}

		.btn:active {
			transform: scale(0.98);
		}

		.btn-secondary {
			background-color: transparent;
			color: var(--vscode-foreground, #007acc);
			border: 1px solid var(--vscode-widget-border, #cbd5e1);
		}

		.btn-secondary:hover {
			background-color: var(--vscode-button-secondaryBackground, #f1f5f9);
		}

		/* Active Configured Models List */
		.models-list-container {
			display: flex;
			flex-direction: column;
			gap: 12px;
			max-height: 330px;
			overflow-y: auto;
			padding-right: 6px;
		}

		.model-list-item {
			background: var(--vscode-input-background, #f8fafc);
			border: 1px solid var(--vscode-widget-border, #e2e8f0);
			border-radius: 8px;
			padding: 12px 16px;
			display: flex;
			justify-content: space-between;
			align-items: center;
		}

		.model-meta-info {
			display: flex;
			flex-direction: column;
			gap: 2px;
		}

		.model-name-text {
			font-weight: 600;
			color: var(--vscode-editor-foreground, #0f172a);
		}

		.model-id-text {
			font-family: monospace;
			font-size: 10px;
			color: var(--vscode-descriptionForeground, #64748b);
		}

		/* Status Indicator Badges */
		.status-indicator {
			display: inline-flex;
			align-items: center;
			gap: 6px;
			font-weight: 600;
			font-size: 10px;
			text-transform: uppercase;
			padding: 4px 8px;
			border-radius: 4px;
		}

		.status-verified {
			background-color: rgba(34, 197, 94, 0.1);
			color: #16a34a;
			border: 1px solid rgba(34, 197, 94, 0.2);
		}

		.status-disabled {
			background-color: rgba(239, 68, 68, 0.1);
			color: #dc2626;
			border: 1px solid rgba(239, 68, 68, 0.2);
		}

		.status-error {
			background-color: rgba(249, 115, 22, 0.1);
			color: #ea580c;
			border: 1px solid rgba(249, 115, 22, 0.2);
		}

		.status-untested {
			background-color: rgba(100, 116, 139, 0.1);
			color: #475569;
			border: 1px solid rgba(100, 116, 139, 0.2);
		}

		.dot {
			width: 6px;
			height: 6px;
			border-radius: 50%;
			display: inline-block;
		}

		.dot-success { background-color: #16a34a; }
		.dot-danger { background-color: #dc2626; }
		.dot-warning { background-color: #ea580c; }
		.dot-neutral { background-color: #475569; }

		/* Tables */
		table {
			width: 100%;
			border-collapse: collapse;
			margin-top: 8px;
		}

		th {
			text-align: left;
			padding: 10px 12px;
			font-weight: 600;
			color: var(--vscode-descriptionForeground, #64748b);
			border-bottom: 1px solid var(--vscode-widget-border, #e2e8f0);
			font-size: 11px;
			text-transform: uppercase;
			letter-spacing: 0.5px;
		}

		td {
			padding: 12px;
			border-bottom: 1px solid var(--vscode-widget-border, #f1f5f9);
			color: var(--vscode-foreground);
			vertical-align: middle;
		}

		tr:last-child td {
			border-bottom: none;
		}

		/* Live Scan Animation Bar */
		.scan-progress-container {
			width: 100%;
			height: 3px;
			background-color: var(--vscode-widget-border, #f1f5f9);
			border-radius: 2px;
			overflow: hidden;
			margin-bottom: 16px;
			display: none;
		}

		.scan-progress-bar {
			width: 30%;
			height: 100%;
			background-color: #007acc;
			border-radius: 2px;
			animation: scan 1.2s infinite ease-in-out;
		}

		@keyframes scan {
			0% { transform: translateX(-100%); }
			100% { transform: translateX(350%); }
		}

		.error-detail {
			font-family: monospace;
			font-size: 11px;
			background-color: rgba(239, 68, 68, 0.05);
			border-left: 2px solid #dc2626;
			padding: 6px 10px;
			border-radius: 4px;
			margin-top: 6px;
			word-break: break-all;
			max-height: 85px;
			overflow-y: auto;
			color: #991b1b;
		}
	</style>
</head>
<body>
	<!-- Sidebar Navigation -->
	<div class="sidebar">
		<div>
			<div class="sidebar-brand">
				<div class="brand-icon">A</div>
				<div class="brand-name">AWS Bedrock</div>
			</div>
			<ul class="sidebar-menu">
				<li class="menu-item active">Dashboard</li>
				<li class="menu-item" onclick="document.getElementById('diagnostics-card').scrollIntoView({ behavior: 'smooth' })">Diagnostics</li>
				<li class="menu-item" onclick="refreshConfig()">Reload Config</li>
			</ul>
		</div>
		<div class="pro-card">
			<div class="pro-title">Bridge Attribution</div>
			<div class="pro-desc">Inspired by bedrock-vscode-chat, made for professionals.</div>
			<button class="btn btn-secondary" style="font-size:10px; padding: 6px 10px;" onclick="window.open('https://github.com/abhimanyus1997/bedrock-vscode-chat')">GitHub Repo</button>
		</div>
	</div>

	<!-- Main Content Area -->
	<div class="main-content">
		<div class="header">
			<div>
				<h2 class="header-title">Financial & Resource Control Center</h2>
				<p class="header-subtitle">Real-time AWS model cost metrics and permission diagnostics</p>
			</div>
			<button class="btn btn-secondary" onclick="refreshConfig()">Reload Configurations</button>
		</div>

		<!-- Metrics row -->
		<div class="metrics-grid">
			<div class="metric-card">
				<div class="metric-header">
					<span>Total Session Tokens</span>
				</div>
				<div class="metric-value" id="val-tokens">0</div>
				<div class="metric-footer-badge badge-positive">Active Usage</div>
			</div>
			<div class="metric-card">
				<div class="metric-header">
					<span>Estimated Session Cost</span>
				</div>
				<div class="metric-value" id="val-cost">$0.00000</div>
				<div class="metric-footer-badge badge-positive" style="background-color:rgba(126, 34, 206, 0.1); color:#7e22ce;">LiteLLM Rates</div>
			</div>
			<div class="metric-card">
				<div class="metric-header">
					<span>AWS Target Profile</span>
				</div>
				<div class="metric-value" id="val-target-profile" style="font-size:16px; margin-top:8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">-</div>
				<div class="metric-footer-badge badge-positive" style="background-color:rgba(100, 116, 139, 0.1); color:#475569;" id="val-target-region">-</div>
			</div>
		</div>

		<div class="content-split-grid">
			<!-- Settings Editor Card -->
			<div class="card">
				<div class="card-header">
					<div class="card-title-text">Settings Editor</div>
				</div>
				
				<div class="form-group">
					<label for="input-region">AWS Region</label>
					<select id="input-region">
						<option value="us-east-1">us-east-1 (US East - N. Virginia)</option>
						<option value="us-west-2">us-west-2 (US West - Oregon)</option>
						<option value="ap-south-1">ap-south-1 (Asia Pacific - Mumbai)</option>
						<option value="ap-northeast-1">ap-northeast-1 (Asia Pacific - Tokyo)</option>
						<option value="ap-southeast-1">ap-southeast-1 (Asia Pacific - Singapore)</option>
						<option value="eu-central-1">eu-central-1 (Europe - Frankfurt)</option>
						<option value="eu-west-1">eu-west-1 (Europe - Ireland)</option>
						<option value="us-east-2">us-east-2 (US East - Ohio)</option>
					</select>
				</div>
				
				<div class="form-group">
					<label for="input-profile">AWS Profile</label>
					<input type="text" id="input-profile" placeholder="default" />
				</div>
				
				<div class="form-group">
					<label for="input-apikey">Mantle Proxy API Key</label>
					<input type="password" id="input-apikey" placeholder="Enter API Key if using Mantle" />
				</div>

				<div class="checkbox-group" onclick="toggleCheckbox('input-showtoken')">
					<input type="checkbox" id="input-showtoken" onclick="event.stopPropagation()" />
					<label for="input-showtoken">Append token counter to responses</label>
				</div>

				<button class="btn" style="width: 100%; margin-top: 10px;" onclick="saveSettings()">Save Configurations</button>
			</div>

			<!-- Active Configured Models List Card -->
			<div class="card">
				<div class="card-header">
					<div class="card-title-text">Active / Configured Models</div>
					<div class="card-subtitle-text" id="models-count-text">0 models total</div>
				</div>
				<div class="models-list-container" id="models-list">
					<div style="text-align: center; padding: 40px 0; color: var(--vscode-descriptionForeground, #64748b)">Loading models...</div>
				</div>
			</div>
		</div>

		<!-- Token Usage Logs Table Card -->
		<div class="card" style="margin-bottom: 24px;">
			<div class="card-header">
				<div class="card-title-text">Recent Transaction Logs</div>
				<div class="card-subtitle-text">Queries tracked in current VS Code session</div>
			</div>
			<div style="max-height: 250px; overflow-y: auto;">
				<table>
					<thead>
						<tr>
							<th>Time</th>
							<th>Model Family</th>
							<th>Prompt</th>
							<th>Completion</th>
							<th>Session Cost</th>
						</tr>
					</thead>
					<tbody id="token-usage-rows">
						<tr>
							<td colspan="5" style="text-align: center; padding: 30px 0; color: var(--vscode-descriptionForeground, #64748b)">No token usage recorded yet.</td>
						</tr>
					</tbody>
				</table>
			</div>
		</div>

		<!-- Diagnostics Panel Card -->
		<div class="card" id="diagnostics-card">
			<div class="card-header">
				<div class="title-area" style="flex-direction: column; align-items: flex-start; gap: 4px;">
					<div class="card-title-text">Model Authorization Diagnostics</div>
					<div class="card-subtitle-text">Warning: Diagnostic scans send a 1-token query to verify access, which may incur minor AWS charges.</div>
				</div>
				<button class="btn" id="btn-diagnostics" onclick="runDiagnostics()">Run Diagnosis</button>
			</div>

			<!-- Scan Progress Bar -->
			<div class="scan-progress-container" id="scan-progress">
				<div class="scan-progress-bar"></div>
			</div>

			<div style="overflow-x: auto;">
				<table>
					<thead>
						<tr>
							<th>Model Identifier</th>
							<th>Provider / Backend</th>
							<th>Diagnostics Status</th>
						</tr>
					</thead>
					<tbody id="model-status-rows">
						<tr>
							<td colspan="3" style="text-align: center; padding: 30px 0; color: var(--vscode-descriptionForeground, #64748b)">Loading models list...</td>
						</tr>
					</tbody>
				</table>
			</div>
		</div>
	</div>

	<script>
		const vscode = acquireVsCodeApi();

		// Handle messages sent from the extension
		window.addEventListener('message', event => {
			const message = event.data;
			switch (message.command) {
				case 'state':
					updateUI(message.state);
					break;
				case 'testing-start':
					document.getElementById('btn-diagnostics').disabled = true;
					document.getElementById('btn-diagnostics').innerText = 'Scanning...';
					document.getElementById('scan-progress').style.display = 'block';
					break;
			}
		});

		function runDiagnostics() {
			vscode.postMessage({ command: 'run-diagnostics' });
		}

		function refreshConfig() {
			vscode.postMessage({ command: 'refresh' });
		}

		function toggleCheckbox(id) {
			const cb = document.getElementById(id);
			cb.checked = !cb.checked;
		}

		function saveSettings() {
			const region = document.getElementById('input-region').value;
			const profile = document.getElementById('input-profile').value;
			const apiKey = document.getElementById('input-apikey').value;
			const showTokenUsage = document.getElementById('input-showtoken').checked;

			vscode.postMessage({
				command: 'save-config',
				config: {
					region,
					awsProfile: profile,
					apiKey,
					showTokenUsage
				}
			});
		}

		let initialLoad = true;

		function updateUI(state) {
			// Pre-populate input values on first state load
			if (initialLoad) {
				if (state.region) {
					document.getElementById('input-region').value = state.region;
				}
				if (state.profile) {
					document.getElementById('input-profile').value = state.profile;
				}
				if (state.hasApiKey) {
					document.getElementById('input-apikey').value = '••••••••';
				} else {
					document.getElementById('input-apikey').value = '';
				}
				document.getElementById('input-showtoken').checked = !!state.showTokenUsage;
				initialLoad = false;
			}

			// Update target headers
			document.getElementById('val-target-profile').innerText = state.profile || 'default';
			document.getElementById('val-target-region').innerText = state.region;

			// Update Diagnostics UI elements
			document.getElementById('btn-diagnostics').disabled = false;
			document.getElementById('btn-diagnostics').innerText = 'Run Diagnosis';
			document.getElementById('scan-progress').style.display = 'none';

			// Sum up total cost and tokens
			let totalTokens = 0;
			let totalCost = 0;
			if (state.tokenUsage && state.tokenUsage.length > 0) {
				state.tokenUsage.forEach(t => {
					totalTokens += (t.total || 0);
					totalCost += (t.cost || 0);
				});
			}
			document.getElementById('val-cost').innerText = '$' + totalCost.toFixed(5);
			document.getElementById('val-tokens').innerText = totalTokens.toLocaleString();

			// Update Token rows
			const tokenTbody = document.getElementById('token-usage-rows');
			if (state.tokenUsage && state.tokenUsage.length > 0) {
				tokenTbody.innerHTML = state.tokenUsage.map(t => {
					const nameParts = t.modelId.split(':');
					const shortName = nameParts[nameParts.length - 1];
					const costString = t.cost !== undefined ? '$' + t.cost.toFixed(5) : '-';
					return '<tr>' +
						'<td>' + t.timestamp + '</td>' +
						'<td><strong>' + shortName + '</strong></td>' +
						'<td>' + t.input + '</td>' +
						'<td>' + t.output + '</td>' +
						'<td><strong>' + costString + '</strong></td>' +
						'</tr>';
				}).join('');
			} else {
				tokenTbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 30px 0; color: var(--vscode-descriptionForeground, #64748b)">No token usage recorded yet.</td></tr>';
			}

			// Update Active/Configured models sidebar list
			const modelsCountText = document.getElementById('models-count-text');
			const modelsListDiv = document.getElementById('models-list');
			if (state.models && state.models.length > 0) {
				modelsCountText.innerText = state.models.length + ' models total';
				modelsListDiv.innerHTML = state.models.map(m => {
					let statusIndicator = '<span class="status-indicator status-untested"><span class="dot dot-neutral"></span></span>';
					if (m.status === 'accessible') {
						statusIndicator = '<span class="status-indicator status-verified"><span class="dot dot-success"></span></span>';
					} else if (m.status === 'accessDenied') {
						statusIndicator = '<span class="status-indicator status-disabled"><span class="dot dot-danger"></span></span>';
					} else if (m.status === 'error') {
						statusIndicator = '<span class="status-indicator status-error"><span class="dot dot-warning"></span></span>';
					}

					return '<div class="model-list-item">' +
						'<div class="model-meta-info">' +
							'<span class="model-name-text">' + m.displayName + '</span>' +
							'<span class="model-id-text">' + m.id + '</span>' +
						'</div>' +
						statusIndicator +
						'</div>';
				}).join('');
			} else {
				modelsCountText.innerText = '0 models total';
				modelsListDiv.innerHTML = '<div style="text-align: center; padding: 40px 0; color: var(--vscode-descriptionForeground, #64748b)">No models configured.</div>';
			}

			// Update Diagnostics model rows
			const modelTbody = document.getElementById('model-status-rows');
			if (state.models && state.models.length > 0) {
				modelTbody.innerHTML = state.models.map(m => {
					let statusIndicator = '<span class="status-indicator status-untested"><span class="dot dot-neutral"></span>Untested</span>';
					let errorRow = '';

					if (m.status === 'accessible') {
						statusIndicator = '<span class="status-indicator status-verified"><span class="dot dot-success"></span>Verified</span>';
					} else if (m.status === 'accessDenied') {
						statusIndicator = '<span class="status-indicator status-disabled"><span class="dot dot-danger"></span>Disabled</span>';
						errorRow = '<div class="error-detail">' + m.detail + '</div>';
					} else if (m.status === 'error') {
						statusIndicator = '<span class="status-indicator status-error"><span class="dot dot-warning"></span>Error</span>';
						errorRow = '<div class="error-detail">' + m.detail + '</div>';
					}

					return '<tr>' +
						'<td>' +
							'<div style="font-weight: 600; color: var(--vscode-editor-foreground, #0f172a);">' + m.displayName + '</div>' +
							'<code style="font-size:10px; color: var(--vscode-descriptionForeground, #64748b);">' + m.id + '</code>' +
							errorRow +
						'</td>' +
						'<td>' + (m.backend === 'bedrock' ? 'Native Bedrock' : 'Mantle') + '</td>' +
						'<td>' + statusIndicator + '</td>' +
						'</tr>';
				}).join('');
			} else {
				modelTbody.innerHTML = '<tr><td colspan="3" style="text-align: center; padding: 30px 0; color: var(--vscode-descriptionForeground, #64748b)">No models configured. Check your region setting.</td></tr>';
			}
		}
	</script>
</body>
</html>`;
	}
}
