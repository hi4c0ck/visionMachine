///<reference types="svelte" />
;
import { onMount, onDestroy } from 'svelte';
import { invoke, isTauri } from '@tauri-apps/api/core';
import Workspace from './components/Workspace.svelte';
import Footer from './components/Footer.svelte';
import ErrorHandler from './components/ErrorHandler.svelte';
import WelcomeAccounts from './components/WelcomeAccounts.svelte';
import WelcomeDeleteModal from './components/WelcomeDeleteModal.svelte';
import { APP_CONSTANTS } from '$constants';
function $$render() {

	
	
	
	
	
	
	
	
	
	// State declarations - explicit reactive state
	// Show the name card only when no name is persisted; otherwise the
	// "cookie-like" restoration (vm-username) lands the user straight in
	// the workspace so re-entering the app never asks for the name again.
	let userName = $state('');
	let showWelcome = $state(false);
	let selectedTheme = $state('jetbrains-dark');
	let layoutMode = $state('landscape');
	let error = $state<string | null>(null);
	let runtimeError = $state<Error | null>(null);

	// Welcome-page account list (desktop only; empty in the browser).
	let accounts = $state<any[]>([]);
	let deleteTarget = $state<any | null>(null);
	let deleting = $state(false);
	let notice = $state('');
	
	// Derived state - properly reactive
	let isNameEmpty = $derived(!userName.trim().length);
	let canLogin = $derived(userName.trim().length > 0);
	
	// Load saved data from localStorage
	function loadAppData() {
		try {
			const savedProjects = localStorage.getItem('vm-projects');
			if (savedProjects) {
				return JSON.parse(savedProjects);
			}
		} catch (e) {
			console.error('[App] Failed to load projects:', e);
			runtimeError = e instanceof Error ? e : new Error('Failed to load saved data');
		}
		return null;
	}
	
	// Functions
	function applyTheme(theme: string) {
		document.documentElement.setAttribute('data-theme', theme);
		localStorage.setItem('vm-theme', theme);
	}
	
	function handleLogin() {
		const name = userName.trim();
		if (!name) {
			error = 'Please enter your name';
			return;
		}
		showWelcome = false;
		try {
			localStorage.setItem('vm-username', name);
		} catch (e) {
			console.error('[App] Failed to save username:', e);
			error = 'Failed to save user data';
		}
	}
	
	function handleKeyDown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			handleLogin();
		}
	}
	
	function handleLogout() {
		// Forget the persisted name so the next launch asks for it again.
		try {
			localStorage.removeItem('vm-username');
		} catch (e) {
			console.error('[App] Failed to clear username:', e);
		}
		userName = '';
		deleteTarget = null;
		notice = '';
		showWelcome = true;
	}
	
	function handleThemeChange(theme: string) {
		selectedTheme = theme;
		applyTheme(theme);
	}
	
	function handleLayoutChange(mode: string) {
		layoutMode = mode;
		try {
			localStorage.setItem('vm-layout', mode);
		} catch (e) {
			console.error('[App] Failed to save layout:', e);
		}
	}
	
	function handleProjectsUpdate(projects: any[]) {
		try {
			localStorage.setItem('vm-projects', JSON.stringify(projects));
		} catch (e) {
			console.error('[App] Failed to save projects:', e);
			runtimeError = e instanceof Error ? e : new Error('Failed to save projects');
		}
	}

	// ── Welcome-page accounts ────────────────────────────────────────────
	async function loadAccounts() {
		if (!isTauri()) {
			accounts = [];
			return;
		}
		try {
			accounts = (await invoke('list_accounts')) as any[];
		} catch (e) {
			console.error('[App] Failed to load accounts:', e);
			accounts = [];
		}
	}

	// Row click = auto-login as that account.
	function handleAccountClick(account: any) {
		notice = '';
		userName = account.name;
		handleLogin();
	}

	// × click: confirm via modal when the account owns data,
	// otherwise delete directly (nothing to lose).
	function handleDeleteAccountClick(account: any) {
		notice = '';
		if (account.has_data) {
			deleteTarget = account;
		} else {
			performAccountDelete(account, false);
		}
	}

	async function performAccountDelete(account: any, deleteAllData: boolean) {
		if (!isTauri()) return;
		deleting = true;
		try {
			const result = (await invoke('delete_account', {
				input: { profile_id: account.id, delete_all_data: deleteAllData },
			})) as any;
			deleteTarget = null;
			notice = result?.cache_folder
				? `Data saved to ${result.cache_folder}`
				: `Account “${account.name}” deleted`;
			// Don't auto-login into a name whose account no longer exists.
			if (localStorage.getItem('vm-username') === account.name) {
				localStorage.removeItem('vm-username');
			}
			await loadAccounts();
		} catch (e) {
			console.error('[App] Failed to delete account:', e);
			error = `Failed to delete account: ${e}`;
		} finally {
			deleting = false;
		}
	}
	
	// Lifecycle
	onMount(() => {
		try {
			// Restore from localStorage
			const savedName = localStorage.getItem('vm-username');
			if (savedName) {
				userName = savedName;
				// A persisted name means the user already went through
				// onboarding — skip the welcome screen entirely.
			} else {
				showWelcome = true;
			}
			
			const savedTheme = localStorage.getItem('vm-theme');
			if (savedTheme) {
				selectedTheme = savedTheme;
			}
			
			const savedLayout = localStorage.getItem('vm-layout');
			if (savedLayout) {
				layoutMode = savedLayout;
			}
			
			applyTheme(selectedTheme);
			loadAccounts();

			// Renderer liveness ping (backend `ui_heartbeat` checker): every 5 s
			// tell the backend the webview is alive; when the pings stop the
			// backend logs it — that distinguishes a dead renderer from a
			// wedged main thread on the next "frozen window" report.
			if (isTauri()) {
				const beat = () => void invoke('ui_heartbeat').catch(() => {});
				beat();
				const beatTimer = window.setInterval(beat, 5000);
				onDestroy(() => window.clearInterval(beatTimer));

				// The packaged webview has no visible console: forward uncaught
				// JS errors + unhandled promise rejections to the backend log
				// (`js_error_log`) so a wedged UI leaves a `[UI] js error` trace
				// instead of a silent "frozen window".
				const reportJsError = (kind: string, detail: unknown) => {
					const msg = detail instanceof Error
						? `${detail.name}: ${detail.message}\n${String(detail.stack ?? '').slice(0, 1500)}`
						: String(detail);
					void invoke('js_error_log', { message: `${kind}: ${msg}`.slice(0, 4000) }).catch(() => {});
				};
				window.addEventListener('error', (e) =>
					reportJsError('window error', `${e.message} @ ${e.filename ?? '?'}:${e.lineno ?? 0}:${e.colno ?? 0}`));
				window.addEventListener('unhandledrejection', (e) => reportJsError('unhandled rejection', e.reason));
			}
		} catch (e) {
			console.error('[App] Failed to restore state:', e);
			runtimeError = e instanceof Error ? e : new Error('Failed to restore application state');
		}
	});
