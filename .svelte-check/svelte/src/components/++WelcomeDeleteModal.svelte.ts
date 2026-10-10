///<reference types="svelte" />
;
;type $$ComponentProps = {
		account: {
			id: string;
			name: string;
			sessions: number;
			images: number;
			videos: number;
		} | null;
		busy?: boolean;
		onConfirm: (deleteAllData: boolean) => void;
		onCancel: () => void;
	};function $$render() {

	// Delete-account confirmation: shows the data stats, and the
	// unchecked-by-default "Delete all data" checkbox. Unchecked =
	// generated data is preserved in the user cache folder first.
	let {
		account = null,
		busy = false,
		onConfirm,
		onCancel,
	} = $props</*Ωignore_startΩ*/$$ComponentProps/*Ωignore_endΩ*/>();

	// Default: keep the data (save to cache folder) — user must opt in
	// to a full delete.
	let deleteAllData = $state(false);

	$effect(() => {
		// Every (re)open for an account starts unchecked.
		account?.id;
		if (account) deleteAllData = false;
	});
;
async () => {

if(account){
	 { svelteHTML.createElement("div", {       "class":`modal-overlay`,"role":`presentation`,"onpointerdown":() => !busy && onCancel(),});
		 { svelteHTML.createElement("div", {           "class":`delete-modal`,"role":`dialog`,"aria-modal":`true`,"aria-label":`Delete ${account.name}`,"onpointerdown":(e) => e.stopPropagation(),});
			 { svelteHTML.createElement("h3", { "class":`modal-title`,}); account.name;  }
			 { svelteHTML.createElement("p", { "class":`modal-sub`,});
				         
				          
			 }

			 { svelteHTML.createElement("div", { "class":`delete-stats`,});
				 { svelteHTML.createElement("div", { "class":`stat`,});
					 { svelteHTML.createElement("span", { "class":`stat-value`,});account.videos; }
					 { svelteHTML.createElement("span", { "class":`stat-label`,});  }
				 }
				 { svelteHTML.createElement("div", { "class":`stat`,});
					 { svelteHTML.createElement("span", { "class":`stat-value`,});account.images; }
					 { svelteHTML.createElement("span", { "class":`stat-label`,});  }
				 }
				 { svelteHTML.createElement("div", { "class":`stat`,});
					 { svelteHTML.createElement("span", { "class":`stat-value`,});account.sessions; }
					 { svelteHTML.createElement("span", { "class":`stat-label`,});  }
				 }
			 }

			 { svelteHTML.createElement("p", { "class":`confirm-line`,});         }

			 { svelteHTML.createElement("label", { "class":`delete-all`,});
				 { svelteHTML.createElement("input", {         "type":`checkbox`,"checked":deleteAllData,"disabled":busy,"onchange":(e) => (deleteAllData = (e.target as HTMLInputElement).checked),});}
				 { svelteHTML.createElement("span", {});   }
			 }

			 { svelteHTML.createElement("div", { "class":`modal-actions`,});
				 { svelteHTML.createElement("button", {     "class":`action-btn cancel`,"disabled":busy,"onclick":onCancel,});
					
				 }
				 { svelteHTML.createElement("button", {       "class":`action-btn confirm`,"disabled":busy,"onclick":() => onConfirm(deleteAllData),});
					busy ? 'Deleting…' : 'Delete';
				 }
			 }
		 }
	 }
}


};
return { props: {} as any as $$ComponentProps, exports: {}, bindings: __sveltets_$$bindings(''), slots: {}, events: {} }}
const WelcomeDeleteModal__SvelteComponent_ = __sveltets_2_fn_component($$render());
/*Ωignore_startΩ*/type WelcomeDeleteModal__SvelteComponent_ = ReturnType<typeof WelcomeDeleteModal__SvelteComponent_>;
/*Ωignore_endΩ*/export default WelcomeDeleteModal__SvelteComponent_;