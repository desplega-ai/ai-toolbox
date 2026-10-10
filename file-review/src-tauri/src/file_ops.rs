use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::State;

/// Snapshot of one open tab pushed from JS via `submit_tab_states`. Used
/// by the close-window flow to dump comments from every open tab without
/// re-reading from disk (which would miss unsaved buffer state).
#[derive(Clone, Debug, serde::Deserialize)]
pub struct TabState {
    pub path: String,
    /// Editor content with comment markers inlined — i.e., what
    /// `serializeComments(tab.doc, tab.comments)` produced on the JS side.
    pub content: String,
}

pub struct AppState {
    pub current_file: Mutex<Option<PathBuf>>,
    /// All file paths supplied on the CLI (in order). Used by JS at startup
    /// to open one tab per path.
    pub initial_files: Mutex<Vec<PathBuf>>,
    /// Snapshot of every currently-open tab pushed by JS. Source of truth
    /// for the close-window comment-export flow when non-empty; falls
    /// back to the single-file disk read when empty (e.g., web mode).
    pub open_tabs: Mutex<Vec<TabState>>,
    pub silent: bool,
    pub json_output: bool,
    pub stdin_mode: bool,
    pub original_content: Mutex<Option<String>>,
}

#[tauri::command]
pub fn read_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn write_file(path: String, content: String) -> Result<(), String> {
    fs::write(&path, content).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_current_file(path: String, state: State<'_, AppState>) -> Result<(), String> {
    let mut current = state.current_file.lock().map_err(|e| e.to_string())?;
    *current = Some(PathBuf::from(path));
    Ok(())
}

#[tauri::command]
pub fn get_current_file(state: State<'_, AppState>) -> Option<String> {
    let current = state.current_file.lock().ok()?;
    current.as_ref().map(|p| p.to_string_lossy().to_string())
}

/// Return all file paths that were passed on the CLI. JS calls this at
/// startup to open one tab per path. Empty if no file args.
#[tauri::command]
pub fn get_initial_files(state: State<'_, AppState>) -> Vec<String> {
    state
        .initial_files
        .lock()
        .ok()
        .map(|v| v.iter().map(|p| p.to_string_lossy().to_string()).collect())
        .unwrap_or_default()
}

/// Replace the in-memory snapshot of open tabs. JS calls this on tab-close
/// and window-close so the close-window handler can dump comments from
/// every open tab.
#[tauri::command]
pub fn submit_tab_states(states: Vec<TabState>, state: State<'_, AppState>) {
    if let Ok(mut open) = state.open_tabs.lock() {
        *open = states;
    }
}

#[tauri::command]
pub fn reveal_in_finder(path: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .args(["-R", &path])
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .args(["/select,", &path])
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        if let Some(parent) = std::path::Path::new(&path).parent() {
            std::process::Command::new("xdg-open")
                .arg(parent)
                .spawn()
                .map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn file_exists(path: String) -> bool {
    std::path::Path::new(&path).exists()
}

/// Markdown files that link to `path`. Walks the disk, so it runs off the main thread.
#[tauri::command]
pub async fn find_backlinks(path: String) -> Result<Vec<crate::backlinks::Backlink>, String> {
    tauri::async_runtime::spawn_blocking(move || crate::backlinks::find_backlinks(&path))
        .await
        .map_err(|e| e.to_string())
}

/// Open a URL or local path with the OS default handler.
pub fn open_with_system(target: &str) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    let mut cmd = std::process::Command::new("open");
    #[cfg(target_os = "linux")]
    let mut cmd = std::process::Command::new("xdg-open");
    #[cfg(target_os = "windows")]
    let mut cmd = {
        let mut c = std::process::Command::new("cmd");
        c.args(["/c", "start", ""]);
        c
    };
    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    return Err(format!("Cannot open {} on this platform", target));

    #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
    cmd.arg(target)
        .spawn()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

/// Schemes the app may hand to the OS. Everything else stays blocked.
pub fn is_external_scheme(scheme: &str) -> bool {
    matches!(scheme, "http" | "https" | "mailto")
}

#[tauri::command]
pub fn open_external(url: String) -> Result<(), String> {
    let parsed = tauri::Url::parse(&url).map_err(|e| e.to_string())?;
    if !is_external_scheme(parsed.scheme()) {
        return Err(format!("Unsupported URL scheme: {}", parsed.scheme()));
    }
    open_with_system(parsed.as_str())
}

#[tauri::command]
pub fn open_path(path: String) -> Result<(), String> {
    let p = std::path::Path::new(&path);
    if !p.is_absolute() {
        return Err(format!("Not an absolute path: {}", path));
    }
    if !p.exists() {
        return Err(format!("File not found: {}", path));
    }
    open_with_system(&path)
}

#[tauri::command]
pub fn is_stdin_mode(state: State<'_, AppState>) -> bool {
    state.stdin_mode
}

#[tauri::command]
pub fn get_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}