;
async () => {

 { const $$_reldnaHrorrE0C = __sveltets_2_ensureComponent(ErrorHandler); new $$_reldnaHrorrE0C({ target: __sveltets_2_any(), props: { children:() => { return __sveltets_2_any(0); },"error":runtimeError,}});
	if(showWelcome){
		 { svelteHTML.createElement("div", { "class":`app`,});
			 { svelteHTML.createElement("header", {   "class":`stripe`,"aria-label":`VisionMachine`,});
				 { svelteHTML.createElement("div", { "class":`stripe-clip`,});
					 { svelteHTML.createElement("div", {   "class":`stripe-scroll`,"aria-hidden":`true`,});
						   for(let _ of __sveltets_2_ensureArray(Array(24))){let i = 1;
							 { svelteHTML.createElement("span", { "class":`stripe-letter`,});  }
						}
					 }
				 }

				 { svelteHTML.createElement("div", { "class":`stripe-logo`,});
					 { svelteHTML.createElement("div", {     "class":`film-frame film-frame-logo`,"role":`img`,"aria-label":`VisionMachine`,});
						 { svelteHTML.createElement("img", {      "src":`/icons/vm-mark-128.png`,"alt":`VisionMachine`,"class":`film-mark`,});}
					 }
				 }

				 { svelteHTML.createElement("div", { "class":`stripe-controls`,});
					 { svelteHTML.createElement("span", { "class":`stripe-version`,}); APP_CONSTANTS.strings.version; }
					 { svelteHTML.createElement("select", {     "class":`theme-select`,"value":selectedTheme,"onchange":(e) => applyTheme(e.currentTarget.value),});
						  for(let theme of __sveltets_2_ensureArray(APP_CONSTANTS.themes)){
							 { svelteHTML.createElement("option", { "value":theme.id,});theme.name; }
						}
					 }
				 }
			 }

			if(error){
				 { svelteHTML.createElement("div", { "class":`error-banner`,});
					 { svelteHTML.createElement("span", {});error; }
				 }
			}

			 { svelteHTML.createElement("main", { "class":`main`,});
				if(accounts.length > 0){
					 { const $$_stnuoccAemocleW3C = __sveltets_2_ensureComponent(WelcomeAccounts); new $$_stnuoccAemocleW3C({ target: __sveltets_2_any(), props: {      accounts,"onAccountClick":handleAccountClick,"onDeleteClick":handleDeleteAccountClick,}});}
				}
				 { svelteHTML.createElement("div", { "class":`welcome-card`,});
					 { svelteHTML.createElement("h1", { "class":`welcome-title`,});APP_CONSTANTS.strings.welcomeTitle; }
					 { svelteHTML.createElement("p", { "class":`hint`,});APP_CONSTANTS.strings.enterName; }
					
					 { svelteHTML.createElement("input", {             "value":userName,"oninput":(e) => userName = e.currentTarget.value,"placeholder":APP_CONSTANTS.strings.namePlaceholder,"class":`input`,"type":`text`,"onkeydown":handleKeyDown,});}
					
					 { svelteHTML.createElement("button", {       "class":`btn btn-primary`,"disabled":isNameEmpty,"onclick":handleLogin,});
						APP_CONSTANTS.strings.getStarted;
					 }
				 }
			 }

			if(notice){
				 { svelteHTML.createElement("div", {   "class":`notice-banner`,"role":`status`,});
					 { svelteHTML.createElement("span", {});notice; }
					 { svelteHTML.createElement("button", {     "class":`notice-dismiss`,"title":`Dismiss`,"onclick":() => (notice = ''),});  }
				 }
			}

			 { const $$_ladoMeteleDemocleW2C = __sveltets_2_ensureComponent(WelcomeDeleteModal); new $$_ladoMeteleDemocleW2C({ target: __sveltets_2_any(), props: {         "account":deleteTarget,"busy":deleting,"onConfirm":(deleteAll: boolean) => deleteTarget && performAccountDelete(deleteAll, deleteTarget),"onCancel":() => {
					if (!deleting) deleteTarget = null;
				},}});}

			 { const $$_retooF2C = __sveltets_2_ensureComponent(Footer); new $$_retooF2C({ target: __sveltets_2_any(), props: {}});}
		 }
		}else{
			 { svelteHTML.createElement("div", { "id":`workspace-container`,});
				 { const $$_ecapskroW2C = __sveltets_2_ensureComponent(Workspace); new $$_ecapskroW2C({ target: __sveltets_2_any(), props: {              userName,selectedTheme,layoutMode,"showWelcome":showWelcome,"onlogout":handleLogout,"onthemeChange":handleThemeChange,"onlayoutChange":handleLayoutChange,"onprojectsupdate":handleProjectsUpdate,}});}
			 }
		}
 ErrorHandler}

};
return { props: {} as Record<string, never>, exports: {}, bindings: __sveltets_$$bindings(''), slots: {}, events: {} }}
const App__SvelteComponent_ = __sveltets_2_fn_component($$render());
/*Ωignore_startΩ*/type App__SvelteComponent_ = ReturnType<typeof App__SvelteComponent_>;
/*Ωignore_endΩ*/export default App__SvelteComponent_;