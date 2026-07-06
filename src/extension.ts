/**
 * AWS Bedrock GitHub Copilot Chat Extension
 * Entry point for the extension
 */

import * as vscode from "vscode";
import { BedrockMantleProvider } from "./provider";
import { BedrockDashboardPanel } from "./dashboard";
import { PricingManager } from "./pricing";

export async function activate(context: vscode.ExtensionContext) {
	const output = vscode.window.createOutputChannel("AWS Bedrock");
	context.subscriptions.push(output);
	
	// Initialize pricing catalog
	await PricingManager.init(context.globalState);
	
	const registerCommandSafe = (commandId: string, handler: (...args: any[]) => any): void => {
		try {
			context.subscriptions.push(vscode.commands.registerCommand(commandId, handler));
		} catch (e) {
			// VS Code throws if a command ID is already registered (often due to multiple installs/dev hosts).
			// Don't fail activation; just skip and rely on the existing registration.
			const msg = `Command '${commandId}' already exists; skipping registration.`;
			output.appendLine(`WARNING: ${msg}`);
		}
	};
	
	output.appendLine("AWS Bedrock extension is activating...");
	output.appendLine(`AWS Bedrock activated at ${new Date().toISOString()}`);
	
	// Build User-Agent string
	const extVersion = (context.extension.packageJSON as { version?: string } | undefined)?.version ?? "unknown";
	const vscodeVersion = vscode.version;
	const userAgent = `bedrock-vscode-chat/${extVersion} VSCode/${vscodeVersion}`;
	output.appendLine(`Version: ${extVersion} | VS Code: ${vscodeVersion}`);

	// Get configuration
	const config = vscode.workspace.getConfiguration("aws-bedrock");

	// Create and register provider
	const provider = new BedrockMantleProvider(context.secrets, config, userAgent, output, context.globalState);
	output.appendLine("Created BedrockMantleProvider");

	const providerDisposable = vscode.lm.registerLanguageModelChatProvider(
		"abhimanyus1997.bedrock-bridge-copilot",
		provider
	);
	
	output.appendLine("Registered aws-bedrock provider with VSCode");
	
	// Eagerly fetch models to populate the picker
	provider.provideLanguageModelChatInformation({ silent: true }, new vscode.CancellationTokenSource().token).then(
		models => {
			output.appendLine(`Successfully loaded ${models.length} Bedrock models`);
			if (models.length === 0) {
				output.appendLine("No models returned - might need API key or check configuration");
			} else {
				const nativeModels = models.filter(m => m.name.endsWith("(Native)"));
				const mantleModels = models.filter(m => m.name.endsWith("(Mantle)"));
				
				if (nativeModels.length > 0) {
					output.appendLine(`  - Native Bedrock Models (${nativeModels.length}):`);
					const groups = new Map<string, string[]>();
					for (const m of nativeModels) {
						const name = m.name.replace(" (Native)", "");
						const brand = name.split(" ")[0] || "Other";
						const list = groups.get(brand) || [];
						list.push(name);
						groups.set(brand, list);
					}
					for (const [brand, list] of groups.entries()) {
						output.appendLine(`    * ${brand}: ${list.length} models (${list.slice(0, 5).join(", ")}${list.length > 5 ? ", ..." : ""})`);
					}
				}

				if (mantleModels.length > 0) {
					output.appendLine(`  - Mantle Models (${mantleModels.length}):`);
					const groups = new Map<string, string[]>();
					for (const m of mantleModels) {
						const name = m.name.replace(" (Mantle)", "");
						const brand = name.split(" ")[0] || "Other";
						const list = groups.get(brand) || [];
						list.push(name);
						groups.set(brand, list);
					}
					for (const [brand, list] of groups.entries()) {
						output.appendLine(`    * ${brand}: ${list.length} models (${list.slice(0, 5).join(", ")}${list.length > 5 ? ", ..." : ""})`);
					}
				}
			}
		},
		error => {
			output.appendLine(`ERROR: Failed to load Bedrock models: ${error}`);
			if (error instanceof Error) {
				output.appendLine(`  ${error.stack || error.message}`);
			}
		}
	);

	// Register management command for API key configuration
	const manageHandler = async () => {
		const action = await vscode.window.showQuickPick(
			[
				{ label: "$(settings-gear) Configure Mantle Authentication", action: "mantle-auth", description: "Choose API Key or AWS credentials" },
				{ label: "$(key) Enter API Key (Mantle)", action: "enter", description: "Provide API Key for Mantle" },
				{ label: "$(trash) Clear API Key (Mantle)", action: "clear", description: "Remove saved API Key" },
				{ label: "$(person) Set AWS Profile (Mantle)", action: "mantle-profile", description: "Named profile for Mantle SigV4" },
				{ label: "$(account) Set AWS Profile (Native)", action: "profile", description: "Named profile for direct Converse API" },
				{ label: "$(globe) Change Region", action: "region", description: "AWS Region for Bedrock calls" },
				{ label: "$(dashboard) Test Model Access", action: "test-access", description: "Verify permissions for Bedrock models" },
				{ label: "$(preview) Show Dashboard", action: "dashboard", description: "Open Bedrock Bridge Webview Panel" },
				{ label: "$(output) Show Logs", action: "logs", description: "Open AWS Bedrock output channel" },
			],
			{
				title: "Manage AWS Bedrock",
				placeHolder: "Select an action",
			}
		);

		if (!action) {
			return;
		}

		switch (action.action) {
			case "mantle-auth": {
				const currentMethod = config.get<string>("mantleAuthMethod", "apiKey");
				const selected = await vscode.window.showQuickPick(
					[
						{ 
							label: "$(key) API Key", 
							description: "Use API key from AWS Bedrock Console",
							detail: "Simpler, no AWS CLI setup needed",
							value: "apiKey" 
						},
						{ 
							label: "$(globe) AWS Credentials", 
							description: "Use AWS profile/credentials",
							detail: "Better for existing AWS setups",
							value: "awsCredentials" 
						},
					],
					{
						title: "Select Mantle Authentication Method",
						placeHolder: `Current: ${currentMethod === "apiKey" ? "API Key" : "AWS Credentials"}`,
					}
				);

				if (selected) {
					await config.update("mantleAuthMethod", selected.value, vscode.ConfigurationTarget.Global);
					vscode.window.showInformationMessage(
						`Mantle authentication set to ${selected.label}`
					);
				}
				break;
			}

			case "enter": {
				const apiKey = await vscode.window.showInputBox({
					title: "AWS Bedrock API Key (Mantle)",
					prompt: "Enter your AWS Bedrock API key from AWS Bedrock Console",
					ignoreFocusOut: true,
					password: true,
					placeHolder: "bedrock-api-key-...",
				});

				if (apiKey && apiKey.trim()) {
					await provider.setApiKey(apiKey.trim());
					vscode.window.showInformationMessage("AWS Bedrock API key saved");
				}
				break;
			}

			case "clear": {
				await provider.clearApiKey();
				break;
			}

			case "mantle-profile": {
				const current = config.get<string>("mantleAwsProfile", "");
				const entered = await vscode.window.showInputBox({
					title: "AWS Profile (Mantle)",
					prompt: "Optional AWS named profile for Mantle when using AWS credentials auth. Leave empty for default.",
					ignoreFocusOut: true,
					value: current,
					placeHolder: "e.g. default, my-sso-profile (leave blank for default chain)",
				});

				if (typeof entered === "string") {
					await config.update("mantleAwsProfile", entered.trim(), vscode.ConfigurationTarget.Global);
					vscode.window.showInformationMessage(
						entered.trim()
							? `Mantle AWS profile set to '${entered.trim()}'`
							: "Mantle AWS profile cleared (using default credentials)"
					);
				}
				break;
			}

			case "profile": {
				const current = config.get<string>("awsProfile", "");
				const entered = await vscode.window.showInputBox({
					title: "AWS Profile (Native Bedrock)",
					prompt: "Optional AWS named profile to use for native Bedrock (Converse). Leave empty to use default credentials.",
					ignoreFocusOut: true,
					value: current,
					placeHolder: "e.g. default, my-sso-profile (leave blank for default chain)",
				});

				if (typeof entered === "string") {
					await config.update("awsProfile", entered.trim(), vscode.ConfigurationTarget.Global);
					vscode.window.showInformationMessage(
						entered.trim()
							? `AWS profile set to '${entered.trim()}'`
							: "AWS profile cleared (using default credentials)"
					);
				}
				break;
			}

			case "region": {
				const regions = [
					{ label: "US East (N. Virginia)", value: "us-east-1" },
					{ label: "US East (Ohio)", value: "us-east-2" },
					{ label: "US West (Oregon)", value: "us-west-2" },
					{ label: "Europe (Ireland)", value: "eu-west-1" },
					{ label: "Europe (London)", value: "eu-west-2" },
					{ label: "Europe (Frankfurt)", value: "eu-central-1" },
					{ label: "Europe (Stockholm)", value: "eu-north-1" },
					{ label: "Europe (Milan)", value: "eu-south-1" },
					{ label: "Asia Pacific (Mumbai)", value: "ap-south-1" },
					{ label: "Asia Pacific (Tokyo)", value: "ap-northeast-1" },
					{ label: "Asia Pacific (Jakarta)", value: "ap-southeast-3" },
					{ label: "South America (São Paulo)", value: "sa-east-1" },
				];

				const currentRegion = config.get<string>("region", "us-east-1");
				const selected = await vscode.window.showQuickPick(regions, {
					title: "Select AWS Region",
					placeHolder: `Current: ${currentRegion}`,
				});

				if (selected) {
					await config.update("region", selected.value, vscode.ConfigurationTarget.Global);
					vscode.window.showInformationMessage(`Region set to ${selected.label}`);
				}
				break;
			}

			case "test-access": {
				await runTestAccess();
				break;
			}

			case "dashboard": {
				showDashboardHandler();
				break;
			}

			case "logs": {
				output.show(true);
				break;
			}
		}
	};

	const runTestAccess = async () => {
		await vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title: "Testing AWS Bedrock Model Access",
			cancellable: true
		}, async (progress, token) => {
			await provider.testModelAccess(progress, token);
		});
	};

	const showDashboardHandler = () => {
		BedrockDashboardPanel.createOrShow(context.extensionUri, provider);
	};

	const showLogsHandler = async () => {
		output.show(true);
	};

	// Register clear API key command
	const clearApiKeyHandler = async () => {
		await provider.clearApiKey();
	};

	// Register commands with unique IDs
	registerCommandSafe("bedrock-bridge-copilot.manage", manageHandler);
	registerCommandSafe("bedrock-bridge-copilot.showLogs", showLogsHandler);
	registerCommandSafe("bedrock-bridge-copilot.clearApiKey", clearApiKeyHandler);
	registerCommandSafe("bedrock-bridge-copilot.testAccess", runTestAccess);
	registerCommandSafe("bedrock-bridge-copilot.showDashboard", showDashboardHandler);

	// Best-effort legacy IDs (don't fail activation if they collide)
	registerCommandSafe("aws-bedrock.manage", manageHandler);
	registerCommandSafe("aws-bedrock.showLogs", showLogsHandler);
	registerCommandSafe("aws-bedrock.clearApiKey", clearApiKeyHandler);

	// Add to subscriptions
	context.subscriptions.push(providerDisposable);

	// Listen for configuration changes
	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration((e) => {
			if (e.affectsConfiguration("aws-bedrock")) {
				provider.refresh();
				if (BedrockDashboardPanel.currentPanel) {
					BedrockDashboardPanel.currentPanel.updateState();
				}
			}
		})
	);

	// Create and register a Status Bar Item for Bedrock Token Usage
	const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
	statusBarItem.text = "$(database) Bedrock: 0 tkn";
	statusBarItem.tooltip = "AWS Bedrock total token consumption this session. Click to open dashboard.";
	statusBarItem.command = "bedrock-bridge-copilot.showDashboard";
	statusBarItem.show();
	context.subscriptions.push(statusBarItem);

	// Update Status Bar when token usage is recorded
	provider.onDidUpdateTokenUsage(() => {
		const total = provider.getTokenUsageHistory().reduce((sum, item) => sum + item.total, 0);
		statusBarItem.text = `$(database) Bedrock: ${total.toLocaleString()} tkn`;
	});
}

export function deactivate() {
	// Cleanup if needed
}
