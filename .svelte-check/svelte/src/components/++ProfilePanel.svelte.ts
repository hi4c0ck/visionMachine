///<reference types="svelte" />
;
import type { ProjectData, SessionData } from '$types';

;type $$ComponentProps = {
		userName: string;
		projects: ProjectData[];
		selectedProjectId: string | null;
		selectedSessionId: string | null;
		/** Opens the settings modal (defaults tab). */
		onopensettings?: () => void;
	};function $$render() {

	

	let {
		userName,
		projects,
		selectedProjectId,
		selectedSessionId,
		onopensettings,
	} = $props</*Ωignore_startΩ*/$$ComponentProps/*Ωignore_endΩ*/>();

	// Calculate real stats from projects
	let totalSessions = $derived(
		projects.reduce((acc: number, p: ProjectData) => acc + p.sessions.length, 0)
	);

	let totalGenerations = $derived(
		projects.reduce((acc: number, p: ProjectData) => acc + p.totalGenerations, 0)
	);

	let storageUsed = $derived(
		Math.round(projects.reduce((acc: number, p: ProjectData) => {
			// Rough estimate: each project/session metadata is ~1KB
			return acc + (1 + p.sessions.length) * 1;
		}, 0))
	);
;
async () => {

 { svelteHTML.createElement("div", {     "class":`profile-panel`,"role":`complementary`,"aria-label":`User profile`,});
	
	 { svelteHTML.createElement("div", { "class":`profile-header`,});
		 { svelteHTML.createElement("div", { "class":`user-avatar`,});userName.charAt(0).toUpperCase(); }
		 { svelteHTML.createElement("div", { "class":`user-info`,});
			 { svelteHTML.createElement("div", { "class":`user-name`,});userName; }
			 { svelteHTML.createElement("div", { "class":`user-storage`,}); storageUsed;  }
		 }
	 }

	
	 { svelteHTML.createElement("div", { "class":`profile-sections`,});
		 { svelteHTML.createElement("div", { "class":`section-item`,});
			 { svelteHTML.createElement("span", { "class":`section-label`,});  }
			 { svelteHTML.createElement("span", { "class":`section-value`,});totalSessions; }
		 }
		 { svelteHTML.createElement("div", { "class":`section-item`,});
			 { svelteHTML.createElement("span", { "class":`section-label`,});  }
			 { svelteHTML.createElement("span", { "class":`section-value`,});projects.length; }
		 }
		 { svelteHTML.createElement("div", { "class":`section-item`,});
			 { svelteHTML.createElement("span", { "class":`section-label`,});  }
			 { svelteHTML.createElement("span", { "class":`section-value`,});totalGenerations; }
		 }
	 }

	
	 { svelteHTML.createElement("button", {   "class":`settings-entry`,"onclick":onopensettings,});
		 { svelteHTML.createElement("span", {});  }
		 { svelteHTML.createElement("span", { "class":`settings-entry-chev`,});  }
	 }
 }

};
return { props: {} as any as $$ComponentProps, exports: {}, bindings: __sveltets_$$bindings(''), slots: {}, events: {} }}
const ProfilePanel__SvelteComponent_ = __sveltets_2_fn_component($$render());
/*Ωignore_startΩ*/type ProfilePanel__SvelteComponent_ = ReturnType<typeof ProfilePanel__SvelteComponent_>;
/*Ωignore_endΩ*/export default ProfilePanel__SvelteComponent_;