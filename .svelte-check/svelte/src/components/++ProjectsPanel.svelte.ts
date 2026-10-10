///<reference types="svelte" />
;
import type { ProjectData, SessionData } from '$types';
import { APP_CONSTANTS } from '$constants';

;type $$ComponentProps = {
    projects: ProjectData[];
    selectedProjectId: string | null;
    selectedSessionId: string | null;
    onselectproject: (projectId: string) => void;
    onselectsession: (sessionId: string) => void;
    oncreateproject: (input: { name: string; path?: string }) => void;
    ondeleteproject: (projectId: string) => void;
    oncreatesession: (projectId: string) => void;
    onrenamesession: (sessionId: string, newName: string) => void;
    ondeletesession: (projectId: string, sessionId: string) => void;
    /** Open a folder picker and set the project's directory_path. */
    onopenprojectfolder?: (projectId: string) => void;
    /** Open a folder picker and set the session's directory_path. */
    onopensessionfolder?: (sessionId: string) => void;
    /** Duplicate the session (full copy, new name + id). */
    oncopysession?: (sessionId: string) => void;
  };function $$render() {

  
  

  let {
    projects, 
    selectedProjectId, 
    selectedSessionId,
    onselectproject,
    onselectsession,
    oncreateproject,
    ondeleteproject,
    oncreatesession,
    onrenamesession,
    ondeletesession,
    onopenprojectfolder,
    onopensessionfolder,
    oncopysession,
  } = $props</*Ωignore_startΩ*/$$ComponentProps/*Ωignore_endΩ*/>();

  // Modal state
  let showCreateProjectModal = $state(false);
  let newProjectName = $state('');
  let specifyPath = $state(false);
  let customPath = $state('');

  function openCreateProject() {
    showCreateProjectModal = true;
    newProjectName = '';
    specifyPath = false;
    customPath = '';
  }

  function closeCreateProjectModal() {
    showCreateProjectModal = false;
  }

  function confirmCreateProject() {
    if (!newProjectName.trim()) return;
    
    oncreateproject({
      name: newProjectName.trim(),
      path: specifyPath ? customPath : undefined,
    });
    closeCreateProjectModal();
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      confirmCreateProject();
    }
  }

  function handleSelectProject(projectId: string) {
    onselectproject(projectId);
  }

  function handleSelectSession(sessionId: string) {
    onselectsession(sessionId);
  }

  function handleDeleteProject(projectId: string) {
    ondeleteproject(projectId);
  }

  function handleOpenProjectFolder(projectId: string) {
    onopenprojectfolder?.(projectId);
  }

  function handleOpenSessionFolder(sessionId: string) {
    onopensessionfolder?.(sessionId);
  }

  function handleCopySession(sessionId: string) {
    oncopysession?.(sessionId);
  }

  function handleAddSession(projectId: string) {
    oncreatesession(projectId);
  }

  function handleRenameSession(sessionId: string, newName: string) {
    onrenamesession(sessionId, newName);
  }

  function handleDeleteSession(projectId: string, sessionId: string) {
    ondeletesession(projectId, sessionId);
  }
