///<reference types="svelte" />
;function $$render() {
;type $$ComponentProps = {
		accounts: Array<{
			id: string;
			name: string;
			sessions: number;
			images: number;
			videos: number;
			has_data: boolean;
		}>;
		onAccountClick: (account: (typeof accounts)[0]) => void;
		onDeleteClick: (account: (typeof accounts)[0]) => void;
	};
	// Left-side account list on the welcome page. Row = auto-login,
	// × = delete (modal flow when the account owns data).
	let {
		accounts = [],
		onAccountClick,
		onDeleteClick,
	} = $props</*Ωignore_startΩ*/$$ComponentProps/*Ωignore_endΩ*/>();

	function initial(name: string) {
		return (name.trim().charAt(0) || '?').toUpperCase();
	}
;
async () => {

 { svelteHTML.createElement("aside", {   "class":`accounts-panel`,"aria-label":`Accounts`,});
	 { svelteHTML.createElement("h2", { "class":`accounts-title`,});  }
	 { svelteHTML.createElement("div", { "class":`accounts-list`,});
		   for(let account of __sveltets_2_ensureArray(accounts)){account.id;
			 { svelteHTML.createElement("div", {            "class":`account-row`,"role":`button`,"tabindex":0,"title":`Continue as ${account.name}`,"onclick":() => onAccountClick(account),"onkeydown":(e) => e.key === 'Enter' && onAccountClick(account),});
				 { svelteHTML.createElement("span", { "class":`account-avatar`,});initial(account.name); }
				 { svelteHTML.createElement("span", { "class":`account-name`,});account.name; }
				if(account.has_data){
					 { svelteHTML.createElement("span", {  "class":`account-stats`,});account.sessions + account.images + account.videos;  }
				}
				 { svelteHTML.createElement("button", {        "class":`account-delete`,"title":`Delete ${account.name}`,"onpointerdown":(e) => e.stopPropagation(),"onclick":(e) => {
						e.stopPropagation();
						onDeleteClick(account);
					},});  }
			 }
		}
	 }
 }


};
return { props: {} as any as $$ComponentProps, exports: {}, bindings: __sveltets_$$bindings(''), slots: {}, events: {} }}
const WelcomeAccounts__SvelteComponent_ = __sveltets_2_fn_component($$render());
/*Ωignore_startΩ*/type WelcomeAccounts__SvelteComponent_ = ReturnType<typeof WelcomeAccounts__SvelteComponent_>;
/*Ωignore_endΩ*/export default WelcomeAccounts__SvelteComponent_;