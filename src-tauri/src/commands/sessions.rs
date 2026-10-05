use crate::AppState;
use serde::Deserialize;
use tauri::State;

#[derive(Deserialize)]
pub struct CreateSessionInput {
    pub project_id: String,
    pub name: String,
    pub pipes_json: Option<String>,
    pub files_metadata: Option<String>,
}

#[derive(Deserialize)]
pub struct UpdateSessionInput {
    pub session_id: String,
    pub updates: serde_json::Value,
}

#[derive(Deserialize)]
pub struct DeleteSessionInput {
    pub session_id: String,
}

#[tauri::command]
pub async fn create_session(
    input: CreateSessionInput,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let db = state.db.lock().await;
    db.create_session(
        &input.project_id,
        &input.name,
        input.pipes_json.as_deref(),
        input.files_metadata.as_deref(),
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_sessions(
    input: serde_json::Value,
    state: State<'_, AppState>,
) -> Result<Vec<serde_json::Value>, String> {
    let project_id = input
        .get("project_id")
        .and_then(|v| v.as_str())
        .ok_or("project_id is required")?
        .to_string();
    let db = state.db.lock().await;
    db.list_sessions(&project_id)
        .await
        .map_err(|e| e.to_string())
}

#[derive(Deserialize)]
pub struct DuplicateSessionInput {
    pub session_id: String,
    pub new_name: Option<String>,
}

/// Full session duplication:
/// 1. brand-new session row (fresh id, copyable fields carried over);
/// 2. composer mirrored into the copy with re-minted piece ids (Pipe::rekeyed)
///    so the two sessions never share keys (Svelte 5 each_key_duplicate).
///
/// The copy carries the DESIGN only — layout, prompts, user-provided URLs.
/// NO generation artifacts: the media tree is not copied, and previews /
/// last-generation state are blanked in the copy's composer. The copy's
/// media root resolves on its own (project dir → default container) and its
/// first run mints artifacts that belong to it alone — the uuid flow stays
/// unambiguous: every piece id in the copy was minted by the copy.
/// Mirror the source session's composer into the freshly-created copy.
///
/// Carries the DESIGN forward (layout, prompts, user-provided URLs,
/// per-pipe params, media mode), re-minting every piece id
/// (`Pipe::rekeyed`) so the copy never shares keys with the source.
/// Generation artifacts are NOT carried: the media tree is not copied
/// and previews / last-generation state are blanked in the copy's
/// composer, so the copy starts clean and its own runs mint artifacts
/// that belong to it alone.
///
/// The copy's composer carries `id == new_session_id` — the invariant the
/// frontend load path relies on (session-io keys session objects by it;
/// a stray uuid here orphans the copy and it loads as "Untitled
/// Composer" with empty pipes).
///
/// Best-effort: a missing source composer row just means the copy starts
/// empty; the session duplication itself already succeeded.
async fn mirror_copy_composer(
    db: &crate::storage::db::Database,
    source_session_id: &str,
    new_session_id: &str,
    new_name: Option<&str>,
) -> Result<(), String> {
    if let Ok(composer) = db.get_composer(source_session_id).await {
        let mut copy = crate::models::ComposerConfig::new(new_session_id, &composer.name);
        copy.name = match new_name {
            Some(n) if !n.trim().is_empty() => n.trim().to_string(),
            _ => format!("{} (copy)", composer.name),
        };
        copy.fps = composer.fps;
        copy.resolution = composer.resolution.clone();
        copy.orientation = composer.orientation.clone();
        // A fresh session has no generation history of its own yet.
        copy.total_generated_frames = 0;
        // Design-only: re-mint every piece id, blank the artifacts.
        copy.pipes = composer
            .pipes
            .iter()
            .map(|p| crate::models::Pipe::rekeyed(p))
            .collect();

        if let Err(e) = db.save_composer(&copy).await {
            log::warn!(
                "[Sessions] mirror_copy_composer {new_session_id}: composer mirror failed: {e}"
            );
        } else {
            log::info!(
                "[Sessions] mirror_copy_composer {new_session_id}: mirrored {} pipe(s) from {source_session_id} (design only, no artifacts copied)",
                copy.pipes.len()
            );
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn duplicate_session(
    input: DuplicateSessionInput,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let db = state.db.lock().await;
    let new_id = db
        .duplicate_session(&input.session_id, input.new_name.as_deref())
        .await
        .map_err(|e| e.to_string())?;
    mirror_copy_composer(&db, &input.session_id, &new_id, input.new_name.as_deref()).await?;
    Ok(new_id)
}

#[tauri::command]
pub async fn update_session(
    input: UpdateSessionInput,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let db = state.db.lock().await;
    db.update_session(&input.session_id, &input.updates)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_session(
    input: DeleteSessionInput,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let db = state.db.lock().await;
    db.delete_session(&input.session_id)
        .await
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::mirror_copy_composer;
    use crate::models::composer::{Keyframe, LastGeneration, SubjectReference};
    use crate::models::{ComposerConfig, Pipe};
    use crate::storage::db::Database;

    /// Temp-file DB with the default profile + a project + one session
    /// ("promo"). Each test gets its own file so parallel test threads
    /// never race on the seed (same pattern as `update_session_tests`).
    async fn seeded_db() -> (Database, String, String) {
        static COUNTER: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);
        let n = COUNTER.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
        let dir = std::env::temp_dir().join(format!("vm_copiesess_{}", std::process::id()));
        let _ = std::fs::create_dir_all(&dir);
        let path = dir.join(format!("copy_test_{}.db", n));
        let _ = std::fs::remove_file(&path);
        let db = Database::new(path.to_string_lossy().as_ref())
            .await
            .unwrap();
        db.migrate().await.unwrap();
        db.seed_default_profile().await.unwrap();
        let pid = db.create_project("default", "proj", None).await.unwrap();
        let sid = db.create_session(&pid, "promo", None, None).await.unwrap();
        (db, pid, sid)
    }

    /// Rich source composer: two pipes, mixed keyframe kinds, a settled
    /// preview pair, subject refs with previews, and last-generation
    /// state — the full artifact surface a copy must blank while
    /// carrying the design.
    fn rich_source_composer(session_id: &str) -> ComposerConfig {
        let mut c = ComposerConfig::new(session_id, "promo");
        c.total_generated_frames = 500;
        c.pipes = vec![
            Pipe {
                id: "pipe-a".into(),
                name: "Pipe A".into(),
                length_frames: 241,
                q_value: 19,
                c_value: 8.0,
                keyframes: vec![
                    Keyframe {
                        id: "kf-a1".into(),
                        frame: 0,
                        slot_index: 1,
                        kind: "url".into(),
                        image_src: Some("https://img/a1.png".into()),
                        prompt: None,
                        reference_url: None,
                        preview_remote_url: None,
                        preview_local_path: None,
                        status: "pending".into(),
                        force_regen: false,
                    },
                    Keyframe {
                        id: "kf-a2".into(),
                        frame: 48,
                        slot_index: 2,
                        kind: "img2img".into(),
                        image_src: None,
                        prompt: Some("make it a dragon".into()),
                        reference_url: Some("https://ref/a2.png".into()),
                        preview_remote_url: Some("https://prov/a2.png".into()),
                        preview_local_path: Some("C:/media/a2.png".into()),
                        status: "done".into(),
                        force_regen: false,
                    },
                ],
                subject_references: vec![SubjectReference {
                    id: "sr-a1".into(),
                    image_url: "https://img/subject.png".into(),
                    kind: "url".into(),
                    prompt: None,
                    preview_remote_url: Some("https://prov/subject.png".into()),
                    preview_local_path: Some("C:/media/subject.png".into()),
                    status: "done".into(),
                    use_frames: false,
                    frame_start: None,
                    frame_end: None,
                    visible: true,
                    force_regen: false,
                }],
                elements: vec![],
                order_index: 0,
                last_generation: Some(LastGeneration {
                    task_id: "task-a".into(),
                    video_path: "C:/media/pipe-a.mp4".into(),
                    generated_at: 1_700_000_000_000,
                    status: "done".into(),
                }),
                media_mode: "keyframes".into(),
            },
            Pipe {
                id: "pipe-b".into(),
                name: "Pipe B".into(),
                length_frames: 121,
                q_value: 18,
                c_value: 7.0,
                keyframes: vec![Keyframe {
                    id: "kf-b1".into(),
                    frame: 0,
                    slot_index: 1,
                    kind: "txt2img".into(),
                    image_src: None,
                    prompt: Some("a dragon".into()),
                    reference_url: None,
                    preview_remote_url: None,
                    preview_local_path: None,
                    status: "pending".into(),
                    force_regen: false,
                }],
                subject_references: vec![],
                elements: vec![],
                order_index: 1,
                last_generation: None,
                media_mode: "reference".into(),
            },
        ];
        c
    }

    /// Regression for the "Untitled Composer" copy bug: the copy's
    /// composer must carry `id == new session id`, or the frontend load
    /// path resolves the copy by a stray uuid, finds neither a composer
    /// row nor a session row, and answers "Untitled Composer" + empty.
    #[tokio::test]
    async fn copy_is_loadable_and_composer_id_equals_session_id() {
        let (db, _pid, sid) = seeded_db().await;
        db.save_composer(&rich_source_composer(&sid)).await.unwrap();

        let new_id = db.duplicate_session(&sid, None).await.unwrap();
        assert_ne!(new_id, sid);
        mirror_copy_composer(&db, &sid, &new_id, None)
            .await
            .unwrap();

        let copy = db.get_composer(&new_id).await.unwrap();
        assert_eq!(copy.id, new_id, "composer id is the session's identity");
        assert_eq!(copy.session_id, new_id);
        assert_eq!(copy.name, "promo (copy)");
        assert_eq!(copy.pipes.len(), 2);
    }

    #[tokio::test]
    async fn copy_carries_design_and_blanks_artifacts() {
        let (db, _pid, sid) = seeded_db().await;
        db.save_composer(&rich_source_composer(&sid)).await.unwrap();

        let new_id = db.duplicate_session(&sid, None).await.unwrap();
        mirror_copy_composer(&db, &sid, &new_id, None)
            .await
            .unwrap();
        let copy = db.get_composer(&new_id).await.unwrap();

        // Design carried.
        assert_eq!(copy.fps, 24);
        assert_eq!(
            copy.total_generated_frames, 0,
            "a copy has no generation history of its own"
        );
        let cp = &copy.pipes[0];
        // Fresh ids at every level — no shared keys with the source.
        assert_ne!(cp.id, "pipe-a");
        assert_ne!(cp.keyframes[0].id, "kf-a1");
        assert_ne!(cp.keyframes[1].id, "kf-a2");
        assert_ne!(cp.subject_references[0].id, "sr-a1");
        assert_eq!(cp.name, "Pipe A");
        assert_eq!(cp.length_frames, 241);
        assert_eq!(cp.q_value, 19);
        assert_eq!(cp.media_mode, "keyframes");
        assert_eq!(cp.keyframes[0].kind, "url");
        assert_eq!(
            cp.keyframes[0].image_src.as_deref(),
            Some("https://img/a1.png")
        );
        assert_eq!(cp.keyframes[1].kind, "img2img");
        assert_eq!(
            cp.keyframes[1].reference_url.as_deref(),
            Some("https://ref/a2.png")
        );
        assert_eq!(cp.keyframes[1].prompt.as_deref(), Some("make it a dragon"));
        assert_eq!(
            cp.subject_references[0].image_url,
            "https://img/subject.png"
        );
        let pb = &copy.pipes[1];
        assert_eq!(pb.keyframes[0].prompt.as_deref(), Some("a dragon"));
        assert_eq!(pb.media_mode, "reference");

        // Artifacts blanked everywhere in the copy.
        for p in &copy.pipes {
            assert!(p.last_generation.is_none());
            for k in &p.keyframes {
                assert!(k.preview_remote_url.is_none());
                assert!(k.preview_local_path.is_none());
                assert_eq!(k.status, "pending");
                assert!(!k.force_regen);
            }
            for s in &p.subject_references {
                assert!(s.preview_remote_url.is_none());
                assert!(s.preview_local_path.is_none());
                assert_eq!(s.status, "pending");
            }
        }
    }

    #[tokio::test]
    async fn copy_leaves_source_untouched() {
        let (db, _pid, sid) = seeded_db().await;
        db.save_composer(&rich_source_composer(&sid)).await.unwrap();

        let new_id = db.duplicate_session(&sid, None).await.unwrap();
        mirror_copy_composer(&db, &sid, &new_id, None)
            .await
            .unwrap();

        let source = db.get_composer(&sid).await.unwrap();
        assert_eq!(source.id, sid);
        assert_eq!(
            source.pipes[0].id, "pipe-a",
            "source piece ids must not be re-minted"
        );
        assert!(source.pipes[0].last_generation.is_some());
        assert_eq!(
            source.pipes[0].keyframes[1].preview_remote_url.as_deref(),
            Some("https://prov/a2.png"),
            "source previews must survive the copy"
        );
        assert_eq!(source.total_generated_frames, 500);
    }

    #[tokio::test]
    async fn copy_of_source_without_composer_still_succeeds() {
        let (db, pid, sid) = seeded_db().await;
        let new_id = db.duplicate_session(&sid, Some("Custom")).await.unwrap();
        mirror_copy_composer(&db, &sid, &new_id, Some("Custom"))
            .await
            .unwrap();

        let rows = db.list_sessions(&pid).await.unwrap();
        assert!(rows
            .iter()
            .any(|r| r["id"].as_str() == Some(new_id.as_str())));
        // The copy loads as itself: its session row exists, so
        // get_composer's fallback never answers "Untitled Composer".
        let copy = db.get_composer(&new_id).await.unwrap();
        assert_eq!(copy.id, new_id);
        assert_eq!(copy.name, "Custom");
    }

    #[tokio::test]
    async fn copy_of_unknown_source_fails() {
        let (db, _pid, _sid) = seeded_db().await;
        assert!(db.duplicate_session("no-such-session", None).await.is_err());
    }
}