;
async () => {

 { svelteHTML.createElement("div", { "class":`projects-panel`,});
   { svelteHTML.createElement("div", { "class":`panel-header`,});
     { svelteHTML.createElement("span", { "class":`panel-title`,});APP_CONSTANTS.strings.project; }
     { svelteHTML.createElement("button", {     "class":`add-btn`,"onclick":openCreateProject,"title":`Create Project`,});  }
   }

  if(projects.length === 0){
     { svelteHTML.createElement("div", { "class":`empty-state`,});
       { svelteHTML.createElement("p", {});   }
       { svelteHTML.createElement("button", {   "class":`btn-create`,"onclick":openCreateProject,});
        APP_CONSTANTS.strings.createProject;
       }
     }
  }else{
     { svelteHTML.createElement("div", { "class":`projects-list`,});
         for(let project of __sveltets_2_ensureArray(projects)){project.id;
         { svelteHTML.createElement("div", {           "class":`project-item ${selectedProjectId === project.id ? 'selected' : ''}`,"onclick":() => handleSelectProject(project.id),"role":`button`,"tabindex":0,"onkeydown":(e) => e.key === 'Enter' && handleSelectProject(project.id),});
           { svelteHTML.createElement("span", { "class":`project-icon`,});  }
           { svelteHTML.createElement("span", { "class":`project-name`,});project.name; }
           { svelteHTML.createElement("span", { "class":`session-count`,});project.sessions.length; }
          if(onopenprojectfolder){
             { svelteHTML.createElement("button", {      "class":`project-action-btn`,"onclick":(e) => { e.stopPropagation(); handleOpenProjectFolder(project.id); },"title":`Open folder`,});
               }
          }
           { svelteHTML.createElement("button", {      "class":`delete-project-btn`,"onclick":(e) => { e.stopPropagation(); handleDeleteProject(project.id); },"title":`Delete Project`,});  }
         }
        
        
        if(selectedProjectId === project.id){
           { svelteHTML.createElement("div", { "class":`sessions-container`,});
               for(let session of __sveltets_2_ensureArray(project.sessions)){session.id;
               { svelteHTML.createElement("div", {           "class":`session-item ${selectedSessionId === session.id ? 'selected' : ''}`,"onclick":() => handleSelectSession(session.id),"role":`button`,"tabindex":0,"onkeydown":(e) => e.key === 'Enter' && handleSelectSession(session.id),});
                 { svelteHTML.createElement("span", { "class":`session-icon`,});  }
                 { svelteHTML.createElement("input", {             "type":`text`,"class":`session-name-input`,"value":session.name,"oninput":(e) => handleRenameSession(session.id, e.currentTarget.value),"onkeydown":(e) => {
                    // Enter: commit the rename and drop focus. Stop the
                    // bubble so the row-level Enter handler doesn't
                    // re-select the session mid-edit. Plain clicks still
                    // bubble to the row (standard tree behavior: clicking
                    // anywhere in the row — including the name field —
                    // selects the session); the authoritative-name fix in
                    // get_composer makes that re-select safe for renames.
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      e.stopPropagation();
                      handleRenameSession(session.id, e.currentTarget.value);
                      e.currentTarget.blur();
                    }
                  },"placeholder":`Session name`,});}
                 { svelteHTML.createElement("span", { "class":`session-action-cluster`,});
                  if(onopensessionfolder){
                     { svelteHTML.createElement("button", {      "class":`session-action-btn`,"onclick":(e) => { e.stopPropagation(); handleOpenSessionFolder(session.id); },"title":`Open folder`,});  }
                  }
                  if(oncopysession){
                     { svelteHTML.createElement("button", {      "class":`session-action-btn`,"onclick":(e) => { e.stopPropagation(); handleCopySession(session.id); },"title":`Copy session`,});  }
                  }
                   { svelteHTML.createElement("button", {      "class":`delete-session-btn`,"onclick":(e) => { e.stopPropagation(); handleDeleteSession(project.id, session.id); },"title":`Delete Session`,});  }
                 }
               }
            }
            
             { svelteHTML.createElement("button", {   "class":`add-session-btn`,"onclick":() => handleAddSession(project.id),});
                
             }
           }
        }
      }
     }
  }

  
  if(showCreateProjectModal){
     { svelteHTML.createElement("div", {     "class":`modal-backdrop`,"onclick":closeCreateProjectModal,"role":`presentation`,});
       { svelteHTML.createElement("div", {         "class":`modal`,"onclick":(e) => e.stopPropagation(),"role":`dialog`,"aria-modal":`true`,"aria-labelledby":`create-project-title`,});
         { svelteHTML.createElement("div", { "class":`modal-header`,});
           { svelteHTML.createElement("span", {   "class":`modal-title`,"id":`create-project-title`,});APP_CONSTANTS.strings.createProject; }
           { svelteHTML.createElement("button", {     "class":`modal-close`,"onclick":closeCreateProjectModal,"aria-label":`Close`,});  }
         }
        
         { svelteHTML.createElement("div", { "class":`modal-body`,});
           { svelteHTML.createElement("label", { "class":`form-label`,});APP_CONSTANTS.strings.projectName; }
           { svelteHTML.createElement("input", {           "type":`text`,"class":`modal-input`,"bind:value":newProjectName,"placeholder":APP_CONSTANTS.strings.projectNamePlaceholder,"onkeydown":handleKeyDown,});/*Ωignore_startΩ*/() => newProjectName = __sveltets_2_any(null);/*Ωignore_endΩ*/}
          
           { svelteHTML.createElement("label", { "class":`checkbox-label`,});
             { svelteHTML.createElement("input", {    "type":`checkbox`,"bind:checked":specifyPath,});/*Ωignore_startΩ*/() => specifyPath = __sveltets_2_any(null);/*Ωignore_endΩ*/}
             { svelteHTML.createElement("span", {});APP_CONSTANTS.strings.specifyPath; }
           }
          
          if(specifyPath){
             { svelteHTML.createElement("div", { "class":`path-section`,});
               { svelteHTML.createElement("label", { "class":`form-label`,});APP_CONSTANTS.strings.customPath; }
               { svelteHTML.createElement("input", {         "type":`text`,"class":`modal-input path-input`,"bind:value":customPath,"placeholder":APP_CONSTANTS.strings.customPathPlaceholder,});/*Ωignore_startΩ*/() => customPath = __sveltets_2_any(null);/*Ωignore_endΩ*/}
             }
          }
         }
        
         { svelteHTML.createElement("div", { "class":`modal-footer`,});
           { svelteHTML.createElement("button", {   "class":`btn-cancel`,"onclick":closeCreateProjectModal,});APP_CONSTANTS.strings.cancel; }
           { svelteHTML.createElement("button", {       "class":`btn-confirm`,"disabled":!newProjectName.trim(),"onclick":confirmCreateProject,});
            APP_CONSTANTS.strings.create;
           }
         }
       }
     }
  }
 }


};
return { props: {} as any as $$ComponentProps, exports: {}, bindings: __sveltets_$$bindings(''), slots: {}, events: {} }}
const ProjectsPanel__SvelteComponent_ = __sveltets_2_fn_component($$render());
/*Ωignore_startΩ*/type ProjectsPanel__SvelteComponent_ = ReturnType<typeof ProjectsPanel__SvelteComponent_>;
/*Ωignore_endΩ*/export default ProjectsPanel__SvelteComponent_;