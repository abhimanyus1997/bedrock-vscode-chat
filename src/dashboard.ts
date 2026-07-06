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
						this._updateState();
						break;
				}
			},
			null,
			this._disposables
		);

		// Subscribe to provider events
		this._provider.onDidUpdateTokenUsage(() => {
			this._updateState();
		}, null, this._disposables);
	}

	private _updateState() {
		const config = vscode.workspace.getConfiguration("aws-bedrock");
		this._panel.webview.postMessage({
			command: "state",
			state: {
				region: config.get<string>("region", "us-east-1"),
				profile: config.get<string>("awsProfile", "default"),
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
		
		this._updateState();
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
		setTimeout(() => {
			this._updateState();
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
		body {
			font-family: var(--vscode-editor-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif);
			font-size: var(--vscode-editor-font-size, 13px);
			color: var(--vscode-foreground);
			background-color: var(--vscode-editor-background);
			margin: 0;
			padding: 24px;
		}
		h1, h2, h3 {
			font-weight: 600;
			margin-top: 0;
		}
		h1 {
			font-size: 24px;
			color: var(--vscode-editor-foreground);
			margin-bottom: 24px;
			display: flex;
			align-items: center;
			gap: 8px;
		}
		.dashboard-grid {
			display: grid;
			grid-template-columns: 1fr 1fr;
			gap: 20px;
			margin-bottom: 24px;
		}
		@media (max-width: 768px) {
			.dashboard-grid {
				grid-template-columns: 1fr;
			}
		}
		.card {
			background: var(--vscode-welcomePage-tileBackground, rgba(120, 120, 120, 0.05));
			border: 1px solid var(--vscode-widget-border, rgba(120, 120, 120, 0.15));
			border-radius: 8px;
			padding: 20px;
			box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
			backdrop-filter: blur(10px);
		}
		.card-header {
			display: flex;
			justify-content: space-between;
			align-items: center;
			margin-bottom: 16px;
			border-bottom: 1px solid var(--vscode-widget-border, rgba(120, 120, 120, 0.1));
			padding-bottom: 10px;
		}
		.card-title {
			font-size: 16px;
			font-weight: bold;
			display: flex;
			align-items: center;
			gap: 6px;
		}
		.badge {
			display: inline-flex;
			align-items: center;
			padding: 2px 8px;
			border-radius: 12px;
			font-size: 11px;
			font-weight: 500;
		}
		.badge-success { background: rgba(76, 175, 80, 0.15); color: #4caf50; }
		.badge-danger { background: rgba(244, 67, 54, 0.15); color: #f44336; }
		.badge-warning { background: rgba(255, 152, 0, 0.15); color: #ff9800; }
		.badge-neutral { background: rgba(158, 158, 158, 0.15); color: #9e9e9e; }
		
		.btn {
			background-color: var(--vscode-button-background);
			color: var(--vscode-button-foreground);
			border: none;
			padding: 8px 16px;
			border-radius: 4px;
			cursor: pointer;
			font-weight: 500;
			display: inline-flex;
			align-items: center;
			gap: 6px;
			transition: background-color 0.2s;
		}
		.btn:hover {
			background-color: var(--vscode-button-hoverBackground);
		}
		.btn-secondary {
			background-color: var(--vscode-button-secondaryBackground, rgba(120,120,120,0.2));
			color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
		}
		.btn-secondary:hover {
			background-color: var(--vscode-button-secondaryHoverBackground, rgba(120,120,120,0.3));
		}
		table {
			width: 100%;
			border-collapse: collapse;
			margin-top: 10px;
		}
		th, td {
			text-align: left;
			padding: 10px;
			border-bottom: 1px solid var(--vscode-widget-border, rgba(120, 120, 120, 0.1));
		}
		th {
			font-weight: bold;
			color: var(--vscode-descriptionForeground);
		}
		.info-row {
			display: flex;
			justify-content: space-between;
			padding: 8px 0;
			border-bottom: 1px dashed rgba(120,120,120,0.1);
		}
		.info-row:last-child {
			border-bottom: none;
		}
		.info-label {
			color: var(--vscode-descriptionForeground);
		}
		.info-value {
			font-weight: 500;
		}
		.status-spinner {
			width: 12px;
			height: 12px;
			border: 2px solid rgba(120,120,120,0.3);
			border-top-color: var(--vscode-foreground);
			border-radius: 50%;
			animation: spin 1s infinite linear;
			display: inline-block;
		}
		@keyframes spin {
			0% { transform: rotate(0deg); }
			100% { transform: rotate(360deg); }
		}
		.error-detail {
			font-family: monospace;
			font-size: 11px;
			background: rgba(244, 67, 54, 0.08);
			padding: 6px;
			border-radius: 4px;
			margin-top: 4px;
			word-break: break-all;
			max-height: 80px;
			overflow-y: auto;
		}
	</style>
</head>
<body>
	<h1>AWS Bedrock Bridge Panel</h1>

	<div class="dashboard-grid">
		<!-- Connection Status Card -->
		<div class="card">
			<div class="card-header">
				<div class="card-title">🌐 AWS Connection Info</div>
			</div>
			<div class="info-row">
				<span class="info-label">Configured Region</span>
				<span class="info-value" id="val-region">-</span>
			</div>
			<div class="info-row">
				<span class="info-label">Active AWS Profile</span>
				<span class="info-value" id="val-profile">-</span>
			</div>
			<div class="info-row" style="margin-top: 12px;">
				<button class="btn btn-secondary" onclick="refreshConfig()">Reload Configurations</button>
			</div>
		</div>

		<!-- Token Usage History Card -->
		<div class="card">
			<div class="card-header">
				<div class="card-title">📊 Token Usage Monitor (Recent queries)</div>
			</div>
			<div style="max-height: 200px; overflow-y: auto;">
				<table>
					<thead>
						<tr>
							<th>Time</th>
							<th>Model</th>
							<th>In</th>
							<th>Out</th>
							<th>Total</th>
						</tr>
					</thead>
					<tbody id="token-usage-rows">
						<tr>
							<td colspan="5" style="text-align: center; color: var(--vscode-descriptionForeground)">No token usage recorded yet.</td>
						</tr>
					</tbody>
				</table>
			</div>
		</div>
	</div>

	<!-- Diagnostics & Models Table -->
	<div class="card">
		<div class="card-header">
			<div class="card-title">🔍 Model Diagnostics & Permission Explorer</div>
			<button class="btn" id="btn-diagnostics" onclick="runDiagnostics()">Run Access Diagnostics</button>
		</div>
		<div style="overflow-x: auto;">
			<table>
				<thead>
					<tr>
						<th>Model Name</th>
						<th>ID / ARN</th>
						<th>Provider</th>
						<th>Status</th>
					</tr>
				</thead>
				<tbody id="model-status-rows">
					<tr>
						<td colspan="4" style="text-align: center; color: var(--vscode-descriptionForeground)">Loading models...</td>
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
					document.getElementById('btn-diagnostics').innerText = 'Testing Permissions...';
					break;
			}
		});

		function runDiagnostics() {
			vscode.postMessage({ command: 'run-diagnostics' });
		}

		function refreshConfig() {
			vscode.postMessage({ command: 'refresh' });
		}

		function updateUI(state) {
			document.getElementById('val-region').innerText = state.region;
			document.getElementById('val-profile').innerText = state.profile || 'default/environment';
			
			// Update Diagnostics Button
			document.getElementById('btn-diagnostics').disabled = false;
			document.getElementById('btn-diagnostics').innerText = 'Run Access Diagnostics';

			// Update Token rows
			const tokenTbody = document.getElementById('token-usage-rows');
			if (state.tokenUsage && state.tokenUsage.length > 0) {
				tokenTbody.innerHTML = state.tokenUsage.map(t => {
					// Extract short name
					const nameParts = t.modelId.split(':');
					const shortName = nameParts[nameParts.length - 1];
					return \`<tr>
						<td>\${t.timestamp}</td>
						<td>\${shortName}</td>
						<td>\${t.input}</td>
						<td>\${t.output}</td>
						<td><strong>\${t.total}</strong></td>
					</tr>\`;
				}).join('');
			} else {
				tokenTbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--vscode-descriptionForeground)">No token usage recorded yet.</td></tr>';
			}

			// Update Model rows
			const modelTbody = document.getElementById('model-status-rows');
			if (state.models && state.models.length > 0) {
				modelTbody.innerHTML = state.models.map(m => {
					let statusBadge = '<span class="badge badge-neutral">Untested</span>';
					let errorRow = '';

					if (m.status === 'accessible') {
						statusBadge = '<span class="badge badge-success">Accessible</span>';
					} else if (m.status === 'accessDenied') {
						statusBadge = '<span class="badge badge-danger">Disabled / Legacy</span>';
						errorRow = \`<div class="error-detail">\${m.detail}</div>\`;
					} else if (m.status === 'error') {
						statusBadge = '<span class="badge badge-warning">Connection Error</span>';
						errorRow = \`<div class="error-detail">\${m.detail}</div>\`;
					}

					return \`<tr>
						<td>
							<strong>\${m.displayName}</strong>
							\${errorRow}
						</td>
						<td><code style="font-size:11px;">\${m.id}</code></td>
						<td>\${m.backend === 'bedrock' ? 'Native Bedrock' : 'Mantle'}</td>
						<td>\${statusBadge}</td>
					</tr>\`;
				}).join('');
			} else {
				modelTbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--vscode-descriptionForeground)">No models configured. Check your region setting.</td></tr>';
			}
		}
	</script>
</body>
</html>`;
	}
}
