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
			background-color: var(--vscode-editor-background, #ffffff);
			margin: 0;
			padding: 40px;
			line-height: 1.5;
		}
		
		.header {
			display: flex;
			justify-content: space-between;
			align-items: center;
			margin-bottom: 32px;
			border-bottom: 1px solid var(--vscode-widget-border, #e2e8f0);
			padding-bottom: 24px;
		}

		.title-area {
			display: flex;
			align-items: center;
			gap: 12px;
		}

		.brand-title {
			font-size: 24px;
			font-weight: 700;
			margin: 0;
			color: var(--vscode-editor-foreground, #0f172a);
			letter-spacing: -0.5px;
		}

		.brand-subtitle-pill {
			font-size: 11px;
			background-color: #7e22ce;
			color: #ffffff;
			padding: 4px 10px;
			border-radius: 12px;
			font-weight: 600;
			text-transform: uppercase;
			letter-spacing: 0.5px;
		}

		.dashboard-grid {
			display: grid;
			grid-template-columns: 1fr 1.6fr;
			gap: 24px;
			margin-bottom: 24px;
		}

		@media (max-width: 1024px) {
			.dashboard-grid {
				grid-template-columns: 1fr;
			}
		}

		.card {
			background: var(--vscode-editor-background, #ffffff);
			border: 1px solid var(--vscode-widget-border, #e2e8f0);
			border-radius: 8px;
			padding: 24px;
			box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
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

		.card-subtitle-text {
			font-size: 11px;
			color: var(--vscode-descriptionForeground, #64748b);
			margin-top: 4px;
		}

		/* Status Indicator Badges */
		.status-indicator {
			display: inline-flex;
			align-items: center;
			gap: 6px;
			font-weight: 600;
			font-size: 11px;
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

		/* Form Inputs styling */
		.form-group {
			margin-bottom: 16px;
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
			border-color: #7e22ce;
		}

		.checkbox-group {
			display: flex;
			align-items: center;
			gap: 8px;
			margin-bottom: 20px;
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
			background-color: #000000;
			color: #ffffff;
			border: 1px solid #000000;
			padding: 8px 16px;
			border-radius: 6px;
			cursor: pointer;
			font-weight: 500;
			font-size: 12px;
			transition: background-color 0.2s, border-color 0.2s;
			font-family: 'Inter', sans-serif;
		}

		.btn:hover {
			background-color: #1a1a1a;
		}

		.btn:active {
			transform: scale(0.98);
		}

		.btn:disabled {
			background-color: var(--vscode-button-secondaryBackground, #f1f5f9);
			color: var(--vscode-button-secondaryForeground, #94a3b8);
			border-color: var(--vscode-widget-border, #e2e8f0);
			cursor: not-allowed;
		}

		.btn-secondary {
			background-color: transparent;
			color: var(--vscode-foreground, #000000);
			border: 1px solid var(--vscode-widget-border, #cbd5e1);
		}

		.btn-secondary:hover {
			background-color: var(--vscode-button-secondaryBackground, #f1f5f9);
		}

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

		/* Cost Display */
		.cost-display {
			font-size: 28px;
			font-weight: 700;
			color: var(--vscode-editor-foreground, #0f172a);
			margin: 8px 0;
			letter-spacing: -0.5px;
		}

		/* Progress Bar */
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
			background-color: #7e22ce;
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
	<div class="header">
		<div class="title-area">
			<h1 class="brand-title">AWS Bedrock Bridge</h1>
			<span class="brand-subtitle-pill">Active</span>
		</div>
		<button class="btn btn-secondary" onclick="refreshConfig()">Reload Configurations</button>
	</div>

	<div class="dashboard-grid">
		<!-- Connection Settings Editor Card -->
		<div class="card">
			<div class="card-header">
				<div class="title-area">
					<div class="card-title-text">Settings Editor</div>
				</div>
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
				<label for="input-showtoken">Append token counter to chat responses</label>
			</div>

			<button class="btn" style="width: 100%;" onclick="saveSettings()">Save Configurations</button>

			<div class="card-header" style="margin-top: 24px; margin-bottom: 12px; border-bottom: none; padding-bottom: 0;">
				<div class="title-area">
					<div class="card-title-text">Estimated Session Cost</div>
				</div>
			</div>
			<div class="cost-display" id="val-cost">$0.00000</div>
			<div class="card-subtitle-text" style="margin-top:-6px;">Session Totals: <span id="session-tokens">0</span> tokens</div>
		</div>

		<!-- Token Usage History Card -->
		<div class="card">
			<div class="card-header">
				<div class="title-area">
					<div class="card-title-text">Token Usage Logs</div>
					<div class="card-subtitle-text">Queries tracked in current session</div>
				</div>
			</div>
			<div style="max-height: 380px; overflow-y: auto;">
				<table>
					<thead>
						<tr>
							<th>Time</th>
							<th>Model Family</th>
							<th>Prompt</th>
							<th>Completion</th>
							<th>Cost</th>
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
	</div>

	<!-- Diagnostics & Models Table -->
	<div class="card">
		<div class="card-header">
			<div class="title-area" style="flex-direction: column; align-items: flex-start; gap: 4px;">
				<div class="card-title-text">Model Authorization Diagnostics</div>
				<div class="card-subtitle-text">Warning: Running diagnostic scans sends a 1-token query to verify access, which may incur minor AWS charges.</div>
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
					document.getElementById('btn-diagnostics').innerText = 'Scanning permissions...';
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
			document.getElementById('session-tokens').innerText = totalTokens.toLocaleString();

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

			// Update Model rows
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
